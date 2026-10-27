// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { type InstalledRemoteScript } from "#src/mcp-server/rpc/remote-script/remote-script-status.ts";
import { ASK_FOR_LIBRARY } from "#src/mcp-server/rpc/remote-script/install/remote-script-install-reply.ts";
import { UserLibraryFolderError } from "#src/mcp-server/rpc/remote-script/user-library/user-library-folder.ts";
import { VERSION } from "#src/shared/config.ts";
import { NOT_RUNNING } from "./offline-test-helpers.ts";
import {
  addProducerPalCall,
  copied,
  DEVICE_PATH,
  happyDeps,
  LIBRARY,
  responseText,
} from "./offline-add-producer-pal-test-helpers.ts";

const INSTALL = 'ppal-manage action "install-producer-pal"';
const SCRIPT_PATH = `${LIBRARY}/Remote Scripts/Producer_Pal`;

/**
 * @param installedVersion - The installed script's version, or null for none
 * @returns The remote script as the library holds it
 */
function scriptIn(installedVersion: string | null): InstalledRemoteScript {
  return {
    path: SCRIPT_PATH,
    installed: installedVersion != null,
    installedVersion,
    installedBuild: null,
    devProbe: false,
  };
}

/**
 * @param overrides - What this test changes
 * @returns Dependencies for a Live whose remote script isn't running
 */
function stoppedDeps(
  overrides: Parameters<typeof happyDeps>[0] = {},
): ReturnType<typeof happyDeps> {
  return happyDeps({
    ping: vi.fn(() => Promise.resolve(NOT_RUNNING)),
    findUserLibrary: vi.fn(() => Promise.resolve(LIBRARY)),
    installedRemoteScript: vi.fn(() => scriptIn(null)),
    ...overrides,
  });
}

describe("add-producer-pal without a running remote script", () => {
  it("installs the device file, adds nothing, and says how to go on", async () => {
    const deps = stoppedDeps();
    const response = await addProducerPalCall(deps);

    expect(response.isError).toBe(true);
    expect(responseText(response)).toBe(
      `Error: nothing was added to the Live Set: adding the device needs the Producer Pal remote script, and it isn't running. The device file is at ${DEVICE_PATH}. Device: installed in the User Library. Two ways forward. (1) Tell the user to open Live and drag the file from the browser (User Library) onto a MIDI track. (2) Finish the remote script setup. Run ${INSTALL} (it installs the remote script to ${SCRIPT_PATH} and the device), then ask the user to restart Live and choose Producer Pal as a Control Surface in Settings → Tempo & MIDI. Then call add-producer-pal again.`,
    );
    expect(deps.installDevice).toHaveBeenCalledWith(
      LIBRARY,
      "/bundle/Producer_Pal.amxd",
    );
    expect(deps.request).not.toHaveBeenCalled();
  });

  it("uses the User Library the call gives", async () => {
    const deps = stoppedDeps();

    await addProducerPalCall(deps, undefined, { userLibrary: " /given " });

    expect(deps.installDevice).toHaveBeenCalledWith(
      "/given",
      expect.any(String),
    );
    expect(deps.findUserLibrary).not.toHaveBeenCalled();
  });

  it("says an installed remote script only needs Live restarted and chosen", async () => {
    const deps = stoppedDeps({
      installedRemoteScript: vi.fn(() => scriptIn(VERSION)),
    });
    const text = responseText(await addProducerPalCall(deps));

    expect(text).toContain(
      `The Producer Pal remote script is installed (${VERSION}, ${SCRIPT_PATH}) but not running. Ask`,
    );
    expect(text).toContain("restart Live if they installed it since");
    expect(text).not.toContain(INSTALL);
  });

  it("says an installed remote script that is out of date should be updated", async () => {
    const deps = stoppedDeps({
      installedRemoteScript: vi.fn(() => scriptIn("1.0.0")),
    });
    const text = responseText(await addProducerPalCall(deps));

    expect(text).toContain(
      `The Producer Pal remote script at ${SCRIPT_PATH} is out of date (1.0.0;`,
    );
    expect(text).toContain(`Run ${INSTALL} to update it`);
  });

  it("reports the device file's state as the add does", async () => {
    const deps = stoppedDeps({
      installDevice: vi.fn(() => copied("current")),
    });

    expect(responseText(await addProducerPalCall(deps))).toContain(
      `Device: already installed and up to date.`,
    );
  });

  it("still answers, with the generic steps, when the script lookup throws after the copy", async () => {
    const deps = stoppedDeps({
      installedRemoteScript: vi.fn(() => {
        throw new Error("disk gone");
      }),
    });
    const response = await addProducerPalCall(deps);
    const text = responseText(response);

    expect(response.isError).toBe(true);
    expect(text).toContain(`The device file is at ${DEVICE_PATH}`);
    expect(text).toContain("nothing was added to the Live Set");
    expect(text).toContain(`Run ${INSTALL}`);
    expect(text).not.toContain("disk gone");
  });

  it("uses the device already there when the update failed, and says why", async () => {
    const deps = stoppedDeps({
      installDevice: vi.fn(() =>
        copied("failed", { error: "EBUSY", detail: "Couldn't install." }),
      ),
      fileExists: vi.fn(() => true),
    });
    const text = responseText(await addProducerPalCall(deps));

    expect(text).toContain(
      `The device file is at ${DEVICE_PATH}. Device: couldn't update the installed device (EBUSY); used the one already there.`,
    );
    expect(text).toContain("nothing was added to the Live Set");
  });

  it("says nothing was added and nothing was copied when the copy failed and no device is there", async () => {
    const deps = stoppedDeps({
      installDevice: vi.fn(() =>
        copied("failed", { error: "EACCES", detail: "Couldn't install." }),
      ),
    });
    const text = responseText(await addProducerPalCall(deps));

    expect(text).toContain(
      "Couldn't install. Cause: EACCES. Nothing was added",
    );
    expect(text).not.toContain("Two ways forward");
  });

  it("asks the user for the path when none is found", async () => {
    const deps = stoppedDeps({
      findUserLibrary: vi.fn(() => Promise.resolve(null)),
    });
    const response = await addProducerPalCall(deps);

    expect(responseText(response)).toBe(
      `Error: couldn't find Live's User Library, so nothing was added. ${ASK_FOR_LIBRARY}`,
    );
    expect(deps.installDevice).not.toHaveBeenCalled();
  });

  it("asks the user for the path when the given one isn't a folder", async () => {
    const deps = stoppedDeps({
      installDevice: () => {
        throw new UserLibraryFolderError("Not a folder: /nope");
      },
    });

    expect(responseText(await addProducerPalCall(deps))).toBe(
      `Error: Not a folder: /nope; nothing was added. ${ASK_FOR_LIBRARY}`,
    );
  });

  it("sends a portal with no bundled device to the install guide, before pinging", async () => {
    const deps = stoppedDeps({ findBundledDevice: () => null });
    const response = await addProducerPalCall(deps);

    expect(responseText(response)).toContain("has no bundled device");
    expect(deps.ping).not.toHaveBeenCalled();
  });
});
