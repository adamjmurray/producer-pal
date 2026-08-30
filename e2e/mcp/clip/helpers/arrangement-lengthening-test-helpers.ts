// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Shared helpers for arrangement clip lengthening e2e tests
 */
import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { expect } from "vitest";
import { durationToAbletonBeats } from "#src/notation/barbeat/time/barbeat-time.ts";
import {
  type CreateClipResult,
  parseToolResult,
  parseToolResultWithWarnings,
  type ReadClipResult,
} from "../../mcp-test-helpers.ts";
import { type ExpectedClip } from "./arrangement-lengthening-expected-test-cases.ts";

export const ARRANGEMENT_CLIP_TESTS_PATH =
  "e2e/live-sets/arrangement-clip-tests Project/arrangement-clip-tests.als";

export const TARGET_LENGTH = "4bar"; // 4 bars
export const EPSILON = 0.01; // For floating-point comparisons

export interface TrackClipsResult {
  type: "midi" | "audio";
  clips: ReadClipResult[];
}

/**
 * Read all arrangement clips from a track.
 * Returns clips and track type since type is stripped from nested clips.
 */
export async function readClipsOnTrack(
  client: Client,
  trackIndex: number,
): Promise<TrackClipsResult> {
  const result = await client.callTool({
    name: "ppal-read-track",
    arguments: {
      trackIndex,
      include: ["arrangement-clips", "timing"],
    },
  });

  interface TrackResult {
    type: "midi" | "audio";
    arrangementClips?: ReadClipResult[];
  }

  const track = parseToolResult<TrackResult>(result);

  return { type: track.type, clips: track.arrangementClips ?? [] };
}

/**
 * Lengthen a clip to 4 bars via ppal-update-clip.
 * Returns raw result which may be single object or array.
 */
export async function lengthenClipTo4Bars(
  client: Client,
  clipId: string,
): Promise<unknown> {
  return await client.callTool({
    name: "ppal-update-clip",
    arguments: {
      id: clipId,
      arrangementLength: TARGET_LENGTH,
    },
  });
}

/**
 * Parse lengthening result - handles single object or array responses.
 * Also extracts warnings from the result.
 */
export function parseLengthenResult(result: unknown): {
  clips: Array<{ id: string }>;
  warnings: string[];
} {
  // Use parseToolResultWithWarnings since lengthening operations emit expected warnings
  // (e.g. "no additional file content", "capped at file boundary")
  try {
    const { data: asArray, warnings } =
      parseToolResultWithWarnings<CreateClipResult[]>(result);

    if (Array.isArray(asArray)) {
      return { clips: asArray, warnings };
    }
  } catch {
    // Not an array, try single object
  }

  const { data: asObject, warnings } =
    parseToolResultWithWarnings<CreateClipResult>(result);

  return { clips: [asObject], warnings };
}

/**
 * Calculate total arrangement length in bars from clips.
 * Assumes clips are contiguous and start at the same position.
 */
export function calculateTotalLengthInBars(clips: ReadClipResult[]): number {
  if (clips.length === 0) return 0;

  // Get the range from first start to last end
  const starts = clips
    .map((c) => c.arrangementStart)
    .filter((s): s is string => s != null)
    .map(parseBarBeat);

  const ends = clips
    .map((c) => {
      if (c.arrangementStart && c.arrangementLength) {
        const start = parseBarBeat(c.arrangementStart);
        const length = parseBarBeat(c.arrangementLength);

        return start + length;
      }

      return null;
    })
    .filter((e): e is number => e != null);

  if (starts.length === 0 || ends.length === 0) return 0;

  const minStart = Math.min(...starts);
  const maxEnd = Math.max(...ends);

  return maxEnd - minStart;
}

/**
 * Parse a bar|beat position OR an absolute-note-value duration to bars (decimal).
 *
 * Positions use pipe notation (1-indexed: "1|1" = bar 0, beat 0). Durations use
 * the unified duration grammar ("1bar", "n/2", "1bar+n/4") or off-grid bare
 * beats; those are routed through the canonical `durationToAbletonBeats` parser
 * and divided into bars. e2e test sets are all 4/4, so 1 bar = 4 Ableton beats.
 * Examples: "1bar" = 1 bar, "n/2" = 0.5 bars, "1|1" = 0 bars.
 */
