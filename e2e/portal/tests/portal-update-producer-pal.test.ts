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
  callToolTexts,
  copyPortal,
  startPortal,
  stopAfterEach,
  tempFolders,
} from "../portal-test-helpers";
import { createStubDevice, MANAGE_TOOL_REPLY } from "../stub-device";
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
 * @param options.deviceTools - Give the device ppal-connect and ppal-manage
 * @returns The pieces a test looks at
 */
async function setup(
  running: string,
  swap?: RouteHandler | null,
  options: { deviceOnline?: boolean; deviceTools?: boolean } = {},
) {
  const library = newLibrary();

  const device = track(
    await createStubDevice({
      online: options.deviceOnline,
      version: running,
      connectTool: options.deviceTools,
      manageTool: options.deviceTools,
    }),
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

  it("on a refused swap, says the Set is unchanged and whether the library file was updated", async () => {
    const { device, portal } = await setup(OLD, () => ({
      status: 409,
      body: { error: "Producer Pal isn't in this Live Set" },
    }));

    const first = await callToolText(portal, "ppal-manage", UPDATE);

    expect(first.isError).toBe(true);
    expect(first.text).toContain("Live couldn't replace Producer Pal");
    expect(first.text).toContain(
      "The Live Set wasn't changed, but the Producer Pal device in the User Library was updated.",
    );
    expect(device.version).toBe(OLD);

    // The library now holds the same file, so the retry writes nothing.
    const retry = await callToolText(portal, "ppal-manage", UPDATE);

    expect(retry.isError).toBe(true);
    expect(retry.text).toContain("The Live Set wasn't changed.");
    expect(retry.text).not.toContain("User Library was updated");
  });

  // The stand-in script is new enough by version, so it is another build.
  it("says a remote script without the route needs updating", async () => {
    const { portal } = await setup(OLD, null);

    const { text, isError } = await callToolText(portal, "ppal-manage", UPDATE);

    expect(isError).toBe(true);
    expect(text).toContain("is a different build than this connector's");
    // The chat UI is the older device's, which would reinstall its older script.
    expect(text).not.toContain("chat UI");
    expect(text).toContain(
      "The Live Set wasn't changed, but the Producer Pal device in the User Library was updated.",
    );
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

describe("a device older than the portal", () => {
  const INSTALL = { action: "install-remote-script" };

  it("sends a device from before ppal-manage to the by-hand upgrade, not update-producer-pal", async () => {
    const { portal } = await setup("2.4.0", undefined, { deviceTools: true });

    const [result, hint] = await callToolTexts(portal, "ppal-connect");

    expect(result).toBe("connected");
    expect(hint).toContain("older than this connector");
    expect(hint).toContain(
      "https://producer-pal.org/installation/upgrading#update-by-hand",
    );
    expect(hint).not.toContain("update-producer-pal");
  });

  it("answers install-remote-script itself, installing the portal's script", async () => {
    const { library, device, portal } = await setup("2.5.0-rc1", undefined, {
      deviceTools: true,
    });

    const { text, isError } = await callToolText(portal, "ppal-manage", {
      ...INSTALL,
      userLibrary: library,
    });
    const folder = join(library, "Remote Scripts", "Producer_Pal");

    expect(isError).toBeFalsy();
    expect(text).not.toContain(MANAGE_TOOL_REPLY);
    expect(text).toContain(`version:"${PORTAL_VERSION}"`);
    expect(readFileSync(join(folder, "version.py"), "utf8")).toContain(
      PORTAL_VERSION,
    );
    expect(
      device.requests.filter((r) => r.method === "tools/call"),
    ).toStrictEqual([]);
  });

  it("forwards install-remote-script to a device with the portal's version", async () => {
    const { library, device, portal } = await setup(PORTAL_VERSION, undefined, {
      deviceTools: true,
    });

    const { text } = await callToolText(portal, "ppal-manage", {
      ...INSTALL,
      userLibrary: library,
    });

    expect(text).toBe(MANAGE_TOOL_REPLY);
    expect(
      device.requests
        .filter((r) => r.method === "tools/call")
        .map((r) => r.tool),
    ).toStrictEqual(["ppal-manage"]);
    expect(existsSync(join(library, "Remote Scripts"))).toBe(false);
  });
});
