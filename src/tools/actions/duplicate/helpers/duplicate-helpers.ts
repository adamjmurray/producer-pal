// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  abletonBeatsToBarBeat,
  abletonBeatsToDuration,
  durationToAbletonBeats,
} from "#src/notation/barbeat/time/barbeat-time.ts";
import { errorMessage } from "#src/shared/error-utils.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { clipLengthBeats } from "#src/tools/clip/helpers/audio-clip-timing.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import { duplicateToArrangementTarget } from "#src/tools/shared/arrangement/arrangement-duplicate-target.ts";
import { type TilingContext } from "#src/tools/shared/arrangement/arrangement-tiling-helpers.ts";
import { createShortenedClipInHolding } from "#src/tools/shared/arrangement/arrangement-tiling-holding.ts";
import { moveClipFromHolding } from "#src/tools/shared/arrangement/arrangement-tiling-workaround.ts";
import { formatSlot } from "#src/tools/shared/validation/position-parsing.ts";

/**
 * Parse arrangementLength from `[Nbar+]n<fraction>` duration format to absolute beats
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
        `duplicate failed: arrangementLength must be positive, got "${arrangementLength}"`,
      );
    }

    return arrangementLengthBeats;
  } catch (error) {
    const msg = errorMessage(error);

    if (msg.includes("Invalid duration format")) {
      throw new Error(`duplicate failed: ${msg}`, { cause: error });
    }

    throw error;
  }
}

export interface MinimalClipInfo {
  id: string;
  slot?: string;
  trackIndex?: number;
  arrangementStart?: string;
  /** 1-based take lane number, present only for clips on a take lane */
  takeLane?: number;
  name?: string;
  noteCount?: number;
  transformed?: number;
}

/**
 * Get minimal clip information for result objects
 * @param clip - The clip to get info from
 * @param omitFields - Optional fields to omit from result
 * @returns Minimal clip info object
 */
export function getMinimalClipInfo(
  clip: LiveAPI,
  omitFields: string[] = [],
): MinimalClipInfo {
  const isArrangementClip =
    (clip.getProperty("is_arrangement_clip") as number) > 0;

  if (isArrangementClip) {
    const trackIndex = clip.trackIndex;

    if (trackIndex == null) {
      throw new Error(
        `getMinimalClipInfo failed: could not determine trackIndex for clip (path="${clip.path}")`,
      );
    }

    const arrangementStartBeats = clip.getProperty("start_time") as number;
    // Convert to bar|beat format using song time signature
    const liveSet = LiveAPI.from(livePath.liveSet);
    const timeSigNum = liveSet.getProperty("signature_numerator") as number;
    const timeSigDenom = liveSet.getProperty("signature_denominator") as number;
    const arrangementStart = abletonBeatsToBarBeat(
      arrangementStartBeats,
      timeSigNum,
      timeSigDenom,
    );

    const result: MinimalClipInfo = {
      id: clip.id,
    };

    if (!omitFields.includes("trackIndex")) {
      result.trackIndex = trackIndex;
    }

    if (!omitFields.includes("arrangementStart")) {
      result.arrangementStart = arrangementStart;
    }

    // Surface the take lane (1-based) when the clip landed on one
    const takeLaneIndex = clip.takeLaneIndex;

    if (takeLaneIndex != null) {
      result.takeLane = takeLaneIndex + 1;
    }

    return result;
  }

  const trackIndex = clip.trackIndex;
  const sceneIndex = clip.sceneIndex;

  if (trackIndex == null || sceneIndex == null) {
    throw new Error(
      `getMinimalClipInfo failed: could not determine trackIndex/sceneIndex for clip (path="${clip.path}")`,
    );
  }

  const result: MinimalClipInfo = {
    id: clip.id,
  };

  if (!omitFields.includes("slot")) {
    result.slot = formatSlot(trackIndex, sceneIndex);
  }

  return result;
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
 * @param omitFields - Optional fields to omit from clip info
 * @param context - Context object with holdingAreaStartBeats and silenceWavPath
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
  omitFields: string[] = [],
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

    const { holdingClipId } = createShortenedClipInHolding(
      sourceClip,
      track,
      arrangementLengthBeats,
      context.holdingAreaStartBeats as number,
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
    duplicatedClips.push(getMinimalClipInfo(newClip, omitFields));
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
    );

    // Skip a silent Ableton dup failure (["id", 0]) rather than lengthen/label a
    // phantom clip, matching the no-length path and the arrangement-tiling guards.
    if (!newClip.exists()) {
      console.warn(
        `Failed to duplicate clip ${sourceClip.id} to arrangement at ${arrangementStartBeats}, skipping`,
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
        omitFields,
        context,
        duplicatedClips,
      );
    } else {
      newClip.setAll({ name, color });
      duplicatedClips.push(getMinimalClipInfo(newClip, omitFields));
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
 * @param omitFields - Fields to omit from results
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
  omitFields: string[],
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
    { ids: newClipId, arrangementLength, name },
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
      duplicatedClips.push(getMinimalClipInfo(clipLiveAPI, omitFields));
    }
  }
}

