// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Holding area operations: a shortened copy of a clip, made away from where it
 * will land.
 */

import { toLiveApiId } from "#src/tools/shared/helpers/live-api-values.ts";
import { clipFromDuplicateResult } from "./helpers/arrangement-duplicate-result.ts";
import {
  createAndDeleteTempClip,
  type ScratchClipContext,
} from "./helpers/scratch-clips.ts";
import { SAME_TIME_EPSILON } from "#src/shared/config.ts";

export interface HoldingClipResult {
  holdingClipId: string;
  holdingClip: LiveAPI;
}

/**
 * Creates a shortened copy of a clip in the holding area.
 * Uses the temp clip shortening technique to achieve the target length.
 *
 * @param sourceClip - LiveAPI clip instance to duplicate
 * @param track - LiveAPI track instance
 * @param targetLength - Desired clip length in beats
 * @param holdingAreaStart - Start position of holding area in beats
 * @param isMidiClip - Whether the clip is MIDI (true) or audio (false)
 * @param context - Context object with silenceWavPath for audio clips
 * @returns Holding clip ID and instance
 */
export function createShortenedClipInHolding(
  sourceClip: LiveAPI,
  track: LiveAPI,
  targetLength: number,
  holdingAreaStart: number,
  isMidiClip: boolean,
  context: ScratchClipContext,
): HoldingClipResult {
  // Store clip ID to prevent object staleness issues
  // sourceClip.id returns just the numeric ID string (e.g., "547")
  const sourceClipId = sourceClip.id;

  // Duplicate source clip to holding area
  const holdingClip = clipFromDuplicateResult(
    track.call(
      "duplicate_clip_to_arrangement",
      toLiveApiId(sourceClipId),
      holdingAreaStart,
    ),
  );

  // Surface a refused copy before the caller relies on holdingClipId —
  // otherwise downstream operations would no-op against id 0 and the copy
  // would silently go missing.
  if (!holdingClip.exists()) {
    throw new Error(
      `duplicate_clip_to_arrangement returned no clip for createShortenedClipInHolding (source ${sourceClipId} at ${holdingAreaStart})`,
    );
  }

  // Shorten holding clip to target length using temp clip technique
  const holdingClipEnd = holdingClip.getProperty("end_time") as number;
  const newHoldingEnd = holdingAreaStart + targetLength;
  const tempLength = holdingClipEnd - newHoldingEnd;

  // Only create temp clip if there's actually something to truncate
  // Use small epsilon to handle floating-point precision
  if (tempLength > SAME_TIME_EPSILON) {
    createAndDeleteTempClip(
      track,
      newHoldingEnd,
      tempLength,
      isMidiClip,
      context,
    );
  }

  return {
    holdingClipId: holdingClip.id,
    holdingClip,
  };
}
