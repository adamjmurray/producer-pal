// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Every remote-script route that changes the Set must carry an expiry, so Live
// skips a job V8 has already given up on. This drives each one through Node and
// checks the remote script is sent `expires_in_ms`, and that no route that
// changes the Set is left out.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ENVELOPE_ROUTES } from "#src/tools/clip/envelopes/remote-script-envelope-contract.ts";
import { CONVERT_ROUTE } from "#src/tools/clip/convert/remote-script-convert-contract.ts";
import { MANAGE_ROUTES } from "#src/tools/core/helpers/manage-contract.ts";
import { REMOTE_SCRIPT_ROUTES } from "#src/tools/device/create/helpers/remote-script-contract.ts";
import { SIMPLER_SETTINGS_ROUTES } from "#src/tools/shared/remote-script/simpler-settings-contract.ts";
import { dispatchNodeRoute } from "../../../../tests/config-dir-test-helpers.ts";
import { registerRemoteScriptRoutes } from "../../remote-script-routes.ts";
import { useFakeRemoteScriptRoutes } from "../remote-script-test-helpers.ts";

const EXPIRES_IN_MS = 4321;

const DEVICE = "live_set tracks 0 devices 0";

/** The Python route each Node route that changes the Set forwards to, and its args. */
const WRITES: Record<string, { node: string; args: object }> = {
  "/load": {
    node: REMOTE_SCRIPT_ROUTES.load,
    args: { type: "plugin", path: "a", trackIndex: 0, trackName: "t" },
  },
  "/hotswap": {
    node: REMOTE_SCRIPT_ROUTES.hotswap,
    args: { type: "plugin", path: "a", devicePath: DEVICE, deviceName: "d" },
  },
  "/device/duplicate": {
    node: REMOTE_SCRIPT_ROUTES.duplicateDevice,
    args: { devicePath: DEVICE, deviceName: "d" },
  },
  "/clip/convert": {
    node: CONVERT_ROUTE,
    args: { track: "t0", slot: 0, type: "drums" },
  },
  "/envelope/write": {
    node: ENVELOPE_ROUTES.write,
    args: { track: "t0", slot: 0, points: [{ time: 0, value: 0 }] },
  },
  "/envelope/clear": {
    node: ENVELOPE_ROUTES.clear,
    args: { track: "t0", slot: 0 },
  },
  "/device/simpler/write": {
    node: SIMPLER_SETTINGS_ROUTES.write,
    args: { devicePath: DEVICE, pitchBendRange: 2 },
  },
  "/undo/undo": { node: MANAGE_ROUTES.undo, args: {} },
  "/undo/redo": { node: MANAGE_ROUTES.redo, args: {} },
};

/** Routes that change the Set but report nothing a caller waits on. */
const FIRE_AND_FORGET = ["/undo/end"];

/**
 * Order two strings.
 * @param a - One
 * @param b - The other
 * @returns Their order
 */
function byText(a: string | undefined, b: string | undefined): number {
  return (a ?? "").localeCompare(b ?? "");
}

const answerWith = useFakeRemoteScriptRoutes(registerRemoteScriptRoutes);

describe("remote script routes that change the Set", () => {
  it("covers every POST-only route the remote script has", () => {
    const python = readFileSync(
      new URL(
        "../../../../../../remote-script/Producer_Pal/routes.py",
        import.meta.url,
      ),
      "utf8",
    );
    const block = /POST_ONLY = \(([^)]*)\)/.exec(python)?.[1] ?? "";
    const postOnly = [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]);

    expect(postOnly.length).toBeGreaterThan(0);
    expect(postOnly.toSorted(byText)).toStrictEqual(
      [...Object.keys(WRITES), ...FIRE_AND_FORGET].toSorted(byText),
    );
  });

  it.each(Object.entries(WRITES))(
    "%s is sent the expiry",
    async (route, { node, args }) => {
      const remote = await answerWith({ body: { started: true, device: {} } });

      await dispatchNodeRoute(node, { ...args, expiresInMs: EXPIRES_IN_MS });

      expect(remote.requests).toHaveLength(1);
      expect(remote.requests[0]).toStrictEqual(
        expect.objectContaining({
          route,
          body: expect.objectContaining({
            expires_in_ms: EXPIRES_IN_MS,
          }) as object,
        }),
      );
    },
  );

  it.each(Object.entries(WRITES))(
    "%s refuses a call with no expiry, sending nothing",
    async (_route, { node, args }) => {
      const remote = await answerWith({ body: {} });

      const answer = await dispatchNodeRoute(node, args);

      expect(answer).toStrictEqual(expect.objectContaining({ success: false }));
      expect(remote.requests).toStrictEqual([]);
    },
  );
});
