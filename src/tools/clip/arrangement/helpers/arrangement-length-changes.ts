// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { errorMessage } from "#src/shared/error-message.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { requireCreatedClip } from "#src/tools/clip/helpers/clip-results.ts";
import { clipFromDuplicateResult } from "#src/tools/shared/arrangement/helpers/arrangement-duplicate-result.ts";
import { type LaneView } from "#src/tools/shared/arrangement/helpers/arrangement-lane-view.ts";
import {
  createAudioClipInSession,
  removeSessionClip,
  type CreatedClip,
  EPSILON,
  type TilingContext,
} from "#src/tools/shared/arrangement/helpers/arrangement-tiling-clips.ts";
import { tileClipToRange } from "#src/tools/shared/arrangement/arrangement-tiling.ts";
import { toLiveApiId } from "#src/tools/shared/helpers/live-api-values.ts";
import {
  pathPrefix,
  targetLabel,
} from "#src/tools/shared/validation/object-path-for-api.ts";
import {
  clipReporterFor,
  noteClipReason,
  noteLanded,
  type ClipReasons,
} from "#src/tools/clip/update/helpers/entries/clip-reasons.ts";
import { handleUnloopedLengthening } from "./unlooped-lengthening.ts";

export interface ArrangementContext {
  silenceWavPath?: string;
  /** What is on the arrangement lanes, shared with every write in the call. */
  lanes?: LaneView;
}

export interface ClipIdResult {
  id: string;
}

interface HandleArrangementLengtheningArgs {
  clip: LiveAPI;
  isAudioClip: boolean;
  arrangementLengthBeats: number;
  currentArrangementLength: number;
  currentStartTime: number;
  currentEndTime: number;
  context: ArrangementContext;
  /** What each clip has to say beyond its result. */
  reasons: ClipReasons;
}

/**
 * Handle lengthening of arrangement clips via tiling or content exposure
 * @param options - Parameters object
 * @param options.clip - The LiveAPI clip object to lengthen
 * @param options.isAudioClip - Whether the clip is an audio clip
 * @param options.arrangementLengthBeats - Target length in beats
 * @param options.currentArrangementLength - Current length in beats
 * @param options.currentStartTime - Current start time in beats
 * @param options.currentEndTime - Current end time in beats
 * @param options.context - Per-request context
 * @param options.reasons - What each clip has to say beyond its result
 * @returns Array of updated clip info
 */
export function handleArrangementLengthening({
  clip,
  isAudioClip,
  arrangementLengthBeats,
  currentArrangementLength,
  currentStartTime,
  currentEndTime,
  context,
  reasons,
}: HandleArrangementLengtheningArgs): ClipIdResult[] {
  const updatedClips: ClipIdResult[] = [];

  const isLooping = (clip.getProperty("looping") as number) > 0;
  const clipLoopStart = clip.getProperty("loop_start") as number;
  const clipLoopEnd = clip.getProperty("loop_end") as number;
  const clipStartMarker = clip.getProperty("start_marker") as number;
  const clipEndMarker = clip.getProperty("end_marker") as number;

  // For unlooped clips, use end_marker - start_marker (actual playback length)
  // For looped clips, use loop region
  const clipLength = isLooping
    ? clipLoopEnd - clipLoopStart
    : clipEndMarker - clipStartMarker;

  // Get track for clip operations
  const trackIndex = clip.trackIndex;

  if (trackIndex == null) {
    throw new Error(`no track for clip ${targetLabel(clip)}`);
  }

  const track = LiveAPI.from(livePath.track(trackIndex));
  // Tiling speaks for this clip, so what it has to say goes on this clip's
  // entry rather than into a warning.
  const tilingContext: TilingContext = {
    ...(context as TilingContext),
    reportClip: clipReporterFor(reasons),
    // A scratch clip Live won't remove is this clip's to report.
    reportScratch: (message) => noteClipReason(reasons, clip.id, message),
  };

  // Handle unlooped clips separately from looped clips
  if (!isLooping) {
    const grown = handleUnloopedLengthening({
      clip,
      isAudioClip,
      arrangementLengthBeats,
      currentArrangementLength,
      currentEndTime,
      clipStartMarker,
      track,
      reasons,
    });

    // It returns the clip only when it grew.
    if (grown.length > 0) {
      noteLanded(reasons, "lengthened", { id: clip.id });
    }

    return grown;
  }

  // Tiles land one at a time, so a throw partway leaves some in the Set.
  // Report those, with why the rest didn't land.
  const placed: CreatedClip[] = [];
  let tiledClips: ClipIdResult[];

  try {
    // Branch: expose hidden content vs tiling (looped clips only)
    if (arrangementLengthBeats < clipLength) {
      // Expose hidden content by tiling with start_marker offsets
      const currentOffset = clipStartMarker - clipLoopStart;
      const remainingLength = arrangementLengthBeats - currentArrangementLength;

      tiledClips = tileClipToRange(
        clip,
        track,
        currentEndTime,
        remainingLength,
        tilingContext,
        {
          adjustPreRoll: false,
          startOffset: currentOffset + currentArrangementLength,
          tileLength: currentArrangementLength,
          placed,
        },
      );
    } else {
      const currentOffset = clipStartMarker - clipLoopStart;
      // One pass is the whole loop plus any pre-roll: a start marker inside
      // the loop doesn't shorten it, Live wraps to loop_start and plays out
      // the rest.
      const totalContentLength =
        clipLoopEnd - Math.min(clipStartMarker, clipLoopStart);

      tiledClips = createLoopedClipTiles({
        clip,
        isAudioClip,
        arrangementLengthBeats,
        currentArrangementLength,
        currentStartTime,
        currentEndTime,
        totalContentLength,
        currentOffset,
        track,
        context: tilingContext,
        placed,
        reasons,
      });
    }
  } catch (error) {
    if (placed.length === 0) {
      throw error;
    }

    noteClipReason(
      reasons,
      clip.id,
      `arrangementLength didn't finish: ${errorMessage(error)}`,
    );
    tiledClips = placed;
  }

  // A pass whose every tile was refused changed nothing.
  if (tiledClips.length > 0) {
    noteLanded(reasons, "lengthened", { id: clip.id });
  }

  updatedClips.push({ id: clip.id });
  updatedClips.push(...tiledClips);

  return updatedClips;
}

