// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Shared helpers for arrangement clip splitting e2e tests.
 * Depends on arrangement-lengthening-test-helpers for shared utilities.
 */
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  getToolWarnings,
  type ReadClipResult,
  sleep,
} from "../mcp-test-helpers.ts";
import {
  EPSILON,
  parseBarBeat,
  readClipsOnTrack,
} from "./arrangement-lengthening-test-helpers.ts";

/** Split 1 beat into each clip — works for any clip >= 2 beats */
export const SPLIT_POINT = "1|2";

/**
 * Split a clip via ppal-update-clip.
 * Returns raw result for warning extraction.
 */
export async function splitClip(
  client: Client,
  clipId: string,
): Promise<unknown> {
  return await client.callTool({
    name: "ppal-update-clip",
    arguments: {
      ids: clipId,
      split: SPLIT_POINT,
    },
  });
}

/**
 * Test helper that splits the clip on a track and verifies the result.
 * Splits at beat 2 (1|2) which is 1 beat into the clip.
 */
export async function testSplitClip(
  client: Client,
  trackIndex: number,
  options: { sleepMs?: number } = {},
): Promise<{
  initialClips: ReadClipResult[];
  resultClips: ReadClipResult[];
  warnings: string[];
}> {
  const sleepMs = options.sleepMs ?? 100;

  // Read initial clip
  const initialClips = await readClipsOnTrack(client, trackIndex);
  const clipId = initialClips[0]?.id;

  if (!clipId) {
    throw new Error(`No clip found on track ${trackIndex}`);
  }

  // Split at beat 2 (1 beat into the clip)
  const result = await splitClip(client, clipId);
  const warnings = getToolWarnings(result);

  await sleep(sleepMs);

  // Read result clips
  const resultClips = await readClipsOnTrack(client, trackIndex);

  return { initialClips, resultClips, warnings };
}

/**
 * Assert that clips are contiguous (each starts where the previous ends).
 */
export function assertContiguousClips(clips: ReadClipResult[]): void {
  if (clips.length <= 1) return;

  const sorted = [...clips].sort((a, b) => {
    const aStart = a.arrangementStart ? parseBarBeat(a.arrangementStart) : 0;
    const bStart = b.arrangementStart ? parseBarBeat(b.arrangementStart) : 0;

    return aStart - bStart;
  });

  for (let i = 0; i < sorted.length - 1; i++) {
    const clip = sorted[i] as ReadClipResult; // loop bounds guarantee valid index
    const next = sorted[i + 1] as ReadClipResult; // loop bounds guarantee valid index

    if (
      !clip.arrangementStart ||
      !clip.arrangementLength ||
      !next.arrangementStart
    ) {
      continue;
    }

    const clipEnd =
      parseBarBeat(clip.arrangementStart) +
      parseBarBeat(clip.arrangementLength);
    const nextStart = parseBarBeat(next.arrangementStart);

    if (Math.abs(clipEnd - nextStart) > EPSILON) {
      throw new Error(
        `Gap between clip ${i} (end=${clipEnd.toFixed(3)}) and clip ${i + 1} (start=${nextStart.toFixed(3)})`,
      );
    }
  }
}
