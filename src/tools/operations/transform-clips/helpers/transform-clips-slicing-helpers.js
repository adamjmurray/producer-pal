import { barBeatDurationToAbletonBeats } from "#src/notation/barbeat/time/barbeat-time.js";
import * as console from "#src/shared/v8-max-console.js";
import { MAX_SLICES } from "#src/tools/constants.js";
import {
  createShortenedClipInHolding,
  moveClipFromHolding,
  tileClipToRange,
} from "#src/tools/shared/arrangement/arrangement-tiling.js";

const HOLDING_AREA_START = 40000;

/**
 * Prepare slice parameters by converting to Ableton beats
 * @param {string} slice - Slice duration in bar:beat format
 * @param {Array<LiveAPI>} arrangementClips - Array of arrangement clips
 * @param {Set} warnings - Set to track warnings already issued
 * @returns {number|null} - Slice duration in beats or null
 */
export function prepareSliceParams(slice, arrangementClips, warnings) {
  if (slice == null) {
    return null;
  }
  if (arrangementClips.length === 0) {
    if (!warnings.has("slice-no-arrangement")) {
      console.error("Warning: slice requires arrangement clips");
      warnings.add("slice-no-arrangement");
    }
    return null;
  }
  const liveSet = new LiveAPI("live_set");
  const songTimeSigNumerator = liveSet.getProperty("signature_numerator");
  const songTimeSigDenominator = liveSet.getProperty("signature_denominator");
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

/**
 * Perform slicing of arrangement clips
 * @param {Array<LiveAPI>} arrangementClips - Array of arrangement clips to slice
 * @param {number} sliceBeats - Slice duration in Ableton beats
 * @param {Array<LiveAPI>} clips - Array to update with fresh clips after slicing
 * @param {Set} warnings - Set to track warnings already issued
 * @param {string} slice - Original slice parameter for error messages
 * @param {object} _context - Internal context object
 */
export function performSlicing(
  arrangementClips,
  sliceBeats,
  clips,
  warnings,
  slice,
  _context,
) {
  const holdingAreaStart = _context.holdingAreaStartBeats ?? HOLDING_AREA_START;
  let totalSlicesCreated = 0;
  // Track position ranges for sliced clips to re-scan after deletion
  const slicedClipRanges = new Map();
  for (const clip of arrangementClips) {
    const isMidiClip = clip.getProperty("is_midi_clip") === 1;
    const isLooping = clip.getProperty("looping") > 0;
    // Only slice looped clips (tiling requires looping)
    if (!isLooping) {
      if (!warnings.has("slice-unlooped")) {
        console.error("Warning: slice only applies to looped clips");
        warnings.add("slice-unlooped");
      }
      continue;
    }
    // Get current clip arrangement length
    const currentStartTime = clip.getProperty("start_time");
    const currentEndTime = clip.getProperty("end_time");
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
    const track = new LiveAPI(`live_set tracks ${trackIndex}`);
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
      _context,
    );
    // Delete original clip before moving from holding
    track.call("delete_clip", `id ${originalClipId}`);
    // Move shortened clip from holding back to original position
    const movedClip = moveClipFromHolding(
      holdingClipId,
      track,
      currentStartTime,
    );
    // Tile to fill original length
    const remainingLength = currentArrangementLength - sliceBeats;
    if (remainingLength > 0) {
      tileClipToRange(
        movedClip,
        track,
        currentStartTime + sliceBeats,
        remainingLength,
        holdingAreaStart,
        _context,
        { adjustPreRoll: true, tileLength: sliceBeats },
      );
    }
    // Track total slices created
    totalSlicesCreated += sliceCount;
  }
  // Re-scan tracks to replace stale clip objects with fresh ones
  for (const [oldClipId, range] of slicedClipRanges) {
    const track = new LiveAPI(`live_set tracks ${range.trackIndex}`);
    const trackClipIds = track.getChildIds("arrangement_clips");
    // Find all clips in the original clip's position range (with small epsilon for floating-point)
    const EPSILON = 0.001;
    const freshClips = trackClipIds
      .map((id) => LiveAPI.from(id))
      .filter((c) => {
        const clipStart = c.getProperty("start_time");
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
