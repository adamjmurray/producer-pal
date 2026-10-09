// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// What the portal answers on its own while the device is down: the setup
// guidance (told apart by whether Live's remote script answers) and the
// ppal-manage actions that need only this machine.
//
// Run with: npm run e2e:portal

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  callToolText,
  copyPortal,
  listToolNames,
  type PortalSession,
  startPortal,
  stopAfterEach,
} from "../portal-test-helpers";
import { createStubDevice } from "../stub-device";
import { createStubRemoteScript } from "../stub-remote-script";

const NO_MANAGE = ["--disable-tools", "ppal-manage"];

const track = stopAfterEach();
const scratch: string[] = [];

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true });
});

/** @returns A User Library folder that is gone after the test */
function scratchLibrary(): string {
  const dir = mkdtempSync(join(tmpdir(), "ppal-portal-e2e-"));

  scratch.push(dir);

  return dir;
}

/** What a portal with the device down is set up with. */
interface DownOptions {
  /** Whether the stub remote script answers */
  scriptRunning: boolean;
  /** CLI flags for the portal */
  args?: string[];
  /** The User Library the running remote script reports */
  library?: string;
  /** The portal's HOME, where it looks for a User Library of its own */
  home?: string;
  /** Whether the portal ships with the device file */
  bundled?: boolean;
}

/**
 * A portal whose device is down, with a remote script that answers or not.
 * @param options - See {@link DownOptions}
 * @returns The portal
 */
async function portalDown(options: DownOptions): Promise<PortalSession> {
  const device = track(await createStubDevice({ online: false }));
  const script = track(
    await createStubRemoteScript({
      online: options.scriptRunning,
      userLibrary: options.library,
    }),
  );
  const copy = track(copyPortal(options.bundled !== false));
  // The user's real Live preferences must not steer the library lookup.
  const home = options.home ?? scratchLibrary();
  const env = { ...script.env, HOME: home, USERPROFILE: home };

  return track(await startPortal(device.origin, options.args, env, copy.file));
}

/**
 * @param scriptRunning - Whether the stub remote script answers
 * @param args - CLI flags for the portal
 * @returns The portal
 */
function portalWithDeviceDown(
  scriptRunning: boolean,
  args: string[] = [],
): Promise<PortalSession> {
  return portalDown({ scriptRunning, args });
}

describe("the offline guidance", () => {
  it("says to run Live with the device when the remote script isn't running", async () => {
    const portal = await portalWithDeviceDown(false);

    const { text, isError } = await callToolText(portal, "ppal-connect");

    expect(isError).toBe(true);
    expect(text).toContain("Cannot connect to Ableton Live.");
    expect(text).toContain('ppal-manage action "install-remote-script"');
  });

  it("says the device is missing when the remote script is running", async () => {
    const portal = await portalWithDeviceDown(true);

    const { text, isError } = await callToolText(portal, "ppal-connect");

    expect(isError).toBe(true);
    expect(text).toContain("Producer Pal isn't in this Live Set.");
    expect(text).toContain(
      'Ask the user, then call ppal-manage action "add-producer-pal".',
    );
    expect(text).not.toContain("Cannot connect");
  });

  it("doesn't mention ppal-manage to a portal that withholds it", async () => {
    const portal = await portalWithDeviceDown(false, NO_MANAGE);

    expect(await listToolNames(portal)).not.toContain("ppal-manage");

    const { text } = await callToolText(portal, "ppal-connect");

    expect(text).toContain("Cannot connect to Ableton Live.");
    expect(text).not.toContain("ppal-manage");
  });

  it("gives ppal-manage the guidance when the portal doesn't offer it", async () => {
    const portal = await portalWithDeviceDown(false, NO_MANAGE);
    const library = scratchLibrary();

    const { text } = await callToolText(portal, "ppal-manage", {
      action: "install-remote-script",
      userLibrary: library,
    });

    expect(text).toContain("Cannot connect to Ableton Live.");
    expect(existsSync(join(library, "Remote Scripts"))).toBe(false);
  });
});

const DEVICE_DIR = ["Presets", "MIDI Effects", "Max MIDI Effect"];
const CAN_FIND_LIBRARY = process.platform !== "linux";

/**
 * @param home - A portal's HOME
 * @returns The User Library the portal finds there by default
 */
function defaultLibrary(home: string): string {
  const parent = process.platform === "darwin" ? "Music" : "Documents";
  const library = join(home, parent, "Ableton", "User Library");

  mkdirSync(library, { recursive: true });

  return library;
}

/**
 * @param library - A User Library
 * @param version - The version its remote script reports
 */
function installScript(library: string, version: string): void {
  const folder = join(library, "Remote Scripts", "Producer_Pal");

  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, "__init__.py"), "");
  writeFileSync(join(folder, "version.py"), `VERSION = "${version}"\n`);
}

