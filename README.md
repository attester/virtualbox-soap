# virtualbox-soap

[![npm](https://img.shields.io/npm/v/virtualbox-soap)](https://www.npmjs.com/package/virtualbox-soap)

`virtualbox-soap` allows to easily use the [VirtualBox API](https://www.virtualbox.org/sdkref) from [nodejs](https://nodejs.org).

It is designed to connect to VirtualBox through the SOAP protocol (over HTTP), which means that the `VBoxWebSrv` executable (which is included with VirtualBox) needs to be started on the machine where VirtualBox is installed.

## Getting started

Install `virtualbox-soap` from the npm repository:

```bash
npm install virtualbox-soap
```

Start VBoxWebSrv on your local machine:

```bash
VBoxWebSrv -a null
```

Then you can try and adapt the following code sample to start a virtual machine:

```js
import * as virtualbox from "virtualbox-soap";

(async function () {
    try {
        const serverURL = "http://localhost:18083"; // This url is the default one, it can be omitted
        const websessionManager = await virtualbox.connect(serverURL);
        const vbox = await websessionManager.logon("username", "password");
        const machine = await vbox.findMachine("myMachineNameOrId");
        const session = await websessionManager.getSessionObject(vbox);
        const progress = await machine.launchVMProcess(session);
        await progress.waitForCompletion(-1);
        const machineState = await machine.getState();
        console.log(`The virtual machine is ${machineState}`);
        // ...
    } catch (error) {
        console.error(error + "");
    }
})();
```

## Documentation

The API exactly follows the [documentation from VirtualBox](https://www.virtualbox.org/sdkref).
Here are some useful entry points:

* [IWebsessionManager](https://www.virtualbox.org/sdkref/interface_i_websession_manager.html)
* [IVirtualBox](https://www.virtualbox.org/sdkref/interface_i_virtual_box.html)
* [IMachine](https://www.virtualbox.org/sdkref/interface_i_machine.html)
