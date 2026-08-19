// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for a move Live turns down.
 *
 * A track or chain holds at most one instrument, and Live drops a move that
 * would add a second without saying so. Both tools used to report success: the
 * move returned the device's id as if it had gone somewhere, and the duplicate
 * returned the id of a copy still sitting on its temp track, which the cleanup
 * then deleted. Both now warn and skip.
 *
 * Run with: npm run e2e:mcp -- ppal-device-move-refused
 */
import { describe, expect, it } from "vitest";
import {
  createMidiTrack,
  createTestDevice,
  getToolWarnings,
  parseToolResultWithWarnings,
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
      arguments: { ids: deviceId, toPath: `t${to}` },
    });

    expect(getToolWarnings(result)).toContainEqual(
      expect.stringContaining("already has an instrument"),
    );

    await sleep(200);

    // Both tracks are as they were: nothing arrived, nothing left.
    expect(await deviceCounts(from, to)).toStrictEqual(before);
  });

  it("skips a duplicate rather than naming a copy that no longer exists", async () => {
    const { from, to, deviceId, before } = await twoInstrumentTracks();

    const result = await ctx.client!.callTool({
      name: "ppal-duplicate",
      arguments: { type: "device", id: deviceId, toPath: `t${to}` },
    });

    const { data, warnings } = parseToolResultWithWarnings<unknown[]>(result);

    // Nothing was copied, so there is nothing to report but the warning.
    expect(data).toStrictEqual([]);
    expect(warnings).toContainEqual(
      expect.stringContaining(`the copy could not be moved to "t${to}"`),
    );

    await sleep(200);

    // And the temp track duplicate_track parks next to the source is gone.
    expect(await deviceCounts(from, to)).toStrictEqual(before);
  });
});
