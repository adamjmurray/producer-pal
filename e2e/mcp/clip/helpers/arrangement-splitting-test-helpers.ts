// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Shared helpers for arrangement clip splitting e2e tests.
 * Depends on arrangement-lengthening-test-helpers for shared utilities.
 */
import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  getToolWarnings,
  type ReadClipResult,
  sleep,
} from "../../mcp-test-helpers.ts";
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
  splitPoint: string = SPLIT_POINT,
): Promise<unknown> {
  return await client.callTool({
    name: "ppal-update-clip",
    arguments: {
      ids: clipId,
      split: splitPoint,
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
  options: { sleepMs?: number; splitPoint?: string } = {},
): Promise<{
  initialClips: ReadClipResult[];
  resultClips: ReadClipResult[];
  warnings: string[];
}> {
  const sleepMs = options.sleepMs ?? 100;
  const splitPoint = options.splitPoint ?? SPLIT_POINT;

  // Read initial clip
  const initialClips = await readClipsOnTrack(client, trackIndex);
  const clipId = initialClips[0]?.id;

  if (!clipId) {
    throw new Error(`No clip found on track ${trackIndex}`);
  }

  // Split at specified point (default: beat 2, 1 beat into the clip)
  const result = await splitClip(client, clipId, splitPoint);
  const warnings = getToolWarnings(result);

  await sleep(sleepMs);

  // Read result clips
  const resultClips = await readClipsOnTrack(client, trackIndex);

  return { initialClips, resultClips, warnings };
}

/** Sort clips by arrangement start position */
function sortByArrangementStart(clips: ReadClipResult[]): ReadClipResult[] {
  return [...clips].sort((a, b) => {
    const aStart = a.arrangementStart ? parseBarBeat(a.arrangementStart) : 0;
    const bStart = b.arrangementStart ? parseBarBeat(b.arrangementStart) : 0;

    return aStart - bStart;
  });
}

/**
 * Assert that the combined span of result clips matches the original clip(s).
 * Verifies the first result clip starts where the original started and
 * the last result clip ends where the original ended.
 */
export function assertSpanPreserved(
  initialClips: ReadClipResult[],
  resultClips: ReadClipResult[],
): void {
  const initial = initialClips[0];

  if (!initial?.arrangementStart || !initial.arrangementLength) {
    throw new Error("Initial clip missing arrangement data");
  }

  const initialStart = parseBarBeat(initial.arrangementStart);
  const initialEnd = initialStart + parseBarBeat(initial.arrangementLength);

  const sorted = sortByArrangementStart(resultClips);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  if (
    !first?.arrangementStart ||
    !last?.arrangementStart ||
    !last.arrangementLength
  ) {
    throw new Error("Result clips missing arrangement data");
  }

  const resultStart = parseBarBeat(first.arrangementStart);
  const resultEnd =
    parseBarBeat(last.arrangementStart) + parseBarBeat(last.arrangementLength);

  if (Math.abs(resultStart - initialStart) > EPSILON) {
    throw new Error(
      `Span start mismatch: initial=${initialStart.toFixed(3)}, result=${resultStart.toFixed(3)}`,
    );
  }

  if (Math.abs(resultEnd - initialEnd) > EPSILON) {
    throw new Error(
      `Span end mismatch: initial=${initialEnd.toFixed(3)}, result=${resultEnd.toFixed(3)}`,
    );
  }
}

/**
 * Assert that clips are contiguous (each starts where the previous ends).
 */
export function assertContiguousClips(clips: ReadClipResult[]): void {
  if (clips.length <= 1) return;

  const sorted = sortByArrangementStart(clips);

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