/**
 * Duplicate a clip to the arrangement view
 * @param clipId - Clip ID to duplicate
 * @param arrangementStartBeats - Start position in beats
 * @param destTrackIndex - Track to place the copy on (may differ from the source's)
 * @param name - Optional name for the duplicated clip(s)
 * @param color - Optional color for the duplicated clip(s)
 * @param arrangementLength - Optional length (Nbar, n<fraction>, or Nbar+n<fraction>)
 * @param songTimeSigNumerator - Song time signature numerator (resolves arrangementLength bars)
 * @param songTimeSigDenominator - Song time signature denominator (resolves arrangementLength bars)
 * @param context - Context object with holdingAreaStartBeats and silenceWavPath
 * @returns Clip info or object with trackIndex and clips array
 */
export async function duplicateClipToArrangement(
  clipId: string,
  arrangementStartBeats: number,
  destTrackIndex?: number,
  name?: string,
  color?: string,
  arrangementLength?: string,
  songTimeSigNumerator = 4,
  songTimeSigDenominator = 4,
  context: Partial<ToolContext & TilingContext> = {},
): Promise<MinimalClipInfo | { trackIndex: number; clips: MinimalClipInfo[] }> {
  // Support "id {id}" (such as returned by childIds()) and id values directly
  const clip = LiveAPI.from(clipId);

  if (!clip.exists()) {
    throw new Error(`duplicate failed: no clip exists for clipId "${clipId}"`);
  }

  const trackIndex = destTrackIndex ?? clip.trackIndex;

  if (trackIndex == null) {
    throw new Error(
      `duplicate failed: no track index for clipId "${clipId}" (path=${clip.path})`,
    );
  }

  const track = LiveAPI.from(livePath.track(trackIndex));
  const duplicatedClips: MinimalClipInfo[] = [];

  if (arrangementLength != null) {
    // Resolve bars against the SONG meter, consistent with every other
    // arrangement-facing surface (create/update clip, read-clip read-back). The
    // clip's own meter governs its internal notation, not its arrangement span.
    const arrangementLengthBeats = parseArrangementLength(
      arrangementLength,
      songTimeSigNumerator,
      songTimeSigDenominator,
    );
    // When creating multiple clips, omit trackIndex since they all share the same track
    const clipsCreated = await createClipsForLength(
      clip,
      track,
      arrangementStartBeats,
      arrangementLengthBeats,
      songTimeSigNumerator,
      songTimeSigDenominator,
      name,
      ["trackIndex"],
      context,
      color,
    );

    duplicatedClips.push(...clipsCreated);
  } else {
    // No length specified - use original behavior. Routes a self-overlapping
    // source through the holding area (overwrite semantics) instead of skipping;
    // clears other overlapping clips otherwise.
    const isMidiClip = clip.getProperty("is_midi_clip") === 1;

    const newClip = duplicateToArrangementTarget(
      track,
      clip.id,
      arrangementStartBeats,
      isMidiClip,
      context as TilingContext,
    );

    // Skip a silent Ableton dup failure (["id", 0]) rather than push a phantom
    // clip, matching the guards in arrangement-tiling and update-clip.
    if (newClip.exists()) {
      newClip.setAll({ name, color });
      duplicatedClips.push(getMinimalClipInfo(newClip));
    } else {
      console.warn(
        `Failed to duplicate clip ${clip.id} to arrangement at ${arrangementStartBeats}, skipping`,
      );
    }
  }

  // Return single clip info directly, or clips array with trackIndex for multiple
  if (duplicatedClips.length === 1) {
    return duplicatedClips[0] as MinimalClipInfo;
  }

  return {
    trackIndex,
    clips: duplicatedClips,
  };
}
