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
  const results = Object.create(null);
  const typesMap = {
    wstring: "string",
    boolean: "boolean",
    short: "number",
    "unsigned short": "number",
    long: "number",
    "long long": "number",
    "unsigned long": "number",
    uuid: "string",
  };

  const checkParent = function (nodeName) {
    return stack[stack.length - 1].name === nodeName;
  };

  const getParentNode = function (nodeName) {
    for (let i = stack.length - 1; i >= 0; i--) {
      let curNode = stack[i];
      if (!nodeName || curNode.name === nodeName) {
        return curNode;
      }
    }
    return null;
  };

  const tagHandlers = {
    idl: function (node) {},
    library: function (node) {
      node.skip = !checkParent("idl");
    },
    application: function (node) {},
    result: function (node) {
      if (checkParent("application")) {
        const attributes = node.attributes;
        const resultInfo = {
          value: attributes.value,
          desc: [],
        };
        node.object = resultInfo;
        results[attributes.name] = resultInfo;
      } else {
        node.skip = true;
      }
    },
    if: function (node) {
      node.skip = node.attributes.target !== "wsdl";
    },
    interface: function (node) {
      const attributes = node.attributes;
      const name = attributes.name;
      const parentInterfaceName = attributes.extends;
      const wsmap = attributes.wsmap;
      if (wsmap === "suppress") {
        node.object = {
          name,
          methods: [],
        };
        return;
      }
      const isStruct = wsmap === "struct";
      const parentInterface = parentInterfaceName
        ? interfaces[parentInterfaceName] || null
        : null;
      if (
        parentInterfaceName &&
        !parentInterface &&
        parentInterfaceName !== "$unknown" &&
        parentInterfaceName !== "$errorinfo"
      ) {
        throw new Error(
          `Unknown parent interface: ${parentInterfaceName} for ${name}`
        );
      } else if (isStruct && parentInterface) {
        throw new Error(
          `Unsupported struct with parent interface ${parentInterfaceName}`
        );
      }
      const interfaceObject = isStruct
        ? {
            name,
            desc: [],
            attributes: [],
          }
        : {
            name: name,
            global: wsmap === "global",
            desc: [],
            parent: parentInterface,
            methods: [],
          };
      interfaces[name] = interfaceObject;
      node.object = interfaceObject;
    },
    method: function (node) {
      const interfaceObject = getParentNode("interface").object;
      const methodObject = {
        name: node.attributes.name,
        desc: [],
        in: [],
        out: [],
        returnval: null,
      };
      interfaceObject.methods.push(methodObject);
      node.object = methodObject;
    },
    const: function (node) {
      const enumObject = getParentNode("enum").object;
      const name = node.attributes.name;
      const value = node.attributes.value;
      const constObject = {
        value: value,
        desc: [],
      };
      enumObject.values[name] = constObject;
      node.object = constObject;
    },
    desc: function (node) {
      const parentObject = getParentNode().object;
      const desc = parentObject ? parentObject.desc : null;
      if (desc) {
        node.content = desc;
      }
    },
    enum: function (node) {
      const name = node.attributes.name;
      node.object = enums[name] = {
        name: name,
        desc: [],
        values: {},
      };
    },
    param: function (node) {
      const methodObject = getParentNode("method").object;
      const attributes = node.attributes;
      const dir = attributes.dir;
      const paramObject = {
        name: attributes.name,
        type: attributes.type,
        array: attributes.safearray === "yes",
        desc: [],
      };
      node.object = paramObject;
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
    attribute: function (node) {
      const interfaceObject = getParentNode("interface").object;
      const attributes = node.attributes;
      const name = attributes.name;
      if (name == "midlDoesNotLikeEmptyInterfaces") {
        return;
      }
      const type = attributes.type;
      if (interfaceObject.attributes) {
        const attributeObject = {
          name,
          desc: [],
          returnval: {
            name: name,
            type: type,
            array: attributes.safearray === "yes",
          },
        };
        node.object = attributeObject;
        interfaceObject.attributes.push(attributeObject);
      } else {
        const baseName = name[0].toUpperCase() + name.slice(1);
        const getterObject = {
          name: "get" + baseName,
          in: [],
          out: [],
          desc: [],
          returnval: {
            name: name,
            type: type,
            array: attributes.safearray === "yes",
          },
        };
        node.object = getterObject;
        interfaceObject.methods.push(getterObject);
        if (attributes.readonly !== "yes") {
          interfaceObject.methods.push({
            name: "set" + baseName,
            in: [
              {
                name: name,
                type: type,
                array: attributes.safearray === "yes",
              },
            ],
            out: [],
            returnval: null,
          });
        }
      }
    },
  };

  saxStream.on("opentag", function (node) {
    const lastStackNode = stack.length > 0 ? stack[stack.length - 1] : null;
    if (lastStackNode && lastStackNode.content) {
      node.content = [];
      lastStackNode.content.push(node);
    }
    const skip = lastStackNode ? lastStackNode.skip : false;
    const tagHandler = tagHandlers[node.name];
    if (tagHandler && !skip) {
      tagHandler(node);
    } else {
      node.skip = true;
    }
    stack.push(node);
  });

  saxStream.on("text", function (text) {
    const lastStackNode = stack.length > 0 ? stack[stack.length - 1] : null;
    if (lastStackNode && lastStackNode.content) {
      lastStackNode.content.push(text);
    }
  });

  saxStream.on("closetag", function () {
    stack.pop();
  });

  const wrapReturnValue = function (param) {
    let value = `__result.${param.name}`;
    const type = param.type;
    const interfaceObject = interfaces[type];
    if (interfaceObject && interfaceObject.methods) {
      if (param.array) {
        value = `(__result && __result.${param.name}) ? __result.${param.name}.map((object: any) => new ${type}(this.__client, object)) : []`;
      } else {
        value = `(__result && __result.${param.name}) ? new ${type}(this.__client, __result.${param.name}) : null`;
      }
    }
    return `(${value}) as ${getParamType(param)}`;
  };

  const unwrapInputValue = function (param) {
    let value = "$" + param.name;
    const type = param.type;
    if (interfaces[type]) {
      if (param.array) {
        value = `${value} ? ${value}.map((object: any) => object.__object) : null`;
      } else {
        value = `${value} ? (${value} as any).__object : null`;
      }
    }
    return value;
  };

  const getParamType = function (param) {
    const type = param.type;
    let res = typesMap[type];
    if (!res && (interfaces[type] || enums[type])) {
      res = type;
    }
    return `${res || "any"}${param.array ? "[]" : ""}`;
  };

  const objectKeysNonEmpty = function (map) {
    const array = Object.keys(map);
    if (array.length === 0) {
      throw new Error("Expected a non-empty object!");
    }
    return array;
  };

  const generateComment = function (desc) {
    if (!desc) {
      return "";
    }
    return desc
      .map(function (node) {
        if (typeof node === "string") {
          return node;
        } else if (node.name === "link") {
          let to = node.attributes.to;
          to = to.replace(/^#/, "");
          return to;
        } else if (node.name === "li") {
          return `- ${generateComment(node.content).trimLeft()}`;
        } else if (node.name === "see") {
          return `See: ${generateComment(node.content)}`;
        } else if (node.name === "note") {
          if (node.attributes.internal === "yes") {
            return "";
          }
          return `Note: ${generateComment(node.content)}`;
        } else if (node.name === "result") {
          return `Error ${node.attributes.name}: ${generateComment(
            node.content
          )}`;
        } else {
          return `${generateComment(node.content)}`;
        }
      })
      .join("")
      .replace(/\s*@\w+\s*/g, " ");
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
import * as path from "path";
import * as soap from "soap";
export async function connect (endpoint?: string) {
    const client: any = await soap.createClientAsync(path.join(__dirname, "sdk-files", "vboxwebService.wsdl"), {
        endpoint: endpoint
    });
    return new IWebsessionManager(client.vboxService.vboxServicePort);
}
const errorCodeRegExp = /rc=0x([0-9a-f]{8})/;
export class RootClass {
    constructor(protected __client: any, protected __object?: any) {}
    protected __invoke(name: string, args: any): Promise<any> {
        return new Promise((resolve, reject) => {
            this.__client[name](args, (error: any, result: any) => {
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
}`,
    ];
    objectKeysNonEmpty(enums).forEach(function (keyName) {
      const enumInfo = enums[keyName];
      const values = enumInfo.values;
      const comment = generateComment(enumInfo.desc);
      if (comment) {
        output.push("/**", comment, "*/");
      }
      output.push(`export const enum ${keyName} {`);
      objectKeysNonEmpty(values).forEach(function (enumName) {
        const constObject = values[enumName];
        const comment = generateComment(constObject.desc);
        if (comment) {
          output.push("/**", comment, "*/");
        }
        output.push(`${enumName} = ${JSON.stringify(enumName)},`);
      });
      output.push(`}`);
    });
    objectKeysNonEmpty(interfaces).forEach(function (interfaceName) {
      const interfaceObject = interfaces[interfaceName];
      const comment = generateComment(interfaceObject.desc);
      if (comment) {
        output.push("/**", comment, "*/");
      }
      if (interfaceObject.attributes) {
        output.push(`export interface ${interfaceObject.name} {`);
        interfaceObject.attributes.forEach(function (attribute) {
          output.push(`/** ${generateComment(attribute.desc)} */`);
          output.push(
            `${attribute.name}: ${getParamType(attribute.returnval)};`
          );
        });
        output.push(`}`);
      } else {
        const parentClass = interfaceObject.parent
          ? interfaceObject.parent.name
          : "RootClass";
        output.push(
          `export class ${interfaceObject.name} extends ${parentClass} {`
        );
        interfaceObject.methods.forEach(function (method) {
          const args = method.in.map(
            (param) =>
              `${JSON.stringify(param.name)}: ${unwrapInputValue(param)}`
          );
          const skipThis = interfaceObject.global;
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
          let returnComment = "";
          if (method.returnval) {
            returnBody = wrapReturnValue(method.returnval);
            returnComment = generateComment(method.returnval.desc);
          } else if (method.out.length > 0) {
            returnBody = `({${method.out.map(
              (param) =>
                `${JSON.stringify(param.name)}: ${wrapReturnValue(param)}`
            )}})`;
            returnComment = `Object with the following properties: \n${method.out
              .map(
                (param) =>
                  `${JSON.stringify(param.name)} ${generateComment(param.desc)}`
              )
              .join("\n")}`;
          }
          const comment = generateComment(method.desc);
          output.push(
            "/**",
            comment,
            ...method.in.map(
              (param) => `@param ${param.name} ${generateComment(param.desc)}`
            ),
            returnComment ? `@return ${returnComment}` : "",
            "*/"
          );
          output.push(
            `    ${method.name}(${method.in
              .map((param) => `$${param.name}: ${getParamType(param)}`)
              .join(", ")}) {`
          );
          output.push(
            `        return this.__invoke(${JSON.stringify(
              `${interfaceObject.name}_${method.name}`
            )}, {${args.join(",")}}).then(__result => ${returnBody});`
          );
          output.push(`    }`);
        });
        output.push(`}`);
      }
    });
    objectKeysNonEmpty(results).forEach(function (keyName) {
      const resultInfo = results[keyName];
      const comment = generateComment(resultInfo.desc);
      if (comment) {
        output.push("/**", comment, "*/");
      }
      output.push(`export const ${keyName} = ${resultInfo.value};`);
    });
    fs.writeFileSync(path.join(__dirname, "index.ts"), output.join("\n"));
  });

  return saxStream;
};

const p = xidlParser();
fs.createReadStream(path.join(__dirname, "sdk-files", "VirtualBox.xidl")).pipe(
  p
);
