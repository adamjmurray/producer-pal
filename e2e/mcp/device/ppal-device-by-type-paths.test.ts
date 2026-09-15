// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for `inst`, `mfx<n>` and `afx<n>` path segments.
 * Uses: e2e-test-set, track t2 (MIDI Effect Rack → Analog → EQ Eight →
 * Compressor). See e2e/live-sets/e2e-test-set-spec.md.
 *
 * Run with: npm run e2e:mcp -- ppal-device-by-type-paths
 */
import { describe, expect, it } from "vitest";
import {
  getToolErrorMessage,
  getToolWarnings,
  isToolError,
  parseToolResult,
  parseToolResultWithWarnings,
  setupMcpTestContext,
} from "../mcp-test-helpers";

const ctx = setupMcpTestContext({ once: true });

interface DeviceEntry {
  path?: string;
  type?: string;
  name?: string;
  ok?: false;
  reason?: string;
}

async function readDevices(path: string): Promise<unknown> {
  return ctx.client!.callTool({
    name: "ppal-read-device",
    arguments: { path },
  });
}

/**
 * The error a call that names nothing fails with, checking that nothing warned
 * about the same target beside it.
 * @param name - Tool to call
 * @param args - Its arguments
 * @returns The error message
 */
async function failure(
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const result = await ctx.client!.callTool({ name, arguments: args });

  expect(isToolError(result), `expected ${name} to fail`).toBe(true);
  expect(getToolWarnings(result)).toStrictEqual([]);

  return getToolErrorMessage(result);
}

describe("device paths by type", () => {
  it("resolves inst, mfx and afx within their own type, and reports d<n>", async () => {
    const devices = parseToolResult<DeviceEntry[]>(
      await readDevices("t2/inst,t2/mfx0,t2/afx0,t2/afx1,t2/d0/c0/mfx0"),
    );

    // A result never echoes the type spelling: the path is the position.
    expect(devices.map((device) => device.path)).toStrictEqual([
      "t2/d1",
      "t2/d0",
      "t2/d2",
      "t2/d3",
      "t2/d0/c0/d0",
    ]);
    expect(devices[0]!.type).toContain("Analog");
    // A rack counts as one device of its own type.
    expect(devices[1]!.type).toBe("midi-effect-rack");
    expect(devices[2]!.type).toContain("EQ Eight");
    expect(devices[3]!.type).toContain("Compressor");
    expect(devices[4]!.type).toContain("Arpeggiator");
  });

  it("reads a rack chain's instrument and audio effect", async () => {
    const devices = parseToolResult<DeviceEntry[]>(
      await readDevices("t1/d0/c0/inst,t1/d0/c0/afx0,t0/d0/pC1/inst"),
    );

    expect(devices[0]!.type).toContain("Operator");
    expect(devices[1]!.type).toContain("Saturator");
    expect(devices[2]!.path).toBe("t0/d0/pC1/d0");
  });

  // What the container holds is about the target, so it rides on the target's
  // own entry — and nothing warns about it as well.
  it("reports what the container holds on each entry, warning nothing", async () => {
    const { data, warnings } = parseToolResultWithWarnings<DeviceEntry[]>(
      await readDevices("t2/d0/c0/inst,t2/afx2,rt0/inst,t2/inst"),
    );

    expect(data.slice(0, 3)).toStrictEqual([
      {
        path: "t2/d0/c0/inst",
        ok: false,
        reason: 'nothing at path "t2/d0/c0/inst": t2/d0/c0 has no instrument',
      },
      {
        path: "t2/afx2",
        ok: false,
        reason: 'nothing at path "t2/afx2": t2 has 2 audio effects (afx0-afx1)',
      },
      {
        path: "rt0/inst",
        ok: false,
        reason:
          'nothing at path "rt0/inst": return and main tracks hold only audio effects',
      },
    ]);
    expect(data[3]!.path).toBe("t2/d1");
    expect(warnings).toStrictEqual([]);
  });

  // t8 is the empty track, so none of these renames or selects anything.
  it("says why a one-target call found nothing, in the error and only there", async () => {
    expect(await failure("ppal-read-device", { path: "t8/inst" })).toContain(
      'nothing at path "t8/inst": t8 has no instrument',
    );
    expect(
      await failure("ppal-update-device", { path: "t8/inst", name: "Nope" }),
    ).toContain('nothing at path "t8/inst": t8 has no instrument');
    expect(await failure("ppal-select", { path: "t8/inst" })).toContain(
      'no device at "t8/inst": t8 has no instrument',
    );
  });

  // The third audio effect isn't there to remove, exactly as an out-of-range
  // "d<n>" isn't, so the delete reads as already done rather than refused.
  it("reports a delete through a type segment as nothing to delete", async () => {
    const { data, warnings } = parseToolResultWithWarnings<DeviceEntry>(
      await ctx.client!.callTool({
        name: "ppal-delete",
        arguments: { type: "device", path: "t2/afx2" },
      }),
    );

    expect(data).toStrictEqual({
      path: "t2/afx2",
      type: "device",
      reason: "nothing to delete",
    });
    expect(warnings).toStrictEqual([]);
  });

  it("says what the track holds when an insert names no device to sit at", async () => {
    expect(
      await failure("ppal-create-device", {
        deviceName: "Compressor",
        path: "t2/afx5",
      }),
    ).toContain(
      'path "t2/afx5" names no device to insert at: t2 has 2 audio effects (afx0-afx1)',
    );
  });

  it("updates through a type segment and reports the position", async () => {
    const result = parseToolResult<{ id?: unknown; path?: string }>(
      await ctx.client!.callTool({
        name: "ppal-update-device",
        arguments: { path: "t2/inst", name: "Soft Morning Keys" },
      }),
    );
    const analog = parseToolResult<DeviceEntry & { id?: unknown }>(
      await readDevices("t2/d1"),
    );

    expect(result.path).toBe("t2/d1");
    expect(String(result.id)).toBe(String(analog.id));
    expect(analog.name).toBe("Soft Morning Keys");
  });
});