interface CreateLoopedClipTilesArgs {
  clip: LiveAPI;
  isAudioClip: boolean;
  arrangementLengthBeats: number;
  currentArrangementLength: number;
  currentStartTime: number;
  currentEndTime: number;
  totalContentLength: number;
  currentOffset: number;
  track: LiveAPI;
  context: TilingContext;
  /** Collects each tile as it lands */
  placed: CreatedClip[];
  /** What each clip has to say beyond its result. */
  reasons: ClipReasons;
}

/**
 * Create tiles for looped clips
 * @param options - Parameters object
 * @param options.clip - The LiveAPI clip object
 * @param options.isAudioClip - Whether the clip is an audio clip
 * @param options.arrangementLengthBeats - Target length in beats
 * @param options.currentArrangementLength - Current length in beats
 * @param options.currentStartTime - Current start time in beats
 * @param options.currentEndTime - Current end time in beats
 * @param options.totalContentLength - Total content length in beats
 * @param options.currentOffset - Current offset from loop start
 * @param options.track - The LiveAPI track object
 * @param options.context - Tool execution context
 * @param options.placed - Collects each tile as it lands
 * @param options.reasons - What each clip has to say beyond its result
 * @returns Array of tiled clip info
 */
function createLoopedClipTiles({
  clip,
  isAudioClip,
  arrangementLengthBeats,
  currentArrangementLength,
  currentStartTime,
  currentEndTime,
  totalContentLength,
  currentOffset,
  track,
  context,
  placed,
  reasons,
}: CreateLoopedClipTilesArgs): ClipIdResult[] {
  const updatedClips: ClipIdResult[] = [];

  // Showing less than one pass: tile with start_marker offsets. EPSILON keeps
  // a float wobble between two Live reads from truncating an exact pass.
  if (currentArrangementLength < totalContentLength - EPSILON) {
    const remainingLength = arrangementLengthBeats - currentArrangementLength;
    const tiledClips = tileClipToRange(
      clip,
      track,
      currentEndTime,
      remainingLength,
      context,
      {
        adjustPreRoll: true,
        startOffset: currentOffset + currentArrangementLength,
        tileLength: currentArrangementLength,
        placed,
      },
    );

    updatedClips.push(...tiledClips);

    return updatedClips;
  }

  // If current arrangement length > total content length, shorten first then tile
  if (currentArrangementLength > totalContentLength + EPSILON) {
    let newEndTime = currentStartTime + totalContentLength;
    const tempClipLength = currentEndTime - newEndTime;

    // Create temp clip to truncate
    truncateWithTempClip({
      track,
      isAudioClip,
      position: newEndTime,
      length: tempClipLength,
      silenceWavPath: context.silenceWavPath,
      lanes: context.lanes,
      reportScratch: context.reportScratch,
    });
    // The clip is shorter from here, whatever the tiles after it do.
    noteLanded(reasons, "shortened", { id: clip.id });

    newEndTime = currentStartTime + totalContentLength;
    const firstTileLength = newEndTime - currentStartTime;
    const remainingSpace = arrangementLengthBeats - firstTileLength;
    const tiledClips = tileClipToRange(
      clip,
      track,
      newEndTime,
      remainingSpace,
      context,
      {
        adjustPreRoll: true,
        tileLength: firstTileLength,
        placed,
      },
    );

    updatedClips.push(...tiledClips);

    return updatedClips;
  }

  // Tile the properly-sized clip at the same loop phase; only the first pass
  // plays the pre-roll.
  const firstTileLength = currentEndTime - currentStartTime;
  const remainingSpace = arrangementLengthBeats - firstTileLength;
  const tiledClips = tileClipToRange(
    clip,
    track,
    currentEndTime,
    remainingSpace,
    context,
    {
      adjustPreRoll: true,
      startOffset: Math.max(currentOffset, 0),
      tileLength: firstTileLength,
      placed,
    },
  );

  updatedClips.push(...tiledClips);

  return updatedClips;
}

