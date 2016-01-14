# virtualbox-soap

`virtualbox-soap` allows to easily use the [VirtualBox API](https://www.virtualbox.org/sdkref) from [nodejs](https://nodejs.org).
It requires nodejs version 4.2 or later.

It is designed to connect to VirtualBox through the SOAP protocol (over HTTP), which means that the `VBoxWebSrv` executable (which is included with VirtualBox) needs to be started on the machine where VirtualBox is installed.

## Getting started

Install `virtualbox-soap` and `co` from the npm repository:

```bash
npm install virtualbox-soap co
```

Start VBoxWebSrv on your local machine:

```bash
VBoxWebSrv -a null
```

Then you can try and adapt the following code sample to start a virtual machine:

```js
"use strict";
const virtualbox = require("virtualbox");
const co = require("co");

co(function *() {
    try {
        const serverURL = "http://localhost:18083"; // This url is the default one, it can be omitted
        const websessionManager = yield virtualbox(serverURL);
        const vbox = yield websessionManager.logon("username", "password");
        const machine = yield vbox.findMachine("myMachineNameOrId");
        const session = yield websessionManager.getSessionObject(vbox);
        const progress = yield machine.launchVMProcess(session);
        yield progress.waitForCompletion(-1);
        const machineState = yield machine.getState();
        console.log(`The virtual machine is ${machineState}`);
        // ...
    } catch (error) {
        console.error(error + "");
    }
});
```

## Documentation

The API exactly follows the [documentation from VirtualBox](https://www.virtualbox.org/sdkref).
Here are some useful entry points:

* [IWebsessionManager](https://www.virtualbox.org/sdkref/interface_i_websession_manager.html)
* [IVirtualBox](https://www.virtualbox.org/sdkref/interface_i_virtual_box.html)
* [IMachine](https://www.virtualbox.org/sdkref/interface_i_machine.html)