/**
 * @param library - A User Library
 * @param contents - What the installed device file holds
 */
function installDevice(library: string, contents: string): void {
  mkdirSync(join(library, ...DEVICE_DIR), { recursive: true });
  writeFileSync(join(library, ...DEVICE_DIR, "Producer_Pal.amxd"), contents);
}

describe("the offline guidance names what is installed", () => {
  it("asks for the User Library when none can be found", async () => {
    const portal = await portalDown({ scriptRunning: false });

    const { text } = await callToolText(portal, "ppal-connect");

    expect(text).toContain("Live's User Library wasn't found");
    expect(text).toContain("pass it as userLibrary");
  });

  it.skipIf(!CAN_FIND_LIBRARY)(
    "offers the remote script install when it isn't there",
    async () => {
      const home = scratchLibrary();
      const library = defaultLibrary(home);
      const portal = await portalDown({ scriptRunning: false, home });

      const { text } = await callToolText(portal, "ppal-connect");

      expect(text).toContain(
        `(installs to ${join(library, "Remote Scripts", "Producer_Pal")})`,
      );
      expect(text).toContain(
        `installs the Producer Pal device to ${join(library, ...DEVICE_DIR, "Producer_Pal.amxd")}`,
      );
    },
  );

  it.skipIf(!CAN_FIND_LIBRARY)(
    "says an installed remote script just isn't running",
    async () => {
      const home = scratchLibrary();

      installScript(defaultLibrary(home), "99.0.0");

      const portal = await portalDown({ scriptRunning: false, home });
      const { text } = await callToolText(portal, "ppal-connect");

      expect(text).toContain("remote script is installed (99.0.0,");
      expect(text).toContain("but not running");
    },
  );

  it.skipIf(!CAN_FIND_LIBRARY)(
    "offers an update for an old remote script",
    async () => {
      const home = scratchLibrary();

      installScript(defaultLibrary(home), "0.0.1");

      const portal = await portalDown({ scriptRunning: false, home });
      const { text } = await callToolText(portal, "ppal-connect");

      expect(text).toContain("is out of date (0.0.1; this is ");
      expect(text).toContain("to update it");
    },
  );

  it("says what adding the device will install", async () => {
    const library = scratchLibrary();
    const portal = await portalDown({ scriptRunning: true, library });

    const { text } = await callToolText(portal, "ppal-connect");

    expect(text).toContain(
      `It installs the Producer Pal device to ${join(library, ...DEVICE_DIR, "Producer_Pal.amxd")} and adds it to a new MIDI track.`,
    );
  });

  it("says when the device is already there", async () => {
    const library = scratchLibrary();

    installDevice(library, "stand-in device");

    const portal = await portalDown({ scriptRunning: true, library });
    const { text } = await callToolText(portal, "ppal-connect");

    expect(text).toContain("nothing needs installing");
  });

  it("says when a different device is used as is", async () => {
    const library = scratchLibrary();

    installDevice(library, "another device");

    const portal = await portalDown({ scriptRunning: true, library });
    const { text } = await callToolText(portal, "ppal-connect");

    expect(text).toContain(
      "Producer Pal device already in the User Library (unknown version) to a new MIDI track, as is.",
    );
  });

  it("sends the user to the install guide when no device shipped", async () => {
    const library = scratchLibrary();
    const portal = await portalDown({
      scriptRunning: true,
      library,
      bundled: false,
    });

    const { text } = await callToolText(portal, "ppal-connect");

    expect(text).toContain(
      "ppal-manage can't add the device from this install",
    );
    expect(text).not.toContain("add-producer-pal");
  });
});

describe("ppal-manage while the device is down", () => {
  it("installs the remote script into the User Library it is given", async () => {
    const portal = await portalWithDeviceDown(false);
    const library = scratchLibrary();
    const folder = join(library, "Remote Scripts", "Producer_Pal");

    const { text, isError } = await callToolText(portal, "ppal-manage", {
      action: "install-remote-script",
      userLibrary: library,
    });

    expect(isError).toBeFalsy();
    expect(text).toContain(`path:"${folder}"`);
    expect(text).toContain("nextSteps:");
    expect(text).toContain("restart Live");
    expect(existsSync(join(folder, "__init__.py"))).toBe(true);
  });

  it("refuses a bad call the way the device does", async () => {
    const portal = await portalWithDeviceDown(false);

    const { text, isError } = await callToolText(portal, "ppal-manage", {
      action: "undo",
      userLibrary: "/somewhere",
    });

    expect(isError).toBe(true);
    expect(text).toContain("userLibrary");
  });

  it("gives undo the setup guidance", async () => {
    const portal = await portalWithDeviceDown(false);

    const { text, isError } = await callToolText(portal, "ppal-manage", {
      action: "undo",
    });

    expect(isError).toBe(true);
    expect(text).toContain("Cannot connect to Ableton Live.");
  });
});
