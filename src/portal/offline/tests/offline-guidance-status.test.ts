// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { type RemoteScriptPing } from "#src/mcp-server/rpc/remote-script/remote-script-client.ts";
import { type InstalledRemoteScript } from "#src/mcp-server/rpc/remote-script/remote-script-status.ts";
import { VERSION } from "#src/shared/config.ts";
import { type DeviceFileStatus } from "../../setup/device-file-status.ts";
import { type OfflineDeps } from "../offline-deps.ts";
import { offlineGuidance } from "../offline-guidance.ts";
import { SETUP_URL } from "../offline-setup-hints.ts";
import {
  fakeOfflineDeps,
  NOT_RUNNING,
  RUNNING,
} from "./offline-test-helpers.ts";

const LIBRARY = "/lib";
const SCRIPT_PATH = "/lib/Remote Scripts/Producer_Pal";
const DEVICE_PATH =
  "/lib/Presets/MIDI Effects/Max MIDI Effect/Producer_Pal.amxd";

const HEAD = `❌ Cannot connect to Ableton Live.

Ensure Ableton Live 12.3+ is running with the Producer Pal Max for Live device loaded.
Tell the user to check ${SETUP_URL} for setup instructions.`;
const FOOT = `\n\n(Producer Pal ${VERSION})`;
const INSTALL = 'ppal-manage action "install-remote-script"';
const ADD = 'ppal-manage action "add-producer-pal"';
const RESTART =
  "ask the user to restart Live and choose Producer Pal as a Control Surface in Settings → Link, Tempo & MIDI";
const NEW_TRACK = "to a new MIDI track";

/**
 * @param installedVersion - The installed script's version
 * @returns A script installed in the library
 */
function script(installedVersion: string | null): InstalledRemoteScript {
  return { path: SCRIPT_PATH, installed: true, installedVersion };
}

const NO_SCRIPT: InstalledRemoteScript = {
  path: SCRIPT_PATH,
  installed: false,
  installedVersion: null,
};

/**
 * @param state - How the installed device compares with the bundled one
 * @param extra - Versions
 * @returns A device file status
 */
function device(
  state: DeviceFileStatus["state"],
  extra: Partial<DeviceFileStatus> = {},
): DeviceFileStatus {
  return { path: DEVICE_PATH, state, otherCopies: [], ...extra };
}

/**
 * @param manageOffered - Whether the portal lists ppal-manage
 * @param ping - The remote script's answer
 * @param overrides - What this test sets up beyond a library and a device
 * @returns The guidance text, and the dependencies it used
 */
async function guide(
  manageOffered: boolean,
  ping: RemoteScriptPing,
  overrides: Partial<OfflineDeps> = {},
): Promise<{ text: string; deps: OfflineDeps }> {
  const deps = fakeOfflineDeps({
    ping: vi.fn(() => Promise.resolve(ping)),
    findUserLibrary: vi.fn(() => Promise.resolve(LIBRARY)),
    findBundledDevice: vi.fn(() => "/bundle/Producer_Pal.amxd"),
    installedRemoteScript: vi.fn(() => NO_SCRIPT),
    deviceFileStatus: vi.fn(() => device("not-installed")),
    ...overrides,
  });
  const response = await offlineGuidance(manageOffered, deps);

  expect(response.isError).toBe(true);

  return { text: response.content[0]?.text ?? "", deps };
}