interface HandleArrangementShorteningArgs {
  clip: LiveAPI;
  isAudioClip: boolean;
  arrangementLengthBeats: number;
  currentStartTime: number;
  currentEndTime: number;
  context: ArrangementContext;
  /** Where to say a scratch clip or scene couldn't be removed */
  reportScratch?: (message: string) => void;
}

/**
 * Handle arrangement clip shortening
 * @param options - Parameters object
 * @param options.clip - The LiveAPI clip object to shorten
 * @param options.isAudioClip - Whether the clip is an audio clip
 * @param options.arrangementLengthBeats - Target length in beats
 * @param options.currentStartTime - Current start time in beats
 * @param options.currentEndTime - Current end time in beats
 * @param options.context - Tool execution context
 * @param options.reportScratch - Where to say a scratch clip or scene couldn't
 *   be removed
 */
export function handleArrangementShortening({
  clip,
  isAudioClip,
  arrangementLengthBeats,
  currentStartTime,
  currentEndTime,
  context,
  reportScratch,
}: HandleArrangementShorteningArgs): void {
  const newEndTime = currentStartTime + arrangementLengthBeats;
  const tempClipLength = currentEndTime - newEndTime;

  // Get track
  const trackIndex = clip.trackIndex;

  if (trackIndex == null) {
    throw new Error(`no track for clip ${targetLabel(clip)}`);
  }

  const track = LiveAPI.from(livePath.track(trackIndex));

  // Create temporary clip to truncate
  truncateWithTempClip({
    track,
    isAudioClip,
    position: newEndTime,
    length: tempClipLength,
    silenceWavPath: context.silenceWavPath as string,
    lanes: context.lanes,
    reportScratch,
    setupAudioClip: (tempClip: LiveAPI) => {
      // Re-apply warping and looping to arrangement clip
      tempClip.set("warping", 1);
      tempClip.set("looping", 1);
      tempClip.set("loop_end", tempClipLength);
    },
  });
}

interface TruncateWithTempClipArgs {
  track: LiveAPI;
  isAudioClip: boolean;
  position: number;
  length: number;
  silenceWavPath: string;
  lanes?: LaneView;
  reportScratch?: (message: string) => void;
  setupAudioClip?: ((tempClip: LiveAPI) => void) | null;
}

/**
 * Creates and immediately deletes a temporary clip to truncate arrangement clips
 * @param options - Truncation options
 * @param options.track - Track to create temp clip on
 * @param options.isAudioClip - Whether to create audio or MIDI clip
 * @param options.position - Position for temp clip
 * @param options.length - Length of temp clip
 * @param options.silenceWavPath - Path to silence WAV (for audio clips)
 * @param options.lanes - The call's lanes, told what the temp clip cut into
 * @param options.reportScratch - Where to say a scratch clip or scene stayed
 * @param options.setupAudioClip - Optional callback to setup audio temp clip
 */
function truncateWithTempClip({
  track,
  isAudioClip,
  position,
  length,
  silenceWavPath,
  lanes,
  reportScratch,
  setupAudioClip = null,
}: TruncateWithTempClipArgs): void {
  // The temp clip is gone by the time anything looks, so say what it trimmed.
  lanes?.wroteOnTrack(track, position, position + length);

  if (isAudioClip) {
    const session = createAudioClipInSession(
      track,
      length,
      silenceWavPath,
      reportScratch,
    );
    let tempClip: LiveAPI;

    // The scratch clip goes whether or not the copy landed: a throw would
    // otherwise leave it, and its scene, in the Set with nothing to say so.
    try {
      tempClip = clipFromDuplicateResult(
        track.call(
          "duplicate_clip_to_arrangement",
          toLiveApiId(session.clip.id),
          position,
        ),
      );

      if (setupAudioClip) {
        setupAudioClip(tempClip);
      }
    } finally {
      removeSessionClip(session, reportScratch);
    }

    track.call("delete_clip", toLiveApiId(tempClip.id));
  } else {
    const tempClipResult = track.call(
      "create_midi_clip",
      position,
      length,
    ) as string;
    const tempClip = requireCreatedClip(
      LiveAPI.from(tempClipResult),
      pathPrefix(track),
    );

    track.call("delete_clip", toLiveApiId(tempClip.id));
  }
}
