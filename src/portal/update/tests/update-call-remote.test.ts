// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A device on another computer: update and install must not copy onto this
// machine.

import { describe, expect, it } from "vitest";
import { VERSION } from "#src/shared/config.ts";
import { responseText } from "../../offline/tests/offline-add-producer-pal-test-helpers.ts";
import { SETUP_URL } from "../../offline/offline-setup-hints.ts";
import { answerInstallWhenDeviceOlder } from "../answer-install-when-device-older.ts";
import { answerUpdateCall } from "../update-call.ts";
import { DOWN, fakeDevice, OLD, updateDeps } from "./update-test-helpers.ts";

const HOST = "studio-mac.local:3350";
const INSTALL = {
  name: "ppal-manage",
  args: { action: "install-producer-pal" },
};

describe("answerUpdateCall for a device on another computer", () => {
  it("refuses, and touches neither this machine nor the device", async () => {
    const deps = updateDeps();
    const device = fakeDevice(OLD);
    const response = await answerUpdateCall(
      { action: "update-producer-pal", userLibrary: "/lib" },
      device,
      deps,
      HOST,
    );

    expect(response.isError).toBe(true);
    expect(responseText(response)).toBe(
      `Error: This connector points at another computer (${HOST}), so it can't update Producer Pal there. That needs files copied on Live's computer. Run it from a connector on Live's computer, or set up the device by hand: ${SETUP_URL}`,
    );
    expect(deps.installDevice).not.toHaveBeenCalled();
    expect(deps.installRemoteScript).not.toHaveBeenCalled();
    expect(deps.request).not.toHaveBeenCalled();
    expect(deps.ping).not.toHaveBeenCalled();
    expect(device.connect).not.toHaveBeenCalled();
  });

  it("still updates for this machine when no remote host is given", async () => {
    const response = await answerUpdateCall(
      { action: "update-producer-pal" },
      fakeDevice(OLD),
      updateDeps(),
      null,
    );

    expect(responseText(response)).not.toContain("another computer");
  });
});

describe("answerInstallWhenDeviceOlder for a device on another computer", () => {
  it("refuses when the device is older, saying so, and copies nothing", async () => {
    const deps = updateDeps();
    const device = fakeDevice(OLD);

    await device.connect();

    const response = await answerInstallWhenDeviceOlder(
      { ...INSTALL, manageOffered: true, remoteHost: HOST },
      device,
      deps,
    );
    const text = responseText(response as never);

    expect(response?.isError).toBe(true);
    expect(text).toContain(`another computer (${HOST})`);
    expect(text).toContain("can't install Producer Pal there");
    expect(text).toContain("Producer Pal there is older than this connector.");
    expect(deps.installDevice).not.toHaveBeenCalled();
    expect(deps.installRemoteScript).not.toHaveBeenCalled();
    expect(deps.ping).not.toHaveBeenCalled();
    expect(deps.findUserLibrary).not.toHaveBeenCalled();
  });

  it("leaves the install to the device when it isn't older", async () => {
    const response = await answerInstallWhenDeviceOlder(
      { ...INSTALL, manageOffered: true, remoteHost: HOST },
      fakeDevice(VERSION),
      updateDeps(),
    );

    expect(response).toBeNull();
  });

  it("leaves the call to the offline path when the device can't be reached", async () => {
    const response = await answerInstallWhenDeviceOlder(
      { ...INSTALL, manageOffered: true, remoteHost: HOST },
      fakeDevice(DOWN),
      updateDeps(),
    );

    expect(response).toBeNull();
  });
});
