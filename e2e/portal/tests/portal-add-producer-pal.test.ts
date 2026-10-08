// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// ppal-manage add-producer-pal, driven through a real portal while the device is
// down. The stub remote script plays Live: it takes the /load and starts the
// stub device, the way a loaded Producer Pal starts its server.
//
// Run with: npm run e2e:portal

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  callToolText,
  copyPortal,
  listToolNames,
  startPortal,
  stopAfterEach,
} from "../portal-test-helpers";
import { createStubDevice, DEVICE_TOOL } from "../stub-device";
import {
  createStubRemoteScript,
  type RouteHandler,
} from "../stub-remote-script";

const track = stopAfterEach();
const scratch: string[] = [];

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true });
});

const ADDED: RouteHandler = () => ({
  status: 200,
  body: { track: { index: 2, name: "2-MIDI" } },
});

/**
 * Everything but the call: a down device, a User Library, a remote script
 * whose /load answers as given, and a portal with or without a bundled device.
 * @param load - How the stub remote script answers POST /load
 * @param options - What else differs between tests
 * @param options.scriptRunning - False for a Live with no remote script
 * @param options.bundled - False for a portal that shipped without the device
 * @returns The pieces a test looks at
 */
async function setup(
  load: RouteHandler,
  options: { scriptRunning?: boolean; bundled?: boolean } = {},
) {
  const library = mkdtempSync(join(tmpdir(), "ppal-portal-e2e-"));

  scratch.push(library);

  const device = track(await createStubDevice({ online: false }));
  const script = track(
    await createStubRemoteScript({
      online: options.scriptRunning,
      userLibrary: library,
      routes: {
        "POST /load": async (request, n) => {
          const reply = await load(request, n);

          if (reply.status === 200) await device.start();

          return reply;
        },
      },
    }),
  );
  const copy = track(copyPortal(options.bundled !== false));
  const portal = track(
    await startPortal(device.origin, [], script.env, copy.file),
  );

  return { library, device, script, portal };
}

const AMXD = [
  "Presets",
  "MIDI Effects",
  "Max MIDI Effect",
  "Producer_Pal.amxd",
];

describe("ppal-manage add-producer-pal", () => {
  it("installs the device, has the remote script load it, and ends connected", async () => {
    const { library, script, portal } = await setup(ADDED);

    // Offline list first, so the connect has a stale list to correct.
    expect(await listToolNames(portal)).toContain("ppal-manage");

    const { text, isError } = await callToolText(portal, "ppal-manage", {
      action: "add-producer-pal",
    });

    expect(isError).toBeFalsy();
    expect(text).toBe(
      '{track:{index:2,name:"2-MIDI"},device:"installed in the User Library",nextSteps:"Call ppal-connect next."}',
    );
    expect(existsSync(join(library, ...AMXD))).toBe(true);

    const loads = script.requests.filter((r) => r.route === "/load");

    expect(loads).toHaveLength(1);
    expect(loads[0]?.body).toStrictEqual(
      expect.objectContaining({
        type: "file",
        path: join(library, ...AMXD),
      }),
    );
    await expect.poll(() => portal.toolListChanges).toBe(1);
    expect(await listToolNames(portal)).toStrictEqual([DEVICE_TOOL]);
  });

  it("asks again while Live's browser hasn't seen the new file", async () => {
    const { script, portal } = await setup((request, n) =>
      n === 1
        ? { status: 404, body: { error: "no device found" } }
        : ADDED(request, n),
    );

    const { text, isError } = await callToolText(portal, "ppal-manage", {
      action: "add-producer-pal",
    });

    expect(isError).toBeFalsy();
    expect(text).toContain('name:"2-MIDI"');
    expect(script.requests.filter((r) => r.route === "/load")).toHaveLength(2);
  });

  it("says Producer Pal is already in the Set when the remote script refuses", async () => {
    const { portal } = await setup(() => ({
      status: 409,
      body: {
        error: 'Producer Pal is already in this Live Set (track 1 "1-MIDI")',
      },
    }));

    const { text, isError } = await callToolText(portal, "ppal-manage", {
      action: "add-producer-pal",
    });

    expect(isError).toBe(true);
    expect(text).toContain("already in this Live Set");
    expect(text).toContain("its server isn't answering");
  });

  it("needs the remote script, and copies nothing without it", async () => {
    const { library, portal } = await setup(ADDED, { scriptRunning: false });

    const { text, isError } = await callToolText(portal, "ppal-manage", {
      action: "add-producer-pal",
      userLibrary: library,
    });

    expect(isError).toBe(true);
    expect(text).toContain("remote script isn't running");
    expect(existsSync(join(library, "Presets"))).toBe(false);
  });

  it("says a portal with no bundled device can't add one", async () => {
    const { library, portal } = await setup(ADDED, { bundled: false });

    const { text, isError } = await callToolText(portal, "ppal-manage", {
      action: "add-producer-pal",
    });

    expect(isError).toBe(true);
    expect(text).toContain("no bundled device");
    expect(text).toContain("https://producer-pal.org/installation");
    expect(existsSync(join(library, "Presets"))).toBe(false);
  });
});
