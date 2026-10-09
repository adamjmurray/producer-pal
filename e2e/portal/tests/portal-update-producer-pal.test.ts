// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// ppal-manage update-producer-pal through a real portal with the device up. The
// stub remote script plays Live: on /replace-producer-pal it makes the stub
// device report the portal's version, as a swapped device's new server does.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  callToolText,
  copyPortal,
  startPortal,
  stopAfterEach,
  tempFolders,
} from "../portal-test-helpers";
import { createStubDevice } from "../stub-device";
import {
  createStubRemoteScript,
  type RouteHandler,
} from "../stub-remote-script";

const track = stopAfterEach();
const newLibrary = tempFolders();

const PORTAL_VERSION =
  /"version":\s*"([^"]+)"/.exec(
    readFileSync(join(import.meta.dirname, "../../../package.json"), "utf8"),
  )?.[1] ?? "";

const OLD = "1.0.0";

const AMXD = [
  "Presets",
  "MIDI Effects",
  "Max MIDI Effect",
  "Producer_Pal.amxd",
];

const UPDATE = { action: "update-producer-pal" };

/**
 * A running device, a User Library, a remote script and a portal with a bundled
 * device.
 * @param running - The version the device reports
 * @param swap - How the remote script answers the swap (default: it swaps);
 *   null for a script without the route
 * @param options - What else differs between tests
 * @param options.deviceOnline - False for a device that isn't running
 * @returns The pieces a test looks at
 */
async function setup(
  running: string,
  swap?: RouteHandler | null,
  options: { deviceOnline?: boolean } = {},
) {
  const library = newLibrary();

  const device = track(
    await createStubDevice({ online: options.deviceOnline, version: running }),
  );
  const script = track(
    await createStubRemoteScript({
      userLibrary: library,
      routes:
        swap === null
          ? {}
          : {
              "POST /replace-producer-pal":
                swap ??
                (() => {
                  device.version = PORTAL_VERSION;

                  return {
                    status: 200,
                    body: { track: { path: "t1", name: "1-MIDI" } },
                  };
                }),
            },
    }),
  );
  const copy = track(copyPortal(true, PORTAL_VERSION));
  // HOME is a temp folder too, so nothing of the developer's is touched.
  const env = { ...script.env, HOME: library, USERPROFILE: library };
  const portal = track(await startPortal(device.origin, [], env, copy.file));

  return { library, device, script, portal };
}

describe("ppal-manage update-producer-pal", () => {
  it("copies the device, has the remote script swap it, and ends on the new version", async () => {
    const { library, script, portal } = await setup(OLD);

    const { text, isError } = await callToolText(portal, "ppal-manage", UPDATE);

    expect(isError).toBeFalsy();
    expect(text).toBe(
      `{device:{from:"${OLD}",to:"${PORTAL_VERSION}"},track:{path:"t1",name:"1-MIDI"},nextSteps:"Call ppal-connect next."}`,
    );
    expect(existsSync(join(library, ...AMXD))).toBe(true);

    const swaps = script.requests.filter(
      (r) => r.route === "/replace-producer-pal",
    );

    expect(swaps).toHaveLength(1);
    expect(swaps[0]?.body).toStrictEqual(
      expect.objectContaining({ path: join(library, ...AMXD) }),
    );
    await expect.poll(() => portal.toolListChanges).toBe(1);
  });

  it("does nothing when the device is already the portal's version", async () => {
    const { library, script, portal } = await setup(PORTAL_VERSION);

    const { text, isError } = await callToolText(portal, "ppal-manage", UPDATE);

    expect(isError).toBeFalsy();
    expect(text).toContain("Nothing to update");
    expect(script.requests.map((r) => r.route)).toStrictEqual([]);
    expect(existsSync(join(library, "Presets"))).toBe(false);
  });

  it("refuses a device newer than the portal, and says to update the portal", async () => {
    const { library, script, portal } = await setup("99.0.0");

    const { text, isError } = await callToolText(portal, "ppal-manage", UPDATE);

    expect(isError).toBe(true);
    expect(text).toContain("is newer than this portal");
    expect(text).toContain("update the portal");
    expect(script.requests.map((r) => r.route)).toStrictEqual([]);
    expect(existsSync(join(library, "Presets"))).toBe(false);
  });

  it("says nothing changed when the remote script refuses the swap", async () => {
    const { device, portal } = await setup(OLD, () => ({
      status: 409,
      body: { error: "Producer Pal isn't in this Live Set" },
    }));

    const { text, isError } = await callToolText(portal, "ppal-manage", UPDATE);

    expect(isError).toBe(true);
    expect(text).toContain("Live couldn't replace Producer Pal");
    expect(text).toContain("Nothing was changed.");
    expect(device.version).toBe(OLD);
  });

  it("says a remote script without the route is out of date", async () => {
    const { portal } = await setup(OLD, null);

    const { text, isError } = await callToolText(portal, "ppal-manage", UPDATE);

    expect(isError).toBe(true);
    expect(text).toContain("remote script is out of date");
    expect(text).toContain("Nothing was changed.");
  });

  it("points at add-producer-pal when the device isn't running", async () => {
    const { script, portal } = await setup(OLD, undefined, {
      deviceOnline: false,
    });

    const { text, isError } = await callToolText(portal, "ppal-manage", UPDATE);

    expect(isError).toBe(true);
    expect(text).toContain("isn't in this Live Set");
    expect(text).toContain("add-producer-pal");
    expect(
      script.requests.filter((r) => r.route === "/replace-producer-pal"),
    ).toHaveLength(0);
  });
});
