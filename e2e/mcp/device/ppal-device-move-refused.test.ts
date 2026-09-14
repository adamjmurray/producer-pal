// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for where a device move lands, or doesn't.
 *
 * A track or chain holds at most one instrument, and Live drops a move that
 * would add a second without saying so. Both tools used to report success: the
 * move returned the device's id as if it had gone somewhere, and the duplicate
 * returned the id of a copy still sitting on its temp track, which the cleanup
 * then deleted. The move warns and skips; the duplicate refuses the lone
 * destination it was given.
 *
 * The `d+` suite below is the other half: only real Live says where an append
 * lands, since a default track preset may already have put devices there.
 *
 * Run with: npm run e2e:mcp -- ppal-device-move-refused
 */
import { describe, expect, it } from "vitest";
import {
  createMidiTrack,
  createTestDevice,
  getToolErrorMessage,
  getToolWarnings,
  isToolError,
  parseToolResult,
  readDeviceCount,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers";

const ctx = setupMcpTestContext();

/**
 * Two fresh MIDI tracks, each holding an instrument. Reports the device counts
 * they start with: a default track preset can add devices of its own, so what
 * "unchanged" means is per-machine.
 * @returns The tracks' indices, the id of the first one's instrument, and the
 *   device count of each track before anything is moved
 */
async function twoInstrumentTracks(): Promise<{
  from: number;
  to: number;
  deviceId: string;
  before: [number, number];
}> {
  const from = await createMidiTrack(ctx.client!);
  const deviceId = await createTestDevice(ctx.client!, "Operator", `t${from}`);
  const to = await createMidiTrack(ctx.client!);

  await createTestDevice(ctx.client!, "Operator", `t${to}`);
  await sleep(150);

  return { from, to, deviceId, before: await deviceCounts(from, to) };
}

/**
 * Read both tracks' device counts.
 * @param from - Track the move starts on
 * @param to - Track the move aims at
 * @returns Each track's device count
 */
async function deviceCounts(
  from: number,
  to: number,
): Promise<[number, number]> {
  return [
    await readDeviceCount(ctx.client!, from),
    await readDeviceCount(ctx.client!, to),
  ];
}

describe("a device move Live refuses", () => {
  it("warns instead of reporting the move as done", async () => {
    const { from, to, deviceId, before } = await twoInstrumentTracks();

    const result = await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { id: deviceId, toPath: `t${to}` },
    });

    expect(getToolWarnings(result)).toContainEqual(
      expect.stringContaining("already has an instrument"),
    );

    await sleep(200);

    // Both tracks are as they were: nothing arrived, nothing left.
    expect(await deviceCounts(from, to)).toStrictEqual(before);
  });

  it("refuses a duplicate rather than naming a copy that no longer exists", async () => {
    const { from, to, deviceId, before } = await twoInstrumentTracks();

    const result = await ctx.client!.callTool({
      name: "ppal-duplicate",
      arguments: { type: "device", id: deviceId, toPath: `t${to}` },
    });

    // One destination and no copy, so the reason comes back as the error.
    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain(
      `could not be moved to "t${to}"`,
    );

    await sleep(200);

    // And the temp track duplicate_track parks next to the source is gone.
    expect(await deviceCounts(from, to)).toStrictEqual(before);
  });

  it("warns when toPath names an index past the end of the container", async () => {
    // Live takes 0 through the container's device count and ignores anything
    // higher without a word. Within one container the arrival check cannot see
    // it either, because the device is already in the list that check reads.
    const track = await createMidiTrack(ctx.client!);

    await createTestDevice(ctx.client!, "Operator", `t${track}`);

    const count = await readDeviceCount(ctx.client!, track);
    const pastTheEnd = `t${track}/d${count + 5}`;

    const result = await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { path: `t${track}/d0`, toPath: pastTheEnd },
    });

    expect(getToolWarnings(result)).toContainEqual(
      expect.stringContaining(`"${pastTheEnd}" is past the end`),
    );

    await sleep(200);

    expect(await readDeviceCount(ctx.client!, track)).toBe(count);
  });

  it("takes the index equal to the device count, which appends", async () => {
    const from = await createMidiTrack(ctx.client!);
    const to = await createMidiTrack(ctx.client!);
    const deviceId = await createTestDevice(ctx.client!, "Reverb", `t${from}`);
    const count = await readDeviceCount(ctx.client!, to);

    const result = await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { id: deviceId, toPath: `t${to}/d${count}` },
    });

    expect(getToolWarnings(result)).not.toContainEqual(
      expect.stringContaining("past the end"),
    );

    await sleep(200);

    expect(await readDeviceCount(ctx.client!, to)).toBe(count + 1);
  });
});

describe('"d+" as a device destination', () => {
  it("moves a device to the end of a track", async () => {
    const from = await createMidiTrack(ctx.client!);
    const to = await createMidiTrack(ctx.client!);
    const deviceId = await createTestDevice(ctx.client!, "Reverb", `t${from}`);
    const before = await readDeviceCount(ctx.client!, to);

    const result = await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { id: deviceId, toPath: `t${to}/d+` },
    });

    expect(getToolWarnings(result)).not.toContainEqual(
      expect.stringContaining("past the end"),
    );
    // The append lands at the index the count named, so the device is last.
    expect(parseToolResult<{ path: string }>(result).path).toBe(
      `t${to}/d${before}`,
    );

    await sleep(200);

    expect(await readDeviceCount(ctx.client!, to)).toBe(before + 1);
  });

  it("copies a device to the end of a track", async () => {
    const from = await createMidiTrack(ctx.client!);
    const to = await createMidiTrack(ctx.client!);
    const deviceId = await createTestDevice(
      ctx.client!,
      "Compressor",
      `t${from}`,
    );
    const before = await readDeviceCount(ctx.client!, to);

    const result = await ctx.client!.callTool({
      name: "ppal-duplicate",
      arguments: { type: "device", id: deviceId, toPath: `t${to}/d+` },
    });

    expect(isToolError(result)).toBe(false);
    expect(parseToolResult<{ path: string }>(result).path).toBe(
      `t${to}/d${before}`,
    );

    await sleep(200);

    expect(await readDeviceCount(ctx.client!, to)).toBe(before + 1);
  });

  // A move needs a device that exists, so the append marker names nothing to
  // move — and the refusal has to say which tools do take it.
  it("refuses d+ as the device to update", async () => {
    const track = await createMidiTrack(ctx.client!);

    const result = await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { path: `t${track}/d+`, name: "Nope" },
    });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain(
      '"d+" appends a device, which only ppal-create-device, ppal-duplicate and ppal-update-device do',
    );
  });
});
