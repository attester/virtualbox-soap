import {
  AccessMode,
  CleanupMode,
  connect,
  DeviceType,
  StorageBus,
  LockType,
  BitmapFormat,
} from "..";
import path from "path";
import assert from "assert";
import fs from "fs";

const expectedScreenshot = fs
  .readFileSync(path.join(__dirname, "./expectedScreenshot.png"))
  .toString("base64");

const wait = (delay: number) =>
  new Promise((resolve) => setTimeout(resolve, delay));

async function test() {
  console.log("connect");
  const websessionManager = await connect();
  console.log("logon");
  const vbox = await websessionManager.logon("", "");
  try {
    console.log("createMachine");
    const machine = await vbox.createMachine(
      "",
      "myAlpineMachine",
      [],
      "Linux_64",
      ""
    );
    try {
      console.log("addStorageController");
      await machine.addStorageController("storage", StorageBus.VirtioSCSI);
      console.log("registerMachine");
      await vbox.registerMachine(machine);
      console.log("getSessionObject");
      const session = await websessionManager.getSessionObject(vbox);
      console.log("lockMachine");
      await machine.lockMachine(session, LockType.Write);
      try {
        console.log("getMachine");
        const sessionMachine = await session.getMachine();
        console.log("openMedium");
        const iso = await vbox.openMedium(
          path.join(__dirname, "software", "alpine.iso"),
          DeviceType.DVD,
          AccessMode.ReadOnly,
          false
        );
        console.log("attachDevice");
        await sessionMachine.attachDevice("storage", 0, 0, DeviceType.DVD, iso);
        console.log("saveSettings");
        await sessionMachine.saveSettings();
      } finally {
        await session.unlockMachine();
      }
      console.log(`Session is ${await session.getState()}`);
      try {
        console.log("launchVMProcess");
        let progress = await machine.launchVMProcess(session, "headless", []);
        await progress.waitForCompletion(-1);
        console.log(`Machine is ${await machine.getState()}`);
        console.log(`Session is ${await session.getState()}`);
        console.log("getConsole");
        const vmConsole = await session.getConsole();
        try {
          console.log("getDisplay");
          const display = await vmConsole.getDisplay();
          console.log("Waiting 15s");
          await wait(15000);
          console.log("getScreenResolution");
          const resolution = await display.getScreenResolution(0);
          console.log(resolution);
          const screenshot = (
            await display.takeScreenShotToArray(
              0,
              resolution.width,
              resolution.height,
              BitmapFormat.PNG
            )
          ).replace(/\s+/g, "");
          if (screenshot === expectedScreenshot) {
            console.log("Correct screenshot!");
          } else {
            fs.writeFileSync(
              path.join(__dirname, "actualScreenshot.png"),
              screenshot,
              { encoding: "base64" }
            );
            console.log(`data:image/png;base64,${screenshot}`);
            assert.fail("Unexpected screenshot!");
          }
          const machineState = await machine.getState();
          console.log(`Machine is ${machineState}`);
          if (machineState !== "Running") {
            throw new Error("Test failed!");
          }
        } finally {
          if ((await machine.getState()) === "Running") {
            console.log("powerDown");
            progress = await vmConsole.powerDown();
            await progress.waitForCompletion(-1);
          }
          console.log(`Machine is ${await machine.getState()}`);
          console.log(`Session is ${await session.getState()}`);
        }
      } finally {
        if ((await session.getState()) === "Locked") {
          console.log("unlockMachine");
          await session.unlockMachine();
        }
      }
    } finally {
      console.log("unregister");
      const media = await machine.unregister(
        CleanupMode.DetachAllReturnHardDisksOnly
      );
      console.log("deleteConfig");
      const progress = await machine.deleteConfig(media);
      await progress.waitForCompletion(-1);
    }
  } finally {
    console.log("logoff");
    await websessionManager.logoff(vbox);
  }
}

(async () => {
  try {
    await test();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
})();
