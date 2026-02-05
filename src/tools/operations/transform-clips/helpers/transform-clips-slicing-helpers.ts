// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { barBeatDurationToAbletonBeats } from "#src/notation/barbeat/time/barbeat-time.ts";
import * as console from "#src/shared/v8-max-console.ts";
import { revealAudioContentAtPosition } from "#src/tools/clip/update/helpers/update-clip-audio-helpers.ts";
import { MAX_SLICES } from "#src/tools/constants.ts";
import {
  createShortenedClipInHolding,
  moveClipFromHolding,
  tileClipToRange,
} from "#src/tools/shared/arrangement/arrangement-tiling.ts";
import type { TilingContext } from "#src/tools/shared/arrangement/arrangement-tiling.ts";
import { setClipMarkersWithLoopingWorkaround } from "#src/tools/shared/clip-marker-helpers.ts";

export interface SlicingContext {
  holdingAreaStartBeats: number;
  silenceWavPath?: string;
}

/**
 * Iterate through slice positions and call handler for each
 * @param sourceClip - The source clip to slice
 * @param sliceBeats - Slice duration in beats
 * @param currentStartTime - Start time of the original clip
 * @param currentEndTime - End time of the original clip
 * @param sliceHandler - Handler called for each slice position
 */
function iterateSlicePositions(
  sourceClip: LiveAPI,
  sliceBeats: number,
  currentStartTime: number,
  currentEndTime: number,
  sliceHandler: (
    sliceContentStart: number,
    sliceContentEnd: number,
    slicePosition: number,
  ) => void,
): void {
  const clipStartMarker = sourceClip.getProperty("start_marker") as number;
  let currentSlicePosition = currentStartTime + sliceBeats;
  let currentContentOffset = sliceBeats;

  while (currentSlicePosition < currentEndTime - 0.001) {
    const sliceLengthNeeded = Math.min(
      sliceBeats,
      currentEndTime - currentSlicePosition,
    );
    const sliceContentStart = clipStartMarker + currentContentOffset;
    const sliceContentEnd = sliceContentStart + sliceLengthNeeded;

    sliceHandler(sliceContentStart, sliceContentEnd, currentSlicePosition);

    currentSlicePosition += sliceBeats;
    currentContentOffset += sliceBeats;
  }
}

/**
 * Slice unlooped MIDI clips by duplicating and setting markers for each slice.
 * Any slices beyond actual note content will simply be empty.
 * @param sourceClip - The source clip to duplicate from
 * @param track - The track containing the clip
 * @param sliceBeats - Slice duration in beats
 * @param currentStartTime - Start time of the original clip
 * @param currentEndTime - End time of the original clip
 */
function sliceUnloopedMidiContent(
  sourceClip: LiveAPI,
  track: LiveAPI,
  sliceBeats: number,
  currentStartTime: number,
  currentEndTime: number,
): void {
  iterateSlicePositions(
    sourceClip,
    sliceBeats,
    currentStartTime,
    currentEndTime,
    (sliceContentStart, sliceContentEnd, slicePosition) => {
      const duplicateResult = track.call(
        "duplicate_clip_to_arrangement",
        sourceClip.id,
        slicePosition,
      ) as string;
      const sliceClip = LiveAPI.from(duplicateResult);

      // Verify duplicate succeeded before proceeding
      if (!sliceClip.exists()) {
        throw new Error(
          `Failed to duplicate clip ${sourceClip.id} for MIDI slice at ${slicePosition}`,
        );
      }

      setClipMarkersWithLoopingWorkaround(sliceClip, {
        startMarker: sliceContentStart,
        endMarker: sliceContentEnd,
      });
    },
  );
}

/**
 * Reveal hidden content in unlooped audio clips by duplicating and setting markers
 * @param sourceClip - The source clip to duplicate from
 * @param track - The track containing the clip
 * @param sliceBeats - Slice duration in beats
 * @param currentStartTime - Start time of the original clip
 * @param currentEndTime - End time of the original clip
 * @param _context - Internal context object
 */
function sliceUnloopedAudioContent(
  sourceClip: LiveAPI,
  track: LiveAPI,
  sliceBeats: number,
  currentStartTime: number,
  currentEndTime: number,
  _context: SlicingContext,
): void {
  iterateSlicePositions(
    sourceClip,
    sliceBeats,
    currentStartTime,
    currentEndTime,
    (sliceContentStart, sliceContentEnd, slicePosition) => {
      revealAudioContentAtPosition(
        sourceClip,
        track,
        sliceContentStart,
        sliceContentEnd,
        slicePosition,
        _context,
      );
    },
  );
}

/**
 * Prepare slice parameters by converting to Ableton beats
 * @param slice - Slice duration in bar:beat format
 * @param arrangementClips - Array of arrangement clips
 * @param warnings - Set to track warnings already issued
 * @returns Slice duration in beats or null
 */
export function prepareSliceParams(
  slice: string | undefined,
  arrangementClips: LiveAPI[],
  warnings: Set<string>,
): number | null {
  if (slice == null) {
    return null;
  }

  if (arrangementClips.length === 0) {
    if (!warnings.has("slice-no-arrangement")) {
      console.warn("slice requires arrangement clips");
      warnings.add("slice-no-arrangement");
    }

    return null;
  }

  const liveSet = LiveAPI.from("live_set");
  const songTimeSigNumerator = liveSet.getProperty(
    "signature_numerator",
  ) as number;
  const songTimeSigDenominator = liveSet.getProperty(
    "signature_denominator",
  ) as number;
  const sliceBeats = barBeatDurationToAbletonBeats(
    slice,
    songTimeSigNumerator,
    songTimeSigDenominator,
  );

  if (sliceBeats <= 0) {
    throw new Error("slice must be greater than 0");
  }

  return sliceBeats;
}

