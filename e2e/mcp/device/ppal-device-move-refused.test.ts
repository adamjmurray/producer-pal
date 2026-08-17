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
 * then deleted.
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
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers";

const ctx = setupMcpTestContext();

/**
 * Two fresh MIDI tracks, each holding an instrument.
 * @returns The tracks' indices, and the id of the first one's instrument
 */
async function twoInstrumentTracks(): Promise<{
  from: number;
  to: number;
  deviceId: string;
}> {
  const from = await createMidiTrack(ctx.client!);
  const deviceId = await createTestDevice(ctx.client!, "Operator", `t${from}`);
  const to = await createMidiTrack(ctx.client!);

  await createTestDevice(ctx.client!, "Operator", `t${to}`);
  await sleep(150);

  return { from, to, deviceId };
}

/**
 * Count the devices on a track.
 * @param trackIndex - Track to read
 * @returns How many devices it holds
 */
async function deviceCount(trackIndex: number): Promise<number> {
  const track = parseToolResult<{ devices?: unknown[] }>(
    await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { trackIndex, include: ["devices"] },
    }),
  );

  return track.devices?.length ?? 0;
}

describe("a device move Live refuses", () => {
  it("warns instead of reporting the move as done", async () => {
    const { from, to, deviceId } = await twoInstrumentTracks();

    const result = await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { ids: deviceId, toPath: `t${to}` },
    });

    expect(getToolWarnings(result)).toContainEqual(
      expect.stringContaining("already has an instrument"),
    );

    await sleep(200);

    // Both tracks are as they were: nothing arrived, nothing left.
    expect(await deviceCount(from)).toBe(1);
    expect(await deviceCount(to)).toBe(1);
  });

  it("fails a duplicate rather than naming a copy that no longer exists", async () => {
    const { to, deviceId } = await twoInstrumentTracks();

    const result = await ctx.client!.callTool({
      name: "ppal-duplicate",
      arguments: { type: "device", id: deviceId, toPath: `t${to}` },
    });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain(
      `the copy could not be moved to "t${to}"`,
    );

    await sleep(200);

    // And the temp track duplicate_track parks next to the source is gone.
    expect(await deviceCount(to)).toBe(1);
  });
});
