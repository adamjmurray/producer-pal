// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  abletonBeatsToBarBeat,
  barBeatDurationToAbletonBeats,
} from "#src/notation/barbeat/time/barbeat-time.ts";
import { errorMessage } from "#src/shared/error-utils.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/v8-max-console.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import {
  clearClipAtDuplicateTarget,
  createShortenedClipInHolding,
  moveClipFromHolding,
  type TilingContext,
} from "#src/tools/shared/arrangement/arrangement-tiling.ts";
import { toLiveApiId } from "#src/tools/shared/utils.ts";

/**
 * Parse arrangementLength from bar:beat duration format to absolute beats
 * @param arrangementLength - Length in bar:beat duration format (e.g. "2:0" for exactly two bars)
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
    const arrangementLengthBeats = barBeatDurationToAbletonBeats(
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

    if (msg.includes("Invalid bar:beat duration format")) {
      throw new Error(`duplicate failed: ${msg}`);
    }

    if (msg.includes("must be 0 or greater")) {
      throw new Error(
        `duplicate failed: arrangementLength ${msg.replace("in duration ", "")}`,
      );
    }

    throw error;
  }
}

export interface MinimalClipInfo {
  id: string;
  trackIndex?: number;
  sceneIndex?: number;
  arrangementStart?: string;
  name?: string;
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

  if (!omitFields.includes("trackIndex")) {
    result.trackIndex = trackIndex;
  }

  if (!omitFields.includes("sceneIndex")) {
    result.sceneIndex = sceneIndex;
  }

  return result;
}

/**
 * Create clips to fill the specified arrangement length
 * @param sourceClip - The source clip to duplicate
 * @param track - The track to create clips on
 * @param arrangementStartBeats - Start time in Ableton beats (quarter notes, 0-based)
 * @param arrangementLengthBeats - Total length to fill in Ableton beats (quarter notes)
 * @param name - Optional name for the clips
 * @param omitFields - Optional fields to omit from clip info
 * @param context - Context object with holdingAreaStartBeats and silenceWavPath
 * @returns Array of minimal clip info objects
 */
export function createClipsForLength(
  sourceClip: LiveAPI,
  track: LiveAPI,
  arrangementStartBeats: number,
  arrangementLengthBeats: number,
  name?: string,
  omitFields: string[] = [],
  context: Partial<ToolContext & TilingContext> = {},
): MinimalClipInfo[] {
  const sourceClipLength = sourceClip.getProperty("length") as number;
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

    if (name != null) newClip.set("name", name);
    duplicatedClips.push(getMinimalClipInfo(newClip, omitFields));
  } else {
    // Case 2: Lengthening or exact length - delegate to update-clip (handles looped/unlooped, MIDI/audio, etc.)
    clearClipAtDuplicateTarget(
      track,
      sourceClip.id,
      arrangementStartBeats,
      isMidiClip,
      context as TilingContext,
    );
    const newClipResult = track.call(
      "duplicate_clip_to_arrangement",
      toLiveApiId(sourceClip.id),
      arrangementStartBeats,
    ) as string;
    const newClip = LiveAPI.from(newClipResult);
    const newClipId = newClip.id;

    if (arrangementLengthBeats > sourceClipLength) {
      lengthenClipAndCollectInfo(
        sourceClip,
        track,
        newClipId,
        arrangementLengthBeats,
        name,
        omitFields,
        context,
        duplicatedClips,
      );
    } else {
      if (name != null) newClip.set("name", name);
      duplicatedClips.push(getMinimalClipInfo(newClip, omitFields));
    }
  }

  return duplicatedClips;
}

/**
 * Lengthens a clip and collects info about resulting clips
 * @param sourceClip - Source clip for time signature
 * @param track - Track containing the clip
 * @param newClipId - ID of the new clip to lengthen
 * @param targetBeats - Target length in beats
 * @param name - Optional name
 * @param omitFields - Fields to omit from results
 * @param context - Context object
 * @param duplicatedClips - Array to push results to
 */
