// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for arrangement clip duplication crash workaround.
 * Verifies that duplicating an arrangement clip over an existing arrangement clip
 * at the same position doesn't crash Ableton Live (bug reported to Ableton).
 *
 * Tests both MIDI and audio arrangement clips.
 * Uses: e2e-test-set (t8 is empty MIDI track, t5 has session audio clip)
 *
 * Run with: npm run e2e:mcp -- --testPathPattern ppal-duplicate-arrangement-crash-workaround
 */
import { describe, expect, it } from "vitest";
import {
  parseToolResult,
  type ReadClipResult,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers.ts";

const ctx = setupMcpTestContext();

interface DuplicateClipResult {
  id: string;
  trackIndex?: number;
  arrangementStart?: string;
}

interface TrackResult {
  arrangementClips?: ReadClipResult[];
}

/**
 * Creates two arrangement clips on a track by duplicating a session clip,
 * then duplicates one arrangement clip on top of the other.
 * Returns the result clip and the track's arrangement clips for verification.
 */
async function testArrangementDuplicateOverExisting(
  sessionClipId: string,
  trackIndex: number,
): Promise<{ result: DuplicateClipResult; trackClips: ReadClipResult[] }> {
  const client = ctx.client!;

  // Duplicate session clip to arrangement at 61|1 (creates arrangement clip A)
  const dupAResult = await client.callTool({
    name: "ppal-duplicate",
    arguments: {
      type: "clip",
      id: sessionClipId,
      destination: "arrangement",
      arrangementStart: "61|1",
    },
  });
  const clipA = parseToolResult<DuplicateClipResult>(dupAResult);

  expect(clipA.arrangementStart).toBe("61|1");
  await sleep(100);

  // Duplicate session clip to arrangement at 65|1 (creates arrangement clip B)
  const dupBResult = await client.callTool({
    name: "ppal-duplicate",
    arguments: {
      type: "clip",
      id: sessionClipId,
      destination: "arrangement",
      arrangementStart: "65|1",
    },
  });
  const clipB = parseToolResult<DuplicateClipResult>(dupBResult);

  expect(clipB.arrangementStart).toBe("65|1");
  await sleep(100);

  // The crash scenario: duplicate arrangement clip B to 61|1
  // (arrangement clip onto existing arrangement clip at same start_time)
  const dupOverResult = await client.callTool({
    name: "ppal-duplicate",
    arguments: {
      type: "clip",
      id: clipB.id,
      destination: "arrangement",
      arrangementStart: "61|1",
    },
  });
  const result = parseToolResult<DuplicateClipResult>(dupOverResult);

  await sleep(100);

  // Read arrangement clips on the track for verification
  const readResult = await client.callTool({
    name: "ppal-read-track",
    arguments: {
      trackIndex,
      include: ["arrangement-clips"],
    },
  });
  const track = parseToolResult<TrackResult>(readResult);

  return { result, trackClips: track.arrangementClips ?? [] };
}

describe("arrangement clip duplication crash workaround", () => {
  it("duplicates MIDI arrangement clip over existing clip without crashing", async () => {
    const trackIndex = 8; // empty MIDI track

    // Create a session MIDI clip to use as source
    const createResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        view: "session",
        trackIndex,
        sceneIndex: "0",
        notes: "C3 D3 E3 F3 1|1",
        length: "1:0.0",
      },
    });
    const sessionClip = parseToolResult<{ id: string }>(createResult);

    await sleep(100);

    const { result, trackClips } = await testArrangementDuplicateOverExisting(
      sessionClip.id,
      trackIndex,
    );

    // Verify: operation didn't crash and produced a clip at 61|1
    expect(result.id).toBeDefined();
    expect(result.arrangementStart).toBe("61|1");

    // Verify exactly one clip at 61|1 on the track
    const clipsAt61 = trackClips.filter((c) => c.arrangementStart === "61|1");

    expect(clipsAt61).toHaveLength(1);
  });

  it("duplicates audio arrangement clip over existing clip without crashing", async () => {
    const trackIndex = 5; // Audio 2 track (has session clip at s0)

    // Read the existing session audio clip on t5/s0
    const readResult = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { trackIndex, sceneIndex: 0 },
    });
    const sessionClip = parseToolResult<{ id: string }>(readResult);

    const { result, trackClips } = await testArrangementDuplicateOverExisting(
      sessionClip.id,
      trackIndex,
    );

    // Verify: operation didn't crash and produced a clip at 61|1
    expect(result.id).toBeDefined();
    expect(result.arrangementStart).toBe("61|1");

    // Verify exactly one clip at 61|1 on the track
    const clipsAt61 = trackClips.filter((c) => c.arrangementStart === "61|1");

    expect(clipsAt61).toHaveLength(1);
  });
});
