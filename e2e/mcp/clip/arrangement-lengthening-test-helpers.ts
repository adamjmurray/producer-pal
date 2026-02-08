// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Shared helpers for arrangement clip lengthening e2e tests
 */
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  type CreateClipResult,
  getToolWarnings,
  parseToolResult,
  type ReadClipResult,
} from "../mcp-test-helpers.ts";

export const ARRANGEMENT_CLIP_TESTS_PATH =
  "e2e/live-sets/arrangement-clip-tests Project/arrangement-clip-tests.als";

export const TARGET_LENGTH = "4:0"; // 4 bars
export const EPSILON = 0.01; // For floating-point comparisons

/**
 * Read all arrangement clips from a track.
 * Returns array since lengthening operations may create multiple clips (tiling).
 */
export async function readClipsOnTrack(
  client: Client,
  trackIndex: number,
): Promise<ReadClipResult[]> {
  const result = await client.callTool({
    name: "ppal-read-track",
    arguments: {
      trackIndex,
      include: ["arrangement-clips"],
    },
  });

  interface TrackResult {
    arrangementClips?: ReadClipResult[];
  }

  const track = parseToolResult<TrackResult>(result);

  return track.arrangementClips ?? [];
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
      ids: clipId,
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
  const warnings = getToolWarnings(result);

  // Try parsing as array first
  try {
    const asArray = parseToolResult<CreateClipResult[]>(
      result as Awaited<ReturnType<Client["callTool"]>>,
    );

    if (Array.isArray(asArray)) {
      return { clips: asArray, warnings };
    }
  } catch {
    // Not an array, try single object
  }

  // Parse as single object
  const asObject = parseToolResult<CreateClipResult>(
    result as Awaited<ReturnType<Client["callTool"]>>,
  );

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
 * Parse bar:beat or bar|beat notation to bars as decimal.
 * Examples: "1:2" = 1.5 bars, "1|1" = 0 bars (pipe is 1-indexed)
 */
function parseBarBeat(barBeat: string): number {
  // Handle both formats: "bar:beat" (0-indexed) and "bar|beat" (1-indexed)
  const separator = barBeat.includes("|") ? "|" : ":";
  const [bars, beats] = barBeat.split(separator).map(Number);

  // Pipe notation is 1-indexed (1|1 = bar 0, beat 0)
  const barOffset = separator === "|" ? -1 : 0;
  const beatOffset = separator === "|" ? -1 : 0;

  return (bars as number) + barOffset + ((beats as number) + beatOffset) / 4;
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
  initialClips: ReadClipResult[];
  resultClips: ReadClipResult[];
  warnings: string[];
}> {
  const sleepMs = options.sleepMs ?? 100;

  // Get initial clip
  const initialClips = await readClipsOnTrack(client, trackIndex);
  const clipId = initialClips[0]?.id;

  if (!clipId) {
    throw new Error(`No clip found on track ${trackIndex}`);
  }

  // Lengthen to 4 bars
  const result = await lengthenClipTo4Bars(client, clipId);

  await new Promise((resolve) => setTimeout(resolve, sleepMs));

  // Read back result
  const resultClips = await readClipsOnTrack(client, trackIndex);
  const { warnings } = parseLengthenResult(result);

  return { initialClips, resultClips, warnings };
}
