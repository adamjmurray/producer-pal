// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { ASK_FOR_LIBRARY } from "#src/mcp-server/rpc/remote-script/install/remote-script-install-reply.ts";
import { UserLibraryFolderError } from "#src/mcp-server/rpc/remote-script/user-library/user-library-folder.ts";
import { UPDATE_PORTAL_ADVICE, VERSION } from "#src/shared/config.ts";
import {
  copied,
  DEVICE_PATH,
  LIBRARY,
  responseText,
} from "../../offline/tests/offline-add-producer-pal-test-helpers.ts";
import {
  NOT_RUNNING,
  RUNNING,
} from "../../offline/tests/offline-test-helpers.ts";
import {
  DOWN,
  fakeDevice,
  type FakeDevice,
  OLD,
  updateCall,
  updateDeps,
} from "./update-test-helpers.ts";

/** @returns An old device, which a refused call connects to once */
function oldDevice(): FakeDevice {
  return fakeDevice(OLD);
}

describe("update-producer-pal", () => {
  it("copies the device, swaps it by path and answers with both versions and the track", async () => {
    const device = fakeDevice(OLD, VERSION);
    const deps = updateDeps();
    const response = await updateCall(device, deps);

    expect(response.isError).toBeUndefined();
    expect(responseText(response)).toBe(
      `{device:{from:"${OLD}",to:"${VERSION}"},track:{path:"t3",name:"3-MIDI"},nextSteps:"Call ppal-connect next."}`,
    );
    expect(deps.installDevice).toHaveBeenCalledWith(
      LIBRARY,
      "/bundle/Producer_Pal.amxd",
    );
    expect(vi.mocked(deps.request).mock.calls[0]?.[0]).toStrictEqual({
      method: "POST",
      route: "/replace-producer-pal",
      body: { path: DEVICE_PATH },
      expiresInMs: 20_000,
    });
  });

  it("asks the device afresh, then tells the client to re-list tools once the new one answers", async () => {
    const device = fakeDevice(OLD, VERSION);

    await updateCall(device);

    expect(device.reset.mock.invocationCallOrder[0]).toBeLessThan(
      device.connect.mock.invocationCallOrder[0] as number,
    );
    expect(device.toolsChanged).toHaveBeenCalledTimes(1);
    expect(device.toolsChanged.mock.invocationCallOrder[0]).toBeGreaterThan(
      device.connect.mock.invocationCallOrder.at(-1) as number,
    );
  });

  it("waits out an old server that still answers and a gap with none", async () => {
    const device = fakeDevice(OLD, OLD, DOWN, DOWN, VERSION);
    const deps = updateDeps();
    const response = await updateCall(device, deps);

    expect(responseText(response)).toContain(`to:"${VERSION}"`);
    expect(deps.sleep).toHaveBeenCalledTimes(3);
  });

  it("names the track only when the remote script does", async () => {
    const deps = updateDeps({
      request: vi.fn(() =>
        Promise.resolve({ available: true as const, status: 200, body: {} }),
      ),
    });
    const response = await updateCall(fakeDevice(OLD, VERSION), deps);

    expect(responseText(response)).toBe(
      `{device:{from:"${OLD}",to:"${VERSION}"},nextSteps:"Call ppal-connect next."}`,
    );
  });

  it("prefers the User Library the call gives", async () => {
    const deps = updateDeps();

    await updateCall(fakeDevice(OLD, VERSION), deps, " /given ");

    expect(deps.installDevice).toHaveBeenCalledWith(
      "/given",
      expect.any(String),
    );
  });
});

describe("update-producer-pal when there is nothing to update", () => {
  it("sends a device that isn't running to the add path, touching nothing", async () => {
    const deps = updateDeps({
      ping: vi.fn(() => Promise.resolve(NOT_RUNNING)),
    });
    const response = await updateCall(fakeDevice(DOWN), deps);

    expect(response.isError).toBe(true);
    expect(responseText(response)).toContain("Cannot connect to Ableton Live");
    expect(responseText(response)).toContain("add-producer-pal");
    expect(deps.installDevice).not.toHaveBeenCalled();
    expect(deps.request).not.toHaveBeenCalled();
  });

  it("says so, as a success, when the device is already this version", async () => {
    const deps = updateDeps();
    const response = await updateCall(fakeDevice(VERSION), deps);

    expect(response.isError).toBeUndefined();
    expect(responseText(response)).toBe(
      `Producer Pal is already ${VERSION}, the version this connector ships. Nothing to update.`,
    );
    expect(deps.ping).not.toHaveBeenCalled();
    expect(deps.installDevice).not.toHaveBeenCalled();
  });

  it("refuses a device newer than the portal, and says to update the portal", async () => {
    const deps = updateDeps();
    const response = await updateCall(fakeDevice("99.0.0"), deps);

    expect(response.isError).toBe(true);
    expect(responseText(response)).toBe(
      `Error: the running Producer Pal (99.0.0) is newer than this portal (${VERSION}), so there is nothing to update to. Nothing was changed. ${UPDATE_PORTAL_ADVICE}`,
    );
    expect(deps.installDevice).not.toHaveBeenCalled();
  });

  it("refuses when the device doesn't say which version it is", async () => {
    const deps = updateDeps();
    const response = await updateCall(fakeDevice(undefined), deps);

    expect(response.isError).toBe(true);
    expect(responseText(response)).toContain(
      "couldn't tell which version of Producer Pal is running, so nothing was changed",
    );
    expect(deps.installDevice).not.toHaveBeenCalled();
  });
});

