// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// What the portal answers on its own while the device is down: the setup
// guidance (told apart by whether Live's remote script answers) and the
// ppal-manage actions that need only this machine.
//
// Run with: npm run e2e:portal

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  callToolText,
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

/**
 * A portal whose device is down, with a remote script that answers or not.
 * @param scriptRunning - Whether the stub remote script answers
 * @param args - CLI flags for the portal
 * @returns The portal
 */
async function portalWithDeviceDown(
  scriptRunning: boolean,
  args: string[] = [],
): Promise<PortalSession> {
  const device = track(await createStubDevice({ online: false }));
  const script = track(await createStubRemoteScript({ online: scriptRunning }));

  return track(await startPortal(device.origin, args, script.env));
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
