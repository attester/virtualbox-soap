/*
 * Copyright 2015 Amadeus s.a.s.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
"use strict";

const sax = require("sax");
const fs = require("fs");
const path = require("path");

const xidlParser = function () {
    const saxStream = sax.createStream(true);
    const stack = [];
    const interfaces = Object.create(null);
    const enums = Object.create(null);
    const results = Object.create(null)
    const basicTypes = Object.create(null);

    const checkParent = function (nodeName) {
        return stack[stack.length - 1].name === nodeName;
    };

    const getParentNode = function (nodeName) {
        for (let i = stack.length - 1; i >= 0 ; i--) {
            let curNode = stack[i];
            if (curNode.name === nodeName) {
                return curNode;
            }
        }
        return null;
    };

    const tagHandlers = {
        "idl" : function (node) {},
        "library" : function (node) {
            node.skip = !checkParent("idl");
        },
        "result" : function (node) {
            if (checkParent("library")) {
                const attributes = node.attributes;
                results[attributes.name] = attributes.value;
            } else {
                node.skip = true;
            }
        },
        "if": function (node) {
            node.skip = (node.attributes.target !== "wsdl");
        },
        "interface": function (node) {
            const attributes = node.attributes;
            const name = attributes.name;
            const parentInterfaceName = attributes.extends;
            const parentInterface = parentInterfaceName ? interfaces[parentInterfaceName] || null : null;
            if (parentInterfaceName && !parentInterface && parentInterfaceName !== "$unknown" && parentInterfaceName !== "$errorinfo") {
                throw new Error(`Unknown parent interface: ${parentInterfaceName} for ${name}`);
            }
            const interfaceObject = {
                name: name,
                parent: parentInterface,
                methods: []
            };
            interfaces[name] = interfaceObject;
            node.object = interfaceObject;
        },
        "method" : function (node) {
            const interfaceObject = getParentNode("interface").object;
            const methodObject = {
                name: node.attributes.name,
                in: [],
                out: [],
                returnval: null
            };
            interfaceObject.methods.push(methodObject);
            node.object = methodObject;
        },
        "enum" : function (node) {
            const name = node.attributes.name;
            enums[name] = {
                name: name
            };
        },
        "param" : function (node) {
            const methodObject = getParentNode("method").object;
            const attributes = node.attributes;
            const dir = attributes.dir;
            const paramObject = {
                name: attributes.name,
                type: attributes.type,
                array: attributes.safearray === "yes"
            };
            if (dir === "in") {
                methodObject.in.push(paramObject);
            } else if (dir === "out") {
                methodObject.out.push(paramObject);
            } else if (dir === "return") {
                methodObject.returnval = paramObject;
            } else {
                throw new Error(`Invalid dir: ${dir}`);
            }
        },
        "attribute": function (node) {
            const interfaceObject = getParentNode("interface").object;
            const attributes = node.attributes;
            const name = attributes.name;
            if (name == "midlDoesNotLikeEmptyInterfaces") {
                return;
            }
            const type = attributes.type;
            const baseName = name[0].toUpperCase() + name.slice(1);
            interfaceObject.methods.push({
                name: "get" + baseName,
                in: [],
                out: [],
                returnval: {
                    name: name,
                    type: type,
                    array: attributes.safearray === "yes"
                }
            });
            if (attributes.readonly !== "yes") {
                interfaceObject.methods.push({
                    name: "set" + baseName,
                    in: [{
                        name: name,
                        type: type,
                        array: attributes.safearray === "yes"
                    }],
                    out: [],
                    returnval: null
                });
            }
        }
    };

    saxStream.on("opentag", function (node) {
        const skip = stack.length > 0 ? stack[stack.length - 1].skip : false;
        const tagHandler = tagHandlers[node.name];
        if (tagHandler && !skip) {
            tagHandler(node);
        } else {
            node.skip = true;
        }
        stack.push(node);
    });

    saxStream.on("closetag", function () {
        const node = stack.pop();
    });

    const wrapReturnValue = function (param) {
        let value = `__result.${param.name}`;
        const type = param.type;
        if (interfaces[type]) {
            if (param.array) {
                value = `__result.${param.name} ? __result.${param.name}.map(object => new virtualbox.${type}(this.__client, object)) : []`;
            } else {
                value = `__result.${param.name} ? new virtualbox.${type}(this.__client, __result.${param.name}) : null`;
            }
        }
        return value;
    };

    const unwrapInputValue = function (param) {
        let value = '$' + param.name;
        const type = param.type;
        if (interfaces[type]) {
            if (param.array) {
                value = `${value} ? ${value}.map(object => object.__object) : null`;
            } else {
                value = `${value} ? ${value}.__object : null`;
            }
        }
        return value;
    };

    saxStream.on("end", function () {
        const output = [
`/*
 * Copyright 2015 Amadeus s.a.s.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
"use strict";
const path = require("path");
const soap = require("soap");
const virtualbox = module.exports = function (endpoint) {
    return new Promise((resolve, reject) => {
        soap.createClient(path.join(__dirname, "sdk-files", "vboxwebService.wsdl"), {
            endpoint: endpoint
        }, function (error, client) {
            if (error) {
                reject(error);
            } else {
                resolve(new virtualbox.IWebsessionManager(client.vboxService.vboxServicePort));
            }
        });
    });
};
const errorCodeRegExp = /rc=0x([0-9a-f]{8})/;
const RootClass = class {
    constructor(__client, __object) {
        this.__client = __client;
        this.__object = __object;
    }
    __invoke(name, args) {
        return new Promise((resolve, reject) => {
            this.__client[name](args, (error, result) => {
                if (error) {
                    if (error.root && error.root.Envelope && error.root.Envelope.Body && error.root.Envelope.Body.Fault && error.root.Envelope.Body.Fault.faultstring) {
                        error.message = error.root.Envelope.Body.Fault.faultstring;
                        const errorCodeMatch = errorCodeRegExp.exec(error.message);
                        if (errorCodeMatch) {
                            error.code = parseInt(errorCodeMatch[1], 16);
                        }
                    }
                    reject(error);
                } else {
                    resolve(result);
                }
            });
        });
    }
};`
        ];
        Object.keys(interfaces).forEach(function(interfaceName) {
            const interfaceObject = interfaces[interfaceName];
            const parentClass = interfaceObject.parent ? `virtualbox.${interfaceObject.parent.name}` : "RootClass";
            output.push(`virtualbox.${interfaceObject.name} = class extends ${parentClass} {`);
            interfaceObject.methods.forEach(function (method) {
                const args = method.in.map(param => `${JSON.stringify(param.name)}: ${unwrapInputValue(param)}`);
                const skipThis = interfaceName === "IWebsessionManager";
                if (!skipThis) {
                    args.push(`"_this": this.__object`);
                }
                if (method.returnval) {
                    method.returnval.name = "returnval";
                }
                if (method.returnval && method.out.length > 0) {
                    method.out.push(method.returnval);
                    method.returnval = null;
                }
                let returnBody = "null";
                if (method.returnval) {
                    returnBody = wrapReturnValue(method.returnval);
                } else if (method.out.length > 0) {
                    returnBody = `({${method.out.map(param => `${JSON.stringify(param.name)}: ${wrapReturnValue(param)}`)}})`
                }
                output.push(`    ${method.name}(${method.in.map(param => '$' + param.name).join(', ')}) {`);
                output.push(`        return this.__invoke(${JSON.stringify(`${interfaceObject.name}_${method.name}`)}, {${args.join(",")}}).then(__result => ${returnBody});`);
                output.push(`    }`);
            });
            output.push(`};`);
        });
        Object.keys(results).forEach(function (keyName) {
            output.push(`virtualbox.${keyName} = ${results[keyName]};`);
        });
        fs.writeFile(path.join(__dirname, "index.js"), output.join("\n"));
    });

    return saxStream;
};

const p = xidlParser();
fs.createReadStream(path.join(__dirname, "sdk-files", "VirtualBox.xidl")).pipe(p);
