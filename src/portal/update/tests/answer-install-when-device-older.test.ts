// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi, type Mock } from "vitest";
import { VERSION } from "#src/shared/config.ts";
import { type OfflineDeps } from "../../offline/offline-deps.ts";
import { responseText } from "../../offline/tests/offline-add-producer-pal-test-helpers.ts";
import { answerInstallWhenDeviceOlder } from "../answer-install-when-device-older.ts";
import { DOWN, fakeDevice, OLD, updateDeps } from "./update-test-helpers.ts";

const INSTALL = { action: "install-remote-script" };

/** @returns An install that succeeds */
function installs(): Mock<OfflineDeps["installRemoteScript"]> {
  return vi.fn(() =>
    Promise.resolve({
      installed: true as const,
      version: VERSION,
      path: "/lib/Remote Scripts/Producer_Pal",
    }),
  );
}

/**
 * A device that has answered once, as the bridge's connection has by the time a
 * tool call arrives.
 * @param answers - What successive connects find
 * @returns The device
 */
async function connectedDevice(
  ...answers: Parameters<typeof fakeDevice>
): Promise<ReturnType<typeof fakeDevice>> {
  const device = fakeDevice(...answers);

  await device.connect();

  return device;
}

describe("answerInstallWhenDeviceOlder", () => {
  it("installs the portal's script when the device is older", async () => {
    const installRemoteScript = installs();
    const response = await answerInstallWhenDeviceOlder(
      {
        name: "ppal-manage",
        args: { ...INSTALL, userLibrary: "/lib" },
        manageOffered: true,
      },
      await connectedDevice(OLD),
      updateDeps({ installRemoteScript }),
    );

    expect(response?.isError).toBeUndefined();
    expect(responseText(response as never)).toContain(`version:"${VERSION}"`);
    expect(installRemoteScript).toHaveBeenCalledWith("/lib");
  });

  it("reads the device's version afresh, in case it was updated by hand", async () => {
    const installRemoteScript = installs();
    const device = await connectedDevice(OLD, VERSION);
    const response = await answerInstallWhenDeviceOlder(
      { name: "ppal-manage", args: INSTALL, manageOffered: true },
      device,
      updateDeps({ installRemoteScript }),
    );

    expect(response).toBeNull();
    expect(device.reset).toHaveBeenCalledTimes(1);
    expect(installRemoteScript).not.toHaveBeenCalled();
  });

  it("connects first when the version isn't known yet, and answers for an older device", async () => {
    const installRemoteScript = installs();
    const device = fakeDevice(OLD);
    const response = await answerInstallWhenDeviceOlder(
      {
        name: "ppal-manage",
        args: { ...INSTALL, userLibrary: "/lib" },
        manageOffered: true,
      },
      device,
      updateDeps({ installRemoteScript }),
    );

    expect(device.connect).toHaveBeenCalled();
    expect(response?.isError).toBeUndefined();
    expect(installRemoteScript).toHaveBeenCalledWith("/lib");
  });

  it("connects first when the version isn't known yet, and forwards for the same version", async () => {
    const installRemoteScript = installs();
    const device = fakeDevice(VERSION);
    const response = await answerInstallWhenDeviceOlder(
      { name: "ppal-manage", args: INSTALL, manageOffered: true },
      device,
      updateDeps({ installRemoteScript }),
    );

    expect(device.connect).toHaveBeenCalledTimes(1);
    expect(response).toBeNull();
    expect(installRemoteScript).not.toHaveBeenCalled();
  });

  it("leaves the call to the offline path when the first connect fails", async () => {
    const response = await answerInstallWhenDeviceOlder(
      { name: "ppal-manage", args: INSTALL, manageOffered: true },
      fakeDevice(DOWN),
      updateDeps(),
    );

    expect(response).toBeNull();
  });

  it.each([
    ["the same version", VERSION],
    ["a newer version", "99.0.0"],
    ["an unknown version", undefined],
  ])("leaves the call to the device at %s", async (_why, version) => {
    const installRemoteScript = installs();
    const response = await answerInstallWhenDeviceOlder(
      { name: "ppal-manage", args: INSTALL, manageOffered: true },
      await connectedDevice(version),
      updateDeps({ installRemoteScript }),
    );

    expect(response).toBeNull();
    expect(installRemoteScript).not.toHaveBeenCalled();
  });

  it.each([
    [
      "ppal-manage isn't offered",
      "ppal-manage",
      "install-remote-script",
      false,
    ],
    ["another tool", "ppal-connect", "install-remote-script", true],
    ["another action", "ppal-manage", "update-producer-pal", true],
  ])("leaves the call alone when %s", async (_why, name, action, offered) => {
    const device = await connectedDevice(OLD);
    const response = await answerInstallWhenDeviceOlder(
      { name, args: { action }, manageOffered: offered },
      device,
      updateDeps(),
    );

    expect(response).toBeNull();
    expect(device.reset).not.toHaveBeenCalled();
  });

  it("leaves the call to the offline path when the device can't be reached", async () => {
    const response = await answerInstallWhenDeviceOlder(
      { name: "ppal-manage", args: INSTALL, manageOffered: true },
      await connectedDevice(OLD, DOWN),
      updateDeps(),
    );

    expect(response).toBeNull();
  });

  it("returns the install's own error, as the offline path does", async () => {
    const response = await answerInstallWhenDeviceOlder(
      { name: "ppal-manage", args: INSTALL, manageOffered: true },
      await connectedDevice(OLD),
      updateDeps({
        installRemoteScript: () =>
          Promise.resolve({
            installed: false,
            error:
              "couldn't find Live's User Library, so nothing was installed.",
          }),
      }),
    );

    expect(response?.isError).toBe(true);
    expect(responseText(response as never)).toBe(
      "Error: couldn't find Live's User Library, so nothing was installed.",
    );
  });

  it("reports an install that threw", async () => {
    const response = await answerInstallWhenDeviceOlder(
      { name: "ppal-manage", args: INSTALL, manageOffered: true },
      await connectedDevice(OLD),
      updateDeps({
        installRemoteScript: () => Promise.reject(new Error("disk gone")),
      }),
    );

    expect(response?.isError).toBe(true);
    expect(responseText(response as never)).toBe("Error: disk gone");
  });

  it("refuses a bad argument as the device would", async () => {
    const response = await answerInstallWhenDeviceOlder(
      {
        name: "ppal-manage",
        args: { ...INSTALL, userLibrary: 7 },
        manageOffered: true,
      },
      await connectedDevice(OLD),
      updateDeps(),
    );

    expect(responseText(response as never)).toBe(
      "Error: userLibrary must be a string",
    );
  });
});
