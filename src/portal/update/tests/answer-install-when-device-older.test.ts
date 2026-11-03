// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { tmpdir } from "node:os";
import { describe, expect, it, vi, type Mock } from "vitest";
import { VERSION } from "#src/shared/config.ts";
import { ASK_FOR_LIBRARY } from "#src/mcp-server/rpc/remote-script/install/remote-script-install-reply.ts";
import { type OfflineDeps } from "../../offline/offline-deps.ts";
import { NOT_RUNNING } from "../../offline/tests/offline-test-helpers.ts";
import { responseText } from "../../offline/tests/offline-add-producer-pal-test-helpers.ts";
import { answerInstallWhenDeviceOlder } from "../answer-install-when-device-older.ts";
import { DOWN, fakeDevice, OLD, updateDeps } from "./update-test-helpers.ts";

const INSTALL = { action: "install-producer-pal" };
const RETIRED = { action: "install-remote-script" };
const LIBRARY = tmpdir();

/** @returns An install that succeeds */
function installs(): Mock<OfflineDeps["installRemoteScript"]> {
  return vi.fn(() => ({
    status: "installed" as const,
    version: VERSION,
    path: "/lib/Remote Scripts/Producer_Pal",
  }));
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
  it.each([
    ["the new name", INSTALL],
    ["the retired name, which an older device advertises", RETIRED],
  ])(
    "installs the portal's script and device when the device is older, under %s",
    async (_name, action) => {
      const installRemoteScript = installs();
      const deps = updateDeps({ installRemoteScript });
      const response = await answerInstallWhenDeviceOlder(
        {
          name: "ppal-manage",
          args: { ...action, userLibrary: LIBRARY },
          manageOffered: true,
        },
        await connectedDevice(OLD),
        deps,
      );
      const text = responseText(response as never);

      expect(response?.isError).toBeUndefined();
      expect(text).toContain(`version:"${VERSION}"`);
      expect(text).toContain("device:{status:");
      expect(installRemoteScript).toHaveBeenCalledWith(LIBRARY);
      expect(deps.installDevice).toHaveBeenCalledWith(
        LIBRARY,
        expect.any(String),
      );
    },
  );

  it("doesn't send the user to add-producer-pal, since Producer Pal is running", async () => {
    const response = await answerInstallWhenDeviceOlder(
      {
        name: "ppal-manage",
        args: { ...INSTALL, userLibrary: LIBRARY },
        manageOffered: true,
      },
      await connectedDevice(OLD),
      updateDeps({ installRemoteScript: installs() }),
    );

    expect(responseText(response as never)).not.toContain("add-producer-pal");
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
        args: { ...INSTALL, userLibrary: LIBRARY },
        manageOffered: true,
      },
      device,
      updateDeps({ installRemoteScript }),
    );

    expect(device.connect).toHaveBeenCalled();
    expect(response?.isError).toBeUndefined();
    expect(installRemoteScript).toHaveBeenCalledWith(LIBRARY);
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
    ["another tool", "ppal-connect", "install-producer-pal", true],
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
        ping: () => Promise.resolve(NOT_RUNNING),
        findUserLibrary: () => Promise.resolve(null),
      }),
    );

    expect(response?.isError).toBe(true);
    expect(responseText(response as never)).toBe(
      `Error: couldn't find Live's User Library, so nothing was installed. ${ASK_FOR_LIBRARY}`,
    );
  });

  it("reports both files when one of them fails", async () => {
    const response = await answerInstallWhenDeviceOlder(
      {
        name: "ppal-manage",
        args: { ...INSTALL, userLibrary: LIBRARY },
        manageOffered: true,
      },
      await connectedDevice(OLD),
      updateDeps({
        installRemoteScript: () => ({ ok: false, detail: "EACCES" }),
      }),
    );

    expect(response?.isError).toBeUndefined();
    expect(responseText(response as never)).toContain(
      'remoteScript:{ok:false,detail:"EACCES"}',
    );
    expect(responseText(response as never)).toContain(
      "Only the device was installed",
    );
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
