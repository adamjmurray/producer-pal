// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  abletonBeatsToDuration,
  durationToAbletonBeats,
} from "#src/notation/barbeat/time/barbeat-time.ts";
import { errorMessage } from "#src/shared/error-utils.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
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
import {
  arrangementPath,
  slotPath,
} from "#src/tools/shared/validation/helpers/object-path-helpers.ts";
import {
  objectPathForApi,
  targetLabel,
} from "#src/tools/shared/validation/object-path-for-api.ts";

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

export interface MinimalClipInfo {
  id: string;
  /** Where the clip is: "t0/s3" in the session, "t0[5|1]" or "t0/l0[5|1]" in
   * the arrangement. Pastes straight back into any path/toPath param. */
  path?: string;
  name?: string;
  noteCount?: number;
  transformed?: number;
}

/**
 * Get minimal clip information for result objects
 * @param clip - The clip to get info from
 * @returns Minimal clip info object
 */
export function getMinimalClipInfo(clip: LiveAPI): MinimalClipInfo {
  const isArrangementClip =
    (clip.getProperty("is_arrangement_clip") as number) > 0;

  if (isArrangementClip) {
    if (clip.trackIndex == null) {
      throw new Error(
        `could not determine trackIndex for clip (path="${clip.path}")`,
      );
    }

    // The path spells the lane and the start, so nothing else reports either.
    return { id: clip.id, path: objectPathForApi(clip) };
  }

  const trackIndex = clip.trackIndex;
  const sceneIndex = clip.sceneIndex;

  if (trackIndex == null || sceneIndex == null) {
    throw new Error(
      `could not determine trackIndex/sceneIndex for clip (path="${clip.path}")`,
    );
  }

  return { id: clip.id, path: slotPath(trackIndex, sceneIndex) };
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
      duplicatedClips.push(getMinimalClipInfo(clipLiveAPI));
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
 * @param context - Context object with silenceWavPath
 * @param sourceClip - The clip, when the caller already resolved it
 * @param tracks - The destination tracks, keyed by index
 * @returns Clip info, or the destination track's path with a clips array
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
  sourceClip: LiveAPI | null = null,
  tracks: Map<number, LiveAPI> = new Map(),
): Promise<MinimalClipInfo | { path: string; clips: MinimalClipInfo[] }> {
  // Support "id {id}" (such as returned by childIds()) and id values directly.
  // A source hoisted across the copies of one call stays good: Live's
  // arrangement duplicate never destroys its own source — measured on 12.4.3,
  // an exact self-cover no-ops and hands back the source's own id — and
  // clearClipAtDuplicateTarget refuses to clear it. That matters because
  // exists() could not tell us otherwise: a dead handle keeps its id
  // (dev/LiveAPI-Object-Reuse.md).
  const clip = sourceClip ?? LiveAPI.from(clipId);

  if (!clip.exists()) {
    throw new Error(`no clip exists for clipId "${clipId}"`);
  }

  const trackIndex = destTrackIndex ?? clip.trackIndex;

  if (trackIndex == null) {
    throw new Error(
      `no track index for clipId "${clipId}" (path=${clip.path})`,
    );
  }

  const track =
    tracks.get(trackIndex) ?? LiveAPI.from(livePath.track(trackIndex));
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
    const clipsCreated = await createClipsForLength(
      clip,
      track,
      arrangementStartBeats,
      arrangementLengthBeats,
      songTimeSigNumerator,
      songTimeSigDenominator,
      name,
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
      clip,
    );

    // Skip a silent Ableton dup failure (["id", 0]) rather than push a phantom
    // clip, matching the guards in arrangement-tiling and update-clip.
    if (newClip.exists()) {
      newClip.setAll({ name, color });
      duplicatedClips.push(getMinimalClipInfo(newClip));
    } else {
      console.warn(
        `Failed to duplicate clip ${targetLabel(clip)} to arrangement at ${arrangementStartBeats}, skipping`,
      );
    }
  }

  // Return single clip info directly, or the track the tiled copies share
  if (duplicatedClips.length === 1) {
    return duplicatedClips[0] as MinimalClipInfo;
  }

  return {
    path: arrangementPath(trackIndex),
    clips: duplicatedClips,
  };
}
