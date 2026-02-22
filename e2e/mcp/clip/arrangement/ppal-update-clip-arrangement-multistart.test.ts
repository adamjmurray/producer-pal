// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for multi-clip arrangement start operations.
 * Tests the crash fix (clearClipAtDuplicateTarget before duplication)
 * and non-survivor optimization (skipping moves for covered clips).
 * Uses: e2e-test-set — t8 is the empty MIDI track for dynamic clip creation.
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- --testPathPattern ppal-update-clip-arrangement-multistart
 */
import { describe, expect, it } from "vitest";
import {
  parseToolResult,
  parseToolResultWithWarnings,
  type ReadClipResult,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers.ts";
import { readClipsOnTrack } from "../helpers/arrangement-lengthening-test-helpers.ts";

const ctx = setupMcpTestContext();

const emptyMidiTrack = 8;

/**
 * Create an arrangement clip and return its ID.
 * @param trackIndex - Track to create on
 * @param arrangementStart - Bar|beat position
 * @param length - Clip length in bar:beat format
 * @returns Clip ID
 */
async function createArrangementClip(
  trackIndex: number,
  arrangementStart: string,
  length: string,
): Promise<string> {
  const result = await ctx.client!.callTool({
    name: "ppal-create-clip",
    arguments: {
      view: "arrangement",
      trackIndex,
      arrangementStart,
      notes: "C3 1|1",
      length,
      looping: true,
    },
  });

  return parseToolResult<{ id: string }>(result).id;
}

/**
 * Parse update-clip result handling single object or array.
 * Uses parseToolResultWithWarnings since arrangement moves emit expected warnings.
 * @param result - Raw tool result
 * @returns Parsed clips and warnings
 */
function parseUpdateResults(result: unknown): {
  clips: Array<{ id: string }>;
  warnings: string[];
} {
  const { data, warnings } = parseToolResultWithWarnings<
    { id: string } | Array<{ id: string }>
  >(result);

  return {
    clips: Array.isArray(data) ? data : [data],
    warnings,
  };
}

describe("ppal-update-clip arrangement multistart", () => {
  it("moves clip to position with existing clip without crashing", async () => {
    // Existing clip at target position
    await createArrangementClip(emptyMidiTrack, "101|1", "1:0");
    await sleep(200);

    // Another clip to move there
    const movingId = await createArrangementClip(
      emptyMidiTrack,
      "105|1",
      "2:0",
    );

    await sleep(200);

    // Should not crash (clearClipAtDuplicateTarget handles existing clip)
    const result = await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { ids: movingId, arrangementStart: "101|1" },
    });
    const movedClip = parseToolResult<{ id: string }>(result);

    await sleep(200);

    const readResult = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: movedClip.id, include: ["timing"] },
    });
    const clip = parseToolResult<ReadClipResult>(readResult);

    expect(clip.arrangementStart).toBe("101|1");
  });

  it("deletes non-survivors and keeps survivors", async () => {
    // A(4 beats), B(8 beats), C(2 beats)
    // Backwards: C(2)>0 survives, B(8)>2 survives, A(4)<=8 non-survivor
    const idA = await createArrangementClip(emptyMidiTrack, "151|1", "1:0");
    const idB = await createArrangementClip(emptyMidiTrack, "155|1", "2:0");
    const idC = await createArrangementClip(emptyMidiTrack, "159|1", "0:2");

    await sleep(200);

    const result = await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: {
        ids: `${idA},${idB},${idC}`,
        arrangementStart: "170|1",
      },
    });
    const { clips } = parseUpdateResults(result);

    // A is non-survivor (deleted), B and C are survivors
    expect(clips).toHaveLength(2);

    await sleep(200);

    // Verify final state: 2 clips on track
    const { clips: finalClips } = await readClipsOnTrack(
      ctx.client!,
      emptyMidiTrack,
    );

    expect(finalClips).toHaveLength(2);
    expect(finalClips[0]!.arrangementStart).toBe("170|1");
  });

  it("only last clip survives when all have same length", async () => {
    // 3 clips of 4 beats (1 bar) each
    const id1 = await createArrangementClip(emptyMidiTrack, "201|1", "1:0");
    const id2 = await createArrangementClip(emptyMidiTrack, "205|1", "1:0");
    const id3 = await createArrangementClip(emptyMidiTrack, "209|1", "1:0");

    await sleep(200);

    const result = await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: {
        ids: `${id1},${id2},${id3}`,
        arrangementStart: "220|1",
      },
    });
    const { clips } = parseUpdateResults(result);

    // Same length: only last survives (4>0), first two <=4
    expect(clips).toHaveLength(1);

    await sleep(200);

    const { clips: finalClips } = await readClipsOnTrack(
      ctx.client!,
      emptyMidiTrack,
    );

    expect(finalClips).toHaveLength(1);
    expect(finalClips[0]!.arrangementStart).toBe("220|1");
    expect(finalClips[0]!.arrangementLength).toBe("1:0");
  });

  it("all clips survive when in descending length order", async () => {
    // A(8 beats), B(4 beats), C(2 beats) — descending order
    const idA = await createArrangementClip(emptyMidiTrack, "251|1", "2:0");
    const idB = await createArrangementClip(emptyMidiTrack, "255|1", "1:0");
    const idC = await createArrangementClip(emptyMidiTrack, "259|1", "0:2");

    await sleep(200);

    const result = await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: {
        ids: `${idA},${idB},${idC}`,
        arrangementStart: "270|1",
      },
    });
    const { clips } = parseUpdateResults(result);

    // All survive: C(2)>0, B(4)>2, A(8)>4
    expect(clips).toHaveLength(3);

    await sleep(200);

    // 3 clips on track, stacked at target position
    const { clips: finalClips } = await readClipsOnTrack(
      ctx.client!,
      emptyMidiTrack,
    );

    expect(finalClips).toHaveLength(3);
    expect(finalClips[0]!.arrangementStart).toBe("270|1");
  });
});