function lengthenClipAndCollectInfo(
  sourceClip: LiveAPI,
  track: LiveAPI,
  newClipId: string,
  targetBeats: number,
  name: string | undefined,
  omitFields: string[],
  context: Partial<ToolContext & TilingContext>,
  duplicatedClips: MinimalClipInfo[],
): void {
  // Convert beats to bar:beat format using clip's time signature
  const timeSigNum = sourceClip.getProperty("signature_numerator") as number;
  const timeSigDenom = sourceClip.getProperty(
    "signature_denominator",
  ) as number;
  const beatsPerBar = 4 * (timeSigNum / timeSigDenom);
  const bars = Math.floor(targetBeats / beatsPerBar);
  const remainingBeats = targetBeats - bars * beatsPerBar;
  const arrangementLengthBarBeat = `${bars}:${remainingBeats.toFixed(3)}`;

  const updateResult = updateClip(
    { ids: newClipId, arrangementLength: arrangementLengthBarBeat, name },
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
 * Duplicate a clip slot to another slot
 * @param sourceTrackIndex - Source track index
 * @param sourceSceneIndex - Source scene index
 * @param toTrackIndex - Destination track index
 * @param toSceneIndex - Destination scene index
 * @param name - Optional name for the duplicated clip
 * @returns Minimal clip info object
 */
export function duplicateClipSlot(
  sourceTrackIndex: number,
  sourceSceneIndex: number,
  toTrackIndex: number,
  toSceneIndex: number,
  name?: string,
): MinimalClipInfo {
  // Get source clip slot
  const sourceClipSlot = LiveAPI.from(
    livePath.track(sourceTrackIndex).clipSlot(sourceSceneIndex),
  );

  if (!sourceClipSlot.exists()) {
    throw new Error(
      `duplicate failed: source clip slot at track ${sourceTrackIndex}, scene ${sourceSceneIndex} does not exist`,
    );
  }

  if (!sourceClipSlot.getProperty("has_clip")) {
    throw new Error(
      `duplicate failed: no clip in source clip slot at track ${sourceTrackIndex}, scene ${sourceSceneIndex}`,
    );
  }

  // Get destination clip slot
  const destClipSlot = LiveAPI.from(
    livePath.track(toTrackIndex).clipSlot(toSceneIndex),
  );

  if (!destClipSlot.exists()) {
    throw new Error(
      `duplicate failed: destination clip slot at track ${toTrackIndex}, scene ${toSceneIndex} does not exist`,
    );
  }

  // Use duplicate_clip_to to copy the clip to the destination
  sourceClipSlot.call("duplicate_clip_to", toLiveApiId(destClipSlot.id));

  // Get the newly created clip
  const newClip = LiveAPI.from(
    livePath.track(toTrackIndex).clipSlot(toSceneIndex).clip(),
  );

  if (name != null) {
    newClip.set("name", name);
  }

  // Return the new clip info directly
  return getMinimalClipInfo(newClip);
}

/**
 * Duplicate a clip to the arrangement view
 * @param clipId - Clip ID to duplicate
 * @param arrangementStartBeats - Start position in beats
 * @param name - Optional name for the duplicated clip(s)
 * @param arrangementLength - Optional length in bar:beat format
 * @param _songTimeSigNumerator - Song time signature numerator (unused but kept for API compat)
 * @param _songTimeSigDenominator - Song time signature denominator (unused but kept for API compat)
 * @param context - Context object with holdingAreaStartBeats and silenceWavPath
 * @returns Clip info or object with trackIndex and clips array
 */
export function duplicateClipToArrangement(
  clipId: string,
  arrangementStartBeats: number,
  name?: string,
  arrangementLength?: string,
  _songTimeSigNumerator = 4,
  _songTimeSigDenominator = 4,
  context: Partial<ToolContext & TilingContext> = {},
): MinimalClipInfo | { trackIndex: number; clips: MinimalClipInfo[] } {
  // Support "id {id}" (such as returned by childIds()) and id values directly
  const clip = LiveAPI.from(clipId);

  if (!clip.exists()) {
    throw new Error(`duplicate failed: no clip exists for clipId "${clipId}"`);
  }

  const trackIndex = clip.trackIndex;

  if (trackIndex == null) {
    throw new Error(
      `duplicate failed: no track index for clipId "${clipId}" (path=${clip.path})`,
    );
  }

  const track = LiveAPI.from(livePath.track(trackIndex));
  const duplicatedClips: MinimalClipInfo[] = [];

  if (arrangementLength != null) {
    // Use the clip's time signature for duration calculation
    const clipTimeSigNumerator = clip.getProperty(
      "signature_numerator",
    ) as number;
    const clipTimeSigDenominator = clip.getProperty(
      "signature_denominator",
    ) as number;
    const arrangementLengthBeats = parseArrangementLength(
      arrangementLength,
      clipTimeSigNumerator,
      clipTimeSigDenominator,
    );
    // When creating multiple clips, omit trackIndex since they all share the same track
    const clipsCreated = createClipsForLength(
      clip,
      track,
      arrangementStartBeats,
      arrangementLengthBeats,
      name,
      ["trackIndex"],
      context,
    );

    duplicatedClips.push(...clipsCreated);
  } else {
    // No length specified - use original behavior
    const isMidiClip = clip.getProperty("is_midi_clip") === 1;

    clearClipAtDuplicateTarget(
      track,
      clip.id,
      arrangementStartBeats,
      isMidiClip,
      context as TilingContext,
    );
    const newClipResult = track.call(
      "duplicate_clip_to_arrangement",
      toLiveApiId(clip.id),
      arrangementStartBeats,
    ) as string;
    const newClip = LiveAPI.from(newClipResult);

    newClip.setAll({
      name: name,
    });

    duplicatedClips.push(getMinimalClipInfo(newClip));
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