describe("update-producer-pal before anything changes", () => {
  it("says a portal with no bundled device has nothing to update with", async () => {
    const deps = updateDeps({ findBundledDevice: () => null });
    const response = await updateCall(oldDevice(), deps);

    expect(response.isError).toBe(true);
    expect(responseText(response)).toBe(
      "Error: this Producer Pal install has no bundled device, so nothing was changed. Tell the user to install it by hand: https://producer-pal.org/installation",
    );
    expect(deps.ping).not.toHaveBeenCalled();
  });

  it("needs the remote script, and says nothing changed", async () => {
    const deps = updateDeps({ ping: () => Promise.resolve(NOT_RUNNING) });
    const response = await updateCall(oldDevice(), deps);
    const text = responseText(response);

    expect(response.isError).toBe(true);
    expect(text).toContain(
      "remote script isn't running, and updating the device needs it, so nothing was changed",
    );
    expect(text).toContain("Then call update-producer-pal again.");
    expect(deps.installDevice).not.toHaveBeenCalled();
    expect(deps.request).not.toHaveBeenCalled();
  });

  it("sends an outdated remote script to be updated first", async () => {
    const deps = updateDeps({
      ping: () => Promise.resolve({ ...RUNNING, scriptVersion: "1.0.0" }),
    });
    const text = responseText(await updateCall(oldDevice(), deps));

    expect(text).toContain("out of date (running 1.0.0");
    expect(text).toContain(
      "Nothing was changed. Call update-producer-pal again after the user restarts Live.",
    );
    expect(deps.installDevice).not.toHaveBeenCalled();
  });

  it("asks the user when no User Library can be found", async () => {
    const deps = updateDeps({ ping: () => Promise.resolve(RUNNING) });
    const response = await updateCall(oldDevice(), deps);

    expect(responseText(response)).toBe(
      `Error: couldn't find Live's User Library, so nothing was changed. ${ASK_FOR_LIBRARY}`,
    );
  });

  it("asks the user when the path isn't a User Library folder", async () => {
    const deps = updateDeps({
      installDevice: () => {
        throw new UserLibraryFolderError("not a folder: /nope");
      },
    });
    const response = await updateCall(oldDevice(), deps);

    expect(responseText(response)).toBe(
      `Error: not a folder: /nope; nothing was changed. ${ASK_FOR_LIBRARY}`,
    );
    expect(deps.request).not.toHaveBeenCalled();
  });

  it("says nothing changed when the bundled device can't be read", async () => {
    const deps = updateDeps({
      installDevice: () => {
        throw new Error("The bundled device can't be read: gone");
      },
    });
    const response = await updateCall(oldDevice(), deps);

    expect(responseText(response)).toBe(
      "Error: The bundled device can't be read: gone. Nothing was changed.",
    );
  });

  it("refuses when the file can't be replaced, and says it may be in use", async () => {
    const deps = updateDeps({
      installDevice: () =>
        copied("failed", { error: "EBUSY: resource busy", changed: false }),
    });
    const response = await updateCall(oldDevice(), deps);

    expect(response.isError).toBe(true);
    expect(responseText(response)).toBe(
      "Error: couldn't copy the new device into the User Library (EBUSY: resource busy). The file may be in use by Live. Nothing in the Live Set was changed.",
    );
    expect(deps.request).not.toHaveBeenCalled();
  });
});

describe("update-producer-pal when the file to load isn't newer", () => {
  it.each([
    ["the same version as", OLD],
    ["an older version than", "2.3.0"],
  ])(
    "refuses a shipped device with %s the running one",
    async (_why, shipped) => {
      const deps = updateDeps({
        installDevice: () =>
          copied("current", {
            bundledVersion: shipped,
            previousVersion: shipped,
          }),
      });
      const response = await updateCall(oldDevice(), deps);

      expect(response.isError).toBe(true);
      expect(responseText(response)).toBe(
        `Error: the device this portal ships (${shipped}) isn't newer than the running one (${OLD}), so there is nothing to update to. Nothing in the Live Set was changed.`,
      );
      expect(deps.request).not.toHaveBeenCalled();
    },
  );

  it("refuses a shipped device that names no version", async () => {
    const deps = updateDeps({ installDevice: () => copied("installed") });
    const response = await updateCall(oldDevice(), deps);

    expect(response.isError).toBe(true);
    expect(responseText(response)).toBe(
      `Error: the device this portal ships names no version, so it can't be confirmed as newer than the running one (${OLD}). Nothing in the Live Set was changed.`,
    );
    expect(deps.request).not.toHaveBeenCalled();
  });
});

describe("update-producer-pal when the User Library holds another device", () => {
  it("loads a newer one than the running device, and says the portal is older", async () => {
    const deps = updateDeps({
      installDevice: () =>
        copied("skipped", {
          previousVersion: "9.0.0",
          bundledVersion: VERSION,
        }),
    });
    const response = await updateCall(fakeDevice(OLD, "9.0.0"), deps);

    expect(response.isError).toBeUndefined();
    expect(responseText(response)).toBe(
      `{device:{from:"${OLD}",to:"9.0.0"},track:{path:"t3",name:"3-MIDI"},note:"loaded the device already in the User Library (9.0.0), which is newer than this portal's (${VERSION}). ${UPDATE_PORTAL_ADVICE}",nextSteps:"Call ppal-connect next."}`,
    );
    expect(deps.request).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["isn't newer than the running device", "2.3.0"],
    ["names no version", undefined],
  ])("leaves one that %s alone", async (_why, previousVersion) => {
    const deps = updateDeps({
      installDevice: () => copied("skipped", { previousVersion }),
    });
    const response = await updateCall(oldDevice(), deps);

    expect(response.isError).toBe(true);
    expect(responseText(response)).toContain(
      `(${previousVersion ?? "unknown version"}) isn't the one this portal ships and isn't newer than the running one (${OLD}), so it was left alone. Nothing was changed.`,
    );
    expect(deps.request).not.toHaveBeenCalled();
  });
});