export function parseBarBeat(barBeat: string): number {
  if (barBeat.includes("|")) {
    // Pipe position notation, 1-indexed (1|1 = bar 0, beat 0)
    const [bars, beats] = barBeat.split("|").map(Number);

    return (bars as number) - 1 + ((beats as number) - 1) / 4;
  }

  // Duration grammar → Ableton beats (quarter notes) → bars (4/4 test sets)
  return durationToAbletonBeats(barBeat, 4, 4) / 4;
}

/**
 * Assert that result clips match expected arrangement positions and markers.
 * Checks arrangementStart, arrangementLength, start, and end for each clip.
 */
export function assertClipDetails(
  resultClips: ReadClipResult[],
  expectedClips: ExpectedClip[],
): void {
  // ExpectedClip names four timing fields; the rest of a clip read is not what
  // these table-driven cases are about. Asserting the array pins the count too.
  expect(resultClips).toStrictEqual(
    expectedClips.map((expected) => expect.objectContaining(expected)),
  );
}

export type LengthenResult = {
  trackType: "midi" | "audio";
  initialClips: ReadClipResult[];
  resultClips: ReadClipResult[];
  warnings: string[];
};

/**
 * Assert a lengthening that tiles to a full 4-bar arrangement length.
 * Used by looped clip types (MIDI looped, audio looped warped): the operation
 * emits no warnings and the resulting clips span exactly 4 bars (±EPSILON).
 */
export function assertLengthenedToFullLength(
  { resultClips, warnings }: LengthenResult,
  expectedClips: ExpectedClip[],
): void {
  expect(warnings).toHaveLength(0);

  const totalLength = calculateTotalLengthInBars(resultClips);

  expect(totalLength).toBeGreaterThanOrEqual(4 - EPSILON);
  expect(totalLength).toBeLessThanOrEqual(4 + EPSILON);
  assertClipDetails(resultClips, expectedClips);
}

/**
 * Assert a lengthening that extends a single clip in place (no tiles).
 * Used by unlooped clip types: the clip keeps its ID and stays a single clip.
 * `expectWarnings` selects whether warnings are required (capped/skipped audio)
 * or forbidden (MIDI unlooped, which extends cleanly via loop_end).
 */
export function assertLengthenedInPlace(
  { initialClips, resultClips, warnings }: LengthenResult,
  expectedClips: ExpectedClip[],
  expectWarnings: boolean,
): void {
  if (expectWarnings) {
    expect(warnings.length).toBeGreaterThanOrEqual(1);
  } else {
    expect(warnings).toHaveLength(0);
  }

  expect(resultClips).toHaveLength(1);
  expect(resultClips[0]!.id).toBe(initialClips[0]!.id);
  assertClipDetails(resultClips, expectedClips);
}

/**
 * Test helper that performs the full lengthening test workflow.
 * Returns result clips and warnings for assertions.
 */
export async function testLengthenClipTo4Bars(
  client: Client,
  trackIndex: number,
  options: {
    sleepMs?: number;
  } = {},
): Promise<{
  trackType: "midi" | "audio";
  initialClips: ReadClipResult[];
  resultClips: ReadClipResult[];
  warnings: string[];
}> {
  const sleepMs = options.sleepMs ?? 100;

  // Get initial clip
  const initial = await readClipsOnTrack(client, trackIndex);
  const clipId = initial.clips[0]?.id;

  if (!clipId) {
    throw new Error(`No clip found on track ${trackIndex}`);
  }

  // Lengthen to 4 bars
  const result = await lengthenClipTo4Bars(client, clipId);

  await new Promise((resolve) => setTimeout(resolve, sleepMs));

  // Read back result
  const { type: trackType, clips: resultClips } = await readClipsOnTrack(
    client,
    trackIndex,
  );
  const { warnings } = parseLengthenResult(result);

  return { trackType, initialClips: initial.clips, resultClips, warnings };
}