describe("offline guidance when the remote script isn't running", () => {
  it("offers the install when the script isn't installed", async () => {
    const { text } = await guide(true, NOT_RUNNING);

    expect(text).toBe(
      `${HEAD}
Or set it up now: run ${INSTALL} (installs to ${SCRIPT_PATH}), then ${RESTART}. After that, ${ADD} installs the Producer Pal device to ${DEVICE_PATH} and adds it ${NEW_TRACK}.${FOOT}`,
    );
  });

  it.each([[VERSION], ["99.0.0"]])(
    "says an installed script (%s) just isn't running",
    async (version) => {
      const { text } = await guide(true, NOT_RUNNING, {
        installedRemoteScript: vi.fn(() => script(version)),
      });

      expect(text).toContain(
        `The Producer Pal remote script is installed (${version}, ${SCRIPT_PATH}) but not running. Ask the user to restart Live if they installed it since Live started, and to choose Producer Pal as a Control Surface in Settings → Link, Tempo & MIDI. After that, ${ADD} installs`,
      );
      expect(text).not.toContain(`Or set it up`);
    },
  );

  it.each([
    ["0.0.1", "0.0.1"],
    [null, "unknown version"],
  ])(
    "offers an update for an older (%s) installed script",
    async (version, shown) => {
      const { text } = await guide(true, NOT_RUNNING, {
        installedRemoteScript: vi.fn(() => script(version)),
      });

      expect(text).toContain(
        `The Producer Pal remote script at ${SCRIPT_PATH} is out of date (${shown}; this is ${VERSION}). Run ${INSTALL} to update it, then ${RESTART}. After that, ${ADD} installs`,
      );
    },
  );

  it("asks for the User Library when it can't be found", async () => {
    const { text, deps } = await guide(true, NOT_RUNNING, {
      findUserLibrary: vi.fn(() => Promise.resolve(null)),
    });

    expect(text).toBe(
      `${HEAD}
Or run ${INSTALL} now. Live's User Library wasn't found, so ask the user for its path (Live: Settings → Library → Location of User Library) and pass it as userLibrary. After that, ${ADD} installs the Producer Pal device and adds it ${NEW_TRACK}.${FOOT}`,
    );
    expect(deps.installedRemoteScript).not.toHaveBeenCalled();
    expect(deps.deviceFileStatus).not.toHaveBeenCalled();
  });

  it("falls back to the general wording when the script lookup throws", async () => {
    const { text } = await guide(true, NOT_RUNNING, {
      installedRemoteScript: vi.fn(() => {
        throw new Error("unreadable");
      }),
    });

    expect(text).toBe(
      `${HEAD}
Or run ${INSTALL} now (it works without Producer Pal), then ask the user to restart Live and choose Producer Pal as a Control Surface. After that, ${ADD} adds the device.${FOOT}`,
    );
  });

  it("drops the device detail when the device lookup throws", async () => {
    const { text } = await guide(true, NOT_RUNNING, {
      deviceFileStatus: vi.fn(() => {
        throw new Error("unreadable");
      }),
    });

    expect(text).toContain(`Or set it up now: run ${INSTALL}`);
    expect(text).toContain(
      `After that, ${ADD} installs the Producer Pal device and adds it ${NEW_TRACK}.`,
    );
    expect(text).not.toContain(DEVICE_PATH);
  });

  it("sends the user to the install guide when no device shipped", async () => {
    const { text, deps } = await guide(true, NOT_RUNNING, {
      findBundledDevice: vi.fn(() => null),
    });

    expect(text).toContain(`(installs to ${SCRIPT_PATH}), then ${RESTART}.`);
    expect(text).toContain(
      `. ppal-manage can't add the device from this install; tell the user to install it by hand: ${SETUP_URL}.`,
    );
    expect(text).not.toContain("add-producer-pal");
    expect(deps.deviceFileStatus).not.toHaveBeenCalled();
  });

  it("looks nothing up for a portal without ppal-manage", async () => {
    const { text, deps } = await guide(false, NOT_RUNNING);

    expect(text).toBe(`${HEAD}${FOOT}`);
    expect(deps.findUserLibrary).not.toHaveBeenCalled();
    expect(deps.findBundledDevice).not.toHaveBeenCalled();
    expect(deps.installedRemoteScript).not.toHaveBeenCalled();
  });

  it("uses the library the running script names before looking for one", async () => {
    const { deps } = await guide(true, {
      ...NOT_RUNNING,
      userLibrary: "/named",
    });

    expect(deps.findUserLibrary).not.toHaveBeenCalled();
    expect(deps.installedRemoteScript).toHaveBeenCalledWith("/named");
  });
});