interface SlicedClipRange {
  trackIndex: number;
  startTime: number;
  endTime: number;
}

/**
 * Perform slicing of arrangement clips.
 *
 * Uses hard failure (throws) since slice requires all-or-nothing semantics.
 * Note: If a failure occurs mid-operation, partially created slices may remain
 * in the arrangement. This is a known limitation as implementing rollback would
 * add significant complexity.
 *
 * @param arrangementClips - Array of arrangement clips to slice
 * @param sliceBeats - Slice duration in Ableton beats
 * @param clips - Array to update with fresh clips after slicing
 * @param _warnings - Set to track warnings (unused, kept for consistent signature)
 * @param slice - Original slice parameter for error messages
 * @param _context - Internal context object
 * @throws Error if clip duplication fails during slicing
 */
export function performSlicing(
  arrangementClips: LiveAPI[],
  sliceBeats: number,
  clips: LiveAPI[],
  _warnings: Set<string>,
  slice: string,
  _context: SlicingContext,
): void {
  const holdingAreaStart = _context.holdingAreaStartBeats;
  let totalSlicesCreated = 0;
  // Track position ranges for sliced clips to re-scan after deletion
  const slicedClipRanges = new Map<string, SlicedClipRange>();

  for (const clip of arrangementClips) {
    const isMidiClip = clip.getProperty("is_midi_clip") === 1;
    const isLooping = (clip.getProperty("looping") as number) > 0;
    // Get current clip arrangement length
    const currentStartTime = clip.getProperty("start_time") as number;
    const currentEndTime = clip.getProperty("end_time") as number;
    const currentArrangementLength = currentEndTime - currentStartTime;

    // Only slice if clip is longer than or equal to slice size
    if (currentArrangementLength < sliceBeats) {
      continue; // Skip clips smaller than slice size
    }

    // Check if adding this clip's slices would exceed the limit
    const sliceCount = Math.ceil(currentArrangementLength / sliceBeats);

    if (totalSlicesCreated + sliceCount > MAX_SLICES) {
      throw new Error(
        `Slicing at ${slice} would create ${sliceCount} slices for a ${currentArrangementLength}-beat clip. ` +
          `Maximum ${MAX_SLICES} slices total. Use a longer slice duration.`,
      );
    }

    // Get track for this clip
    // Store trackIndex BEFORE any operations to prevent staleness
    const trackIndex = clip.trackIndex;

    if (trackIndex == null) {
      throw new Error(
        `transformClips failed: could not determine trackIndex for clip ${clip.id}`,
      );
    }

    const track = LiveAPI.from(`live_set tracks ${trackIndex}`);
    // Store position info before slicing (for re-scanning after deletion)
    const originalClipId = clip.id;

    slicedClipRanges.set(originalClipId, {
      trackIndex,
      startTime: currentStartTime,
      endTime: currentEndTime,
    });
    // Shorten clip at original position using holding area technique
    const { holdingClipId } = createShortenedClipInHolding(
      clip,
      track,
      sliceBeats,
      holdingAreaStart,
      isMidiClip,
      _context as TilingContext,
    );

    // Verify holding clip was created before deleting original
    const holdingClip = LiveAPI.from(holdingClipId);

    if (!holdingClip.exists()) {
      throw new Error(
        `Failed to create holding clip for ${originalClipId} during slicing`,
      );
    }

    // Delete original clip before moving from holding
    track.call("delete_clip", originalClipId);
    // Move shortened clip from holding back to original position
    const movedClip = moveClipFromHolding(
      holdingClipId,
      track,
      currentStartTime,
    );
    // Fill remaining space after the first slice
    const remainingLength = currentArrangementLength - sliceBeats;

    if (remainingLength > 0) {
      if (isLooping) {
        // Looped clips: tile to fill with repeated content
        tileClipToRange(
          movedClip,
          track,
          currentStartTime + sliceBeats,
          remainingLength,
          holdingAreaStart,
          _context as TilingContext,
          { adjustPreRoll: true, tileLength: sliceBeats },
        );
      } else if (isMidiClip) {
        // Unlooped MIDI clips: reveal hidden content for each slice position
        sliceUnloopedMidiContent(
          movedClip,
          track,
          sliceBeats,
          currentStartTime,
          currentEndTime,
        );
      } else {
        // Unlooped audio clips: reveal hidden content for each slice position
        sliceUnloopedAudioContent(
          movedClip,
          track,
          sliceBeats,
          currentStartTime,
          currentEndTime,
          _context,
        );
      }
    }

    // Track total slices created
    totalSlicesCreated += sliceCount;
  }

  // Re-scan tracks to replace stale clip objects with fresh ones
  for (const [oldClipId, range] of slicedClipRanges) {
    const track = LiveAPI.from(`live_set tracks ${range.trackIndex}`);
    const trackClipIds = track.getChildIds("arrangement_clips");
    // Find all clips in the original clip's position range (with small epsilon for floating-point)
    const EPSILON = 0.001;
    const freshClips = trackClipIds
      .map((id) => LiveAPI.from(id))
      .filter((c) => {
        const clipStart = c.getProperty("start_time") as number;

        return (
          clipStart >= range.startTime - EPSILON &&
          clipStart < range.endTime - EPSILON
        );
      });
    // Replace stale clip in clips array with fresh clips
    const staleIndex = clips.findIndex((c) => c.id === oldClipId);

    if (staleIndex !== -1) {
      clips.splice(staleIndex, 1, ...freshClips);
    }
  }
}
