// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for Live 13's new devices: each one is created by name and its
 * params read. Drum Synth and Transient Shaper also check their mode-gated
 * params. Skips on Live 12, which can't open the Set.
 *
 * The Softube devices come from a Max for Live pack that may not be installed;
 * a name Live doesn't have skips that case.
 *
 * Uses: live-13-test (t0 has a Drum Rack, pad C1 holding a Drum Synth)
 * See: e2e/live-sets/specs/live-13-test-spec.md
 *
 * Run with: npm run e2e:mcp -- device/create/live-13/ppal-create-device-live-13
 */
import { describe, expect, it } from "vitest";
import {
  createMidiTrack,
  createTestDeviceAt,
  getToolErrorMessage,
  isToolError,
  type McpTestContext,
  parseToolResult,
  setupMcpTestContext,
  sleep,
  trackIndexFromPath,
} from "../../../mcp-test-helpers";
import { LIVE_13_OR_NEWER, LIVE_13_TEST_PATH } from "../../../e2e-test-set.ts";

interface ReadParam {
  name: string;
  value?: unknown;
  state?: string;
}

interface ReadDeviceResult {
  parameters: ReadParam[];
}

const SOFTUBE_DEVICES = [
  "FET Compressor",
  "OPTO Compressor",
  "BCA Compressor",
  "BCA Equaliser",
  "BCA Drive",
];

// Set inside the describe, so nothing opens the Live 13 Set on Live 12.
let ctx: McpTestContext;

/**
 * Create a fresh track so a test never builds on another's devices.
 * @param type - Track type
 * @returns Its path, like `t12`
 */
async function createTrack(type: "midi" | "audio"): Promise<string> {
  if (type === "midi") {
    return `t${await createMidiTrack(ctx.client!)}`;
  }

  const track = parseToolResult<{ path: string }>(
    await ctx.client!.callTool({
      name: "ppal-create-track",
      arguments: { type },
    }),
  );

  await sleep(150);

  return `t${trackIndexFromPath(track.path)}`;
}

/**
 * Read a device's params with their values.
 * @param path - The device's path
 * @returns The read
 */
async function readParams(path: string): Promise<ReadDeviceResult> {
  return parseToolResult<ReadDeviceResult>(
    await ctx.client!.callTool({
      name: "ppal-read-device",
      arguments: { path, include: ["param-values"] },
    }),
  );
}

/**
 * Write one param and let Live settle.
 * @param path - The device's path
 * @param name - The param's name
 * @param value - The value to write
 */
async function writeParam(
  path: string,
  name: string,
  value: string,
): Promise<void> {
  parseToolResult(
    await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { path, params: [{ name, value }] },
    }),
  );
  await sleep(100);
}

/**
 * The params of one read whose names start with a prefix and a space.
 * @param read - The device read
 * @param prefix - The name prefix
 * @returns The matching params
 */
function startingWith(read: ReadDeviceResult, prefix: string): ReadParam[] {
  return read.parameters.filter((param) => param.name.startsWith(`${prefix} `));
}

describe.skipIf(!LIVE_13_OR_NEWER)("Live 13 devices", () => {
  ctx = setupMcpTestContext({ once: true, liveSetPath: LIVE_13_TEST_PATH });

  it("reads the Drum Synth on the Set's drum pad", async () => {
    const read = await readParams("t0/d0/pC1/d0");
    const soundType = read.parameters.find((p) => p.name === "Sound Type");

    expect(soundType?.value).toBe("Kick");

    const state = (name: string): string | undefined =>
      read.parameters.find((p) => p.name === name)?.state;

    // Kick 80x is selected: the other Kick models' params are inactive.
    expect(state("Kick Model")).toBeUndefined();
    expect(state("Kick 80x Click")).toBeUndefined();
    expect(state("Kick 90x Attack")).toBe("inactive");
    expect(state("Snare TR Snap")).toBe("inactive");
  });

  it("creates a Drum Synth and marks the other types' params inactive", async () => {
    const path = await createTestDeviceAt(
      ctx.client!,
      "Drum Synth",
      await createTrack("midi"),
    );

    await writeParam(path, "Sound Type", "HiHat");

    const read = await readParams(path);
    const kick = startingWith(read, "Kick");

    expect(read.parameters.find((p) => p.name === "Sound Type")?.value).toBe(
      "HiHat",
    );
    expect(kick.length).toBeGreaterThan(0);
    expect(kick.map((p) => p.state)).toStrictEqual(kick.map(() => "inactive"));
  });

  it("gates a Drum Synth's params by the selected model", async () => {
    const path = await createTestDeviceAt(
      ctx.client!,
      "Drum Synth",
      await createTrack("midi"),
    );

    await writeParam(path, "Sound Type", "Kick");
    await writeParam(path, "Kick Model", "Kick 90x");

    const state = (read: ReadDeviceResult, name: string): string | undefined =>
      read.parameters.find((p) => p.name === name)?.state;
    const read = await readParams(path);

    expect(state(read, "Kick 90x Attack")).toBeUndefined();
    expect(state(read, "Kick 80x Click")).toBe("inactive");
    expect(state(read, "Zapp Snap")).toBe("inactive");
    expect(state(read, "Kick Model")).toBeUndefined();
    expect(state(read, "Rim Model")).toBe("inactive");
  });

  it("creates a Clipper and reads its params", async () => {
    const path = await createTestDeviceAt(
      ctx.client!,
      "Clipper",
      await createTrack("audio"),
    );
    const names = (await readParams(path)).parameters.map((p) => p.name);

    expect(names).toStrictEqual(
      expect.arrayContaining(["Ceiling", "Input", "Output", "Mode", "Lift"]),
    );
  });

  it("creates a Transient Shaper and gates its S/C params on S/C On", async () => {
    const path = await createTestDeviceAt(
      ctx.client!,
      "Transient Shaper",
      await createTrack("audio"),
    );
    const SIDECHAIN = ["S/C Gain", "S/C Emph Type"];

    await writeParam(path, "S/C On", "Off");

    const off = await readParams(path);

    // Max lists 8 of the 10 params Live's Python API has.
    expect(off.parameters.map((p) => p.name)).toStrictEqual([
      "Device On",
      "Attack",
      "Sustain",
      "Soft Clip On",
      "Dry/Wet",
      "S/C Emph Type",
      "S/C Gain",
      "S/C On",
    ]);
    expect(
      off.parameters
        .filter((p) => SIDECHAIN.includes(p.name))
        .map((p) => p.state),
    ).toStrictEqual(["inactive", "inactive"]);

    await writeParam(path, "S/C On", "On");

    const on = await readParams(path);

    expect(
      on.parameters
        .filter((p) => SIDECHAIN.includes(p.name))
        .map((p) => p.state),
    ).toStrictEqual([undefined, undefined]);
  });

  it.for(SOFTUBE_DEVICES)(
    "creates %s and reads its params",
    async (name, { skip }) => {
      const track = await createTrack("audio");
      const result = await ctx.client!.callTool({
        name: "ppal-create-device",
        arguments: { deviceName: name, path: track },
      });

      // A name Live doesn't have means the Softube pack isn't installed.
      if (
        isToolError(result) &&
        getToolErrorMessage(result).includes("invalid device")
      ) {
        skip(`"${name}" isn't installed (the Softube Max for Live pack)`);
      }

      const created = parseToolResult<{ path: string }>(result);

      expect(
        (await readParams(created.path)).parameters.length,
      ).toBeGreaterThan(0);
    },
  );
});