describe("offline guidance for the device file", () => {
  const cases: Array<[string, DeviceFileStatus, string]> = [
    [
      "an older installed device",
      device("installed-older", {
        installedVersion: "2.0.0",
        bundledVersion: "2.5.0",
      }),
      `updates the Producer Pal device at ${DEVICE_PATH} (2.0.0 → 2.5.0) and adds it ${NEW_TRACK}.`,
    ],
    [
      "the same device",
      device("same", { installedVersion: "2.5.0" }),
      `adds the Producer Pal device already in the User Library (2.5.0) ${NEW_TRACK}; nothing needs installing.`,
    ],
    [
      "a newer installed device",
      device("installed-newer", { installedVersion: "3.0.0" }),
      `adds the Producer Pal device already in the User Library (3.0.0) ${NEW_TRACK}, as is.`,
    ],
    [
      "a different device with no version",
      device("different"),
      `adds the Producer Pal device already in the User Library (unknown version) ${NEW_TRACK}, as is.`,
    ],
  ];

  it.each(cases)("says what happens with %s", async (_name, status, line) => {
    const deps = { deviceFileStatus: vi.fn(() => status) };
    const notRunning = await guide(true, NOT_RUNNING, deps);
    const running = await guide(true, RUNNING, deps);

    expect(notRunning.text).toContain(`After that, ${ADD} ${line}`);
    expect(running.text).toBe(
      `❌ Producer Pal isn't in this Live Set.

Ask the user, then call ${ADD}. It ${line}${FOOT}`,
    );
  });

  it("looks the device up in the bundled file's library", async () => {
    const { deps } = await guide(true, RUNNING);

    expect(deps.deviceFileStatus).toHaveBeenCalledWith(
      LIBRARY,
      "/bundle/Producer_Pal.amxd",
    );
  });
});

describe("offline guidance when the remote script is running", () => {
  it("doesn't look at the installed script", async () => {
    const { deps } = await guide(true, RUNNING);

    expect(deps.installedRemoteScript).not.toHaveBeenCalled();
  });

  it("uses the library the script names", async () => {
    const { deps } = await guide(true, { ...RUNNING, userLibrary: "/named" });

    expect(deps.findUserLibrary).not.toHaveBeenCalled();
    expect(deps.deviceFileStatus).toHaveBeenCalledWith(
      "/named",
      "/bundle/Producer_Pal.amxd",
    );
  });

  it("describes the add generally when the library isn't found", async () => {
    const { text } = await guide(true, RUNNING, {
      findUserLibrary: vi.fn(() => Promise.resolve(null)),
    });

    expect(text).toContain(
      `Ask the user, then call ${ADD}. It installs the Producer Pal device and adds it ${NEW_TRACK}.`,
    );
  });

  it("keeps the short ask when a lookup throws", async () => {
    const { text } = await guide(true, RUNNING, {
      findBundledDevice: vi.fn(() => {
        throw new Error("no bundle lookup");
      }),
    });

    expect(text).toBe(
      `❌ Producer Pal isn't in this Live Set.

Ask the user, then call ${ADD}.${FOOT}`,
    );
  });

  it("doesn't tell the model to add the device when none shipped", async () => {
    const { text } = await guide(true, RUNNING, {
      findBundledDevice: vi.fn(() => null),
    });

    expect(text).toBe(
      `❌ Producer Pal isn't in this Live Set.

ppal-manage can't add the device from this install; tell the user to install it by hand: ${SETUP_URL}.${FOOT}`,
    );
  });

  it("sends an outdated script to be updated before the add", async () => {
    const { text } = await guide(true, { ...RUNNING, scriptVersion: "1.0.0" });

    expect(text).toMatch(
      new RegExp(
        `^❌ Producer Pal isn't in this Live Set\\.\\n\\nThe Producer Pal remote script is out of date \\(running 1\\.0\\.0, needs \\S+ or later\\); update it with ${INSTALL} .*then restart Live\\. After that, ${ADD} installs the Producer Pal device to`,
      ),
    );
  });

  it("sends an outdated script's user to the install guide when no device shipped", async () => {
    const { text } = await guide(
      true,
      { ...RUNNING, scriptVersion: "1.0.0" },
      { findBundledDevice: vi.fn(() => null) },
    );

    expect(text).toContain(
      "then restart Live. ppal-manage can't add the device",
    );
    expect(text).not.toContain("add-producer-pal");
  });

  it("names the add generally for an outdated script when the lookups fail", async () => {
    const { text } = await guide(
      true,
      { ...RUNNING, scriptVersion: "1.0.0" },
      { findUserLibrary: vi.fn(() => Promise.reject(new Error("x"))) },
    );

    expect(text).toContain(`After that, ${ADD} adds the device.`);
  });

  it("keeps the plain wording for a portal without ppal-manage", async () => {
    const { text } = await guide(false, { ...RUNNING, scriptVersion: "1.0.0" });

    expect(text).toBe(
      `❌ Producer Pal isn't in this Live Set.

Tell the user to add the Producer Pal Max for Live device to it, per ${SETUP_URL}.${FOOT}`,
    );
  });
});
