// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  abletonBeatsToDuration,
  durationToAbletonBeats,
} from "#src/notation/barbeat/time/barbeat-time.ts";
import { errorMessage } from "#src/shared/error-utils.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { clipLengthBeats } from "#src/tools/clip/helpers/audio-clip-timing.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import { duplicateToArrangementTarget } from "#src/tools/shared/arrangement/arrangement-duplicate-target.ts";
import { type TilingContext } from "#src/tools/shared/arrangement/helpers/arrangement-tiling-helpers.ts";
import { createShortenedClipInHolding } from "#src/tools/shared/arrangement/arrangement-tiling-holding.ts";
import {
  holdingAreaStartOnTrack,
  moveClipFromHolding,
} from "#src/tools/shared/arrangement/arrangement-tiling-workaround.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";
import {
  getMinimalClipInfo,
  type MinimalClipInfo,
} from "../minimal-clip-info.ts";

/**
 * Parse arrangementLength from `[<count>bar+]n<fraction>` duration format to absolute beats
 * @param arrangementLength - Duration string (e.g. "2bar" for exactly two bars)
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @returns Length in Ableton beats
 */
export function parseArrangementLength(
  arrangementLength: string,
  timeSigNumerator: number,
  timeSigDenominator: number,
): number {
  try {
    const arrangementLengthBeats = durationToAbletonBeats(
      arrangementLength,
      timeSigNumerator,
      timeSigDenominator,
    );

    if (arrangementLengthBeats <= 0) {
      throw new Error(
        `arrangementLength must be positive, got "${arrangementLength}"`,
      );
    }

    return arrangementLengthBeats;
  } catch (error) {
    const msg = errorMessage(error);

    if (msg.includes("Invalid duration format")) {
      throw new Error(msg, { cause: error });
    }

    throw error;
  }
}

/**
 * Create clips to fill the specified arrangement length
 * @param sourceClip - The source clip to duplicate
 * @param track - The track to create clips on
 * @param arrangementStartBeats - Start time in Ableton beats (quarter notes, 0-based)
 * @param arrangementLengthBeats - Total length to fill in Ableton beats (quarter notes)
 * @param songTimeSigNumerator - Song time signature numerator (re-encodes length for updateClip)
 * @param songTimeSigDenominator - Song time signature denominator (re-encodes length for updateClip)
 * @param name - Optional name for the clips
 * @param context - Context object with silenceWavPath
 * @param color - Optional color for the clips
 * @returns Array of minimal clip info objects
 */
export async function createClipsForLength(
  sourceClip: LiveAPI,
  track: LiveAPI,
  arrangementStartBeats: number,
  arrangementLengthBeats: number,
  songTimeSigNumerator: number,
  songTimeSigDenominator: number,
  name?: string,
  context: Partial<ToolContext & TilingContext> = {},
  color?: string,
): Promise<MinimalClipInfo[]> {
  const sourceClipLength = clipLengthBeats(sourceClip);
  const isMidiClip = sourceClip.getProperty("is_midi_clip") === 1;
  const duplicatedClips: MinimalClipInfo[] = [];

  if (arrangementLengthBeats < sourceClipLength) {
    // Case 1: Shortening - use holding area approach (preserves clip data including envelopes)
    if (!isMidiClip && !context.silenceWavPath) {
      console.warn(
        "silenceWavPath missing in context - audio clip shortening may fail",
      );
    }

    // The holding copy is what gets moved onto the target, so it must not be
    // sitting there already: moveClipFromHolding would read that as a
    // self-overlap and skip the clear it needs to avoid the Ableton crash.
    // Read the track each time — a multi-position duplicate places copies as it
    // goes, and one of them may already be where an earlier start pointed.
    const holdingStart = holdingAreaStartOnTrack(
      track,
      arrangementStartBeats + arrangementLengthBeats,
    );

    const { holdingClipId } = createShortenedClipInHolding(
      sourceClip,
      track,
      arrangementLengthBeats,
      holdingStart,
      isMidiClip,
      context as TilingContext,
    );
    const newClip = moveClipFromHolding(
      holdingClipId,
      track,
      arrangementStartBeats,
      isMidiClip,
      context as TilingContext,
    );

    newClip.setAll({ name, color });
    duplicatedClips.push(getMinimalClipInfo(newClip));
  } else {
    // Case 2: Lengthening or exact length - delegate to update-clip (handles looped/unlooped, MIDI/audio, etc.)
    // Routes a self-overlapping source through the holding area (overwrite
    // semantics) instead of skipping; clears other overlapping clips otherwise.
    const newClip = duplicateToArrangementTarget(
      track,
      sourceClip.id,
      arrangementStartBeats,
      isMidiClip,
      context as TilingContext,
      sourceClip,
    );

    // Skip a silent Ableton dup failure (["id", 0]) rather than lengthen/label a
    // phantom clip, matching the no-length path and the arrangement-tiling guards.
    if (!newClip.exists()) {
      console.warn(
        `Failed to duplicate clip ${targetLabel(sourceClip)} to arrangement at ${arrangementStartBeats}, skipping`,
      );

      return duplicatedClips;
    }

    const newClipId = newClip.id;

    if (arrangementLengthBeats > sourceClipLength) {
      await lengthenClipAndCollectInfo(
        track,
        newClipId,
        arrangementLengthBeats,
        songTimeSigNumerator,
        songTimeSigDenominator,
        name,
        color,
        context,
        duplicatedClips,
      );
    } else {
      newClip.setAll({ name, color });
      duplicatedClips.push(getMinimalClipInfo(newClip));
    }
  }

  return duplicatedClips;
}

/**
 * Lengthens a clip and collects info about resulting clips
 * @param track - Track containing the clip
 * @param newClipId - ID of the new clip to lengthen
 * @param targetBeats - Target length in beats
 * @param songTimeSigNumerator - Song time signature numerator (re-encodes length)
 * @param songTimeSigDenominator - Song time signature denominator (re-encodes length)
 * @param name - Optional name
 * @param color - Optional color
 * @param context - Context object
 * @param duplicatedClips - Array to push results to
 */
async function lengthenClipAndCollectInfo(
  track: LiveAPI,
  newClipId: string,
  targetBeats: number,
  songTimeSigNumerator: number,
  songTimeSigDenominator: number,
  name: string | undefined,
  color: string | undefined,
  context: Partial<ToolContext & TilingContext>,
  duplicatedClips: MinimalClipInfo[],
): Promise<void> {
  // Re-encode the target length in the SONG time signature — the same meter
  // updateClip's parser decodes arrangementLength with — so a bar-aligned length
  // round-trips to the same beats even when the clip's own meter differs.
  const arrangementLength = abletonBeatsToDuration(
    targetBeats,
    songTimeSigNumerator,
    songTimeSigDenominator,
  );

  const updateResult = await updateClip(
    { ids: newClipId, arrangementLength, name, color },
    context,
  );

  // updateClip returns array of clip objects with id property
  const clipResults = (
    Array.isArray(updateResult) ? updateResult : [updateResult]
  ) as { id: string }[];
  const arrangementClipIds = track.getChildIds("arrangement_clips");

  for (const clipObj of clipResults) {
    const clipLiveAPI = arrangementClipIds
      .map((id) => LiveAPI.from(id))
      .find((c) => c.id === clipObj.id);

    if (clipLiveAPI) {
      duplicatedClips.push(getMinimalClipInfo(clipLiveAPI));
    }
  }
}
