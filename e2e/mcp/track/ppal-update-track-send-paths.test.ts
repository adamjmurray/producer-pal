// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for naming a return track by path ("rt0") in ppal-update-track's
 * sendReturn and sends[].return.
 * Uses: e2e-test-set (two or more return tracks)
 *
 * Run with: npm run e2e:mcp -- ppal-update-track-send-paths
 */
import { describe, expect, it } from "vitest";
import {
  parseToolResult,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers";

const ctx = setupMcpTestContext();

interface LiveSetResult {
  tracks?: Array<{ id: string }>;
  returnTracks?: Array<{ id: string; name: string }>;
}

interface ReadTrackResult {
  sends?: Array<{ return: string; gainDb: number }>;
}

async function updateTrack(args: Record<string, unknown>): Promise<void> {
  await ctx.client!.callTool({ name: "ppal-update-track", arguments: args });
}

async function readSetup(): Promise<{
  trackId: string;
  returnNames: string[];
}> {
  const liveSet = parseToolResult<LiveSetResult>(
    await ctx.client!.callTool({
      name: "ppal-read-live-set",
      arguments: { include: ["tracks"] },
    }),
  );

  return {
    trackId: liveSet.tracks![0]!.id,
    returnNames: liveSet.returnTracks!.map((rt) => rt.name),
  };
}

async function readSends(trackId: string): Promise<ReadTrackResult["sends"]> {
  await sleep(100);

  const track = parseToolResult<ReadTrackResult>(
    await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { id: trackId, include: ["mixer"] },
    }),
  );

  return track.sends;
}

describe("ppal-update-track return tracks by path", () => {
  it("takes rt<n> as sendReturn", async () => {
    const { trackId, returnNames } = await readSetup();

    await updateTrack({ id: trackId, sendGainDb: -17, sendReturn: "rt1" });

    const sends = await readSends(trackId);

    expect(sends![1]!.return).toBe(returnNames[1]);
    expect(sends![1]!.gainDb).toBeCloseTo(-17, 1);
    expect(sends![0]!.gainDb).not.toBeCloseTo(-17, 1);
  });

  it("takes rt<n> as sends[].return", async () => {
    const { trackId } = await readSetup();

    await updateTrack({
      id: trackId,
      sends: [
        { return: "rt1", gainDb: -21 },
        { return: "rt0", gainDb: -9 },
      ],
    });

    const sends = await readSends(trackId);

    expect(sends![0]!.gainDb).toBeCloseTo(-9, 1);
    expect(sends![1]!.gainDb).toBeCloseTo(-21, 1);
  });
});
