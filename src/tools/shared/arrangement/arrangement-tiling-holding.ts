// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Holding area operations for arrangement clip tiling.
 * These functions create shortened clips in a holding area and adjust pre-roll.
 */

import { toLiveApiId } from "#src/tools/shared/utils.ts";
import {
  createAndDeleteTempClip,
  type TilingContext,
} from "./arrangement-tiling-helpers.ts";

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
  context: TilingContext,
): HoldingClipResult {
  // Store clip ID to prevent object staleness issues
  // sourceClip.id returns just the numeric ID string (e.g., "547")
  const sourceClipId = sourceClip.id;

  // Duplicate source clip to holding area
  const holdingResult = track.call(
    "duplicate_clip_to_arrangement",
    toLiveApiId(sourceClipId),
    holdingAreaStart,
  ) as [string, string | number];
  const holdingClip = LiveAPI.from(holdingResult);

  // Shorten holding clip to target length using temp clip technique
  const holdingClipEnd = holdingClip.getProperty("end_time") as number;
  const newHoldingEnd = holdingAreaStart + targetLength;
  const tempLength = holdingClipEnd - newHoldingEnd;

  // Only create temp clip if there's actually something to truncate
  // Use small epsilon to handle floating-point precision
  const EPSILON = 0.001;

  if (tempLength > EPSILON) {
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

/**
 * Adjusts a clip's pre-roll by setting start_marker to loop_start and shortening.
 * Only performs adjustment if the clip has pre-roll (start_marker < loop_start).
 *
 * @param clip - LiveAPI clip instance
 * @param track - LiveAPI track instance
 * @param isMidiClip - Whether the clip is MIDI (true) or audio (false)
 * @param context - Context object with silenceWavPath for audio clips
 */
export function adjustClipPreRoll(
  clip: LiveAPI,
  track: LiveAPI,
  isMidiClip: boolean,
  context: TilingContext,
): void {
  const startMarker = clip.getProperty("start_marker") as number;
  const loopStart = clip.getProperty("loop_start") as number;

  // Only adjust if clip has pre-roll
  if (startMarker < loopStart) {
    // Set start_marker to loop_start
    clip.set("start_marker", loopStart);

    // Shorten clip by the pre-roll amount
    const preRollLength = loopStart - startMarker;
    const clipEnd = clip.getProperty("end_time") as number;
    const newClipEnd = clipEnd - preRollLength;
    const tempClipLength = clipEnd - newClipEnd;

    createAndDeleteTempClip(
      track,
      newClipEnd,
      tempClipLength,
      isMidiClip,
      context,
    );
  }
}
