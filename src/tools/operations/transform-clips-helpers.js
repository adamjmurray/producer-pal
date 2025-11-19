import {
  barBeatDurationToAbletonBeats,
  barBeatToAbletonBeats,
} from "../../notation/barbeat/barbeat-time.js";
import * as console from "../../shared/v8-max-console.js";
import {
  createShortenedClipInHolding,
  moveClipFromHolding,
  tileClipToRange,
} from "../shared/arrangement-tiling.js";
import { MAX_SLICES } from "../constants.js";
import { validateIdType } from "../shared/id-validation.js";
import { parseCommaSeparatedIds } from "../shared/utils.js";
import { applyAudioParams, applyMidiParams } from "./transform-clips-params.js";

const HOLDING_AREA_START = 40000;

/**
 * Parse transpose values from comma-separated string
 */
export function parseTransposeValues(
  transposeValues,
  transposeMin,
  transposeMax,
) {
  if (transposeValues == null) {
    return null;
  }
  const transposeValuesArray = transposeValues
    .split(",")
    .map((v) => parseFloat(v.trim()))
    .filter((v) => !isNaN(v));
  if (transposeValuesArray.length === 0) {
    throw new Error("transposeValues must contain at least one valid number");
  }

  if (transposeMin != null || transposeMax != null) {
    console.error("Warning: transposeValues ignores transposeMin/transposeMax");
  }
  return transposeValuesArray;
}

/**
 * Get clip IDs from direct list or arrangement track query
 */
export function getClipIds(
  clipIds,
  arrangementTrackId,
  arrangementStart,
  arrangementLength,
) {
  if (clipIds) {
    return parseCommaSeparatedIds(clipIds);
  }
  if (!arrangementTrackId) {
    throw new Error(
      "transformClips failed: clipIds or arrangementTrackId is required",
    );
  }
  const track = validateIdType(arrangementTrackId, "track", "transformClips");
  const liveSet = new LiveAPI("live_set");
  const songTimeSigNumerator = liveSet.getProperty("signature_numerator");
  const songTimeSigDenominator = liveSet.getProperty("signature_denominator");
  let arrangementStartBeats = 0;
  let arrangementEndBeats = Infinity;
  if (arrangementStart != null) {
    arrangementStartBeats = barBeatToAbletonBeats(
      arrangementStart,
      songTimeSigNumerator,
      songTimeSigDenominator,
    );
  }
  if (arrangementLength != null) {
    const arrangementLengthBeats = barBeatDurationToAbletonBeats(
      arrangementLength,
      songTimeSigNumerator,
      songTimeSigDenominator,
    );
    if (arrangementLengthBeats <= 0) {
      throw new Error("arrangementLength must be greater than 0");
    }
    arrangementEndBeats = arrangementStartBeats + arrangementLengthBeats;
  }
  const allClipIds = track.getChildIds("arrangement_clips");
  return allClipIds.filter((clipId) => {
    const clip = new LiveAPI(clipId);
    const clipStartTime = clip.getProperty("start_time");
    return (
      clipStartTime >= arrangementStartBeats &&
      clipStartTime < arrangementEndBeats
    );
  });
}

/**
 * Prepare slice parameters by converting to Ableton beats
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

export function performShuffling(arrangementClips, clips, warnings, rng) {
  if (arrangementClips.length === 0) {
    if (!warnings.has("shuffle-no-arrangement")) {
      console.error("Warning: shuffleOrder requires arrangement clips");
      warnings.add("shuffle-no-arrangement");
    }
    return;
  }
  if (arrangementClips.length <= 1) {
    return;
  }
  // Read original positions
  const positions = arrangementClips.map((clip) =>
    clip.getProperty("start_time"),
  );
  // Shuffle positions
  const shuffledPositions = shuffleArray(positions, rng);
  // Move all clips to holding area first
  // Store trackIndex before entering loop (all arrangement clips are on same track)
  const trackIndexForShuffle = arrangementClips[0].trackIndex;
  const holdingPositions = arrangementClips.map((clip, index) => {
    const trackIndex = clip.trackIndex;
    const track = new LiveAPI(`live_set tracks ${trackIndex}`);
    const holdingPos = HOLDING_AREA_START + index * 100;
    const result = track.call(
      "duplicate_clip_to_arrangement",
      `id ${clip.id}`,
      holdingPos,
    );
    const tempClip = LiveAPI.from(result);
    // Delete original
    track.call("delete_clip", `id ${clip.id}`);
    return { tempClip, track, targetPosition: shuffledPositions[index] };
  });

  // Move clips from holding area to shuffled positions
  for (const { tempClip, track, targetPosition } of holdingPositions) {
    track.call(
      "duplicate_clip_to_arrangement",
      `id ${tempClip.id}`,
      targetPosition,
    );
    track.call("delete_clip", `id ${tempClip.id}`);
  }
  // After shuffling, the clips in the array are stale (they were deleted and recreated)
  // Re-scan to get fresh clip objects
  const track = new LiveAPI(`live_set tracks ${trackIndexForShuffle}`);
  const freshClipIds = track.getChildIds("arrangement_clips");
  const freshClips = freshClipIds.map((id) => LiveAPI.from(id));
  // Replace all stale clips with fresh ones
  clips.length = 0;
  clips.push(...freshClips);
}

/**
 * Creates a seeded random number generator using Mulberry32 algorithm
 * @param {number} seed - The seed value
 * @returns {function(): number} A function that returns a random number between 0 and 1
 */
export function createSeededRNG(seed) {
  let state = seed;
  return function () {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Check if any audio transformation parameters are specified
 */
export function hasAudioTransformParams(
  gainDbMin,
  gainDbMax,
  transposeMin,
  transposeMax,
  transposeValues,
) {
  return (
    gainDbMin != null ||
    gainDbMax != null ||
    transposeMin != null ||
    transposeMax != null ||
    transposeValues != null
  );
}

/**
 * Check if any MIDI transformation parameters are specified
 */
export function hasMidiTransformParams(
  velocityMin,
  velocityMax,
  transposeMin,
  transposeMax,
  transposeValues,
  durationMin,
  durationMax,
  velocityRange,
  probability,
) {
  return (
    velocityMin != null ||
    velocityMax != null ||
    transposeMin != null ||
    transposeMax != null ||
    transposeValues != null ||
    durationMin != null ||
    durationMax != null ||
    velocityRange != null ||
    probability != null
  );
}

/**
 * Apply audio parameters to a clip if appropriate
 */
export function applyAudioTransformIfNeeded(clip, audioParams, rng, warnings) {
  const isAudioClip = clip.getProperty("is_audio_clip") > 0;
  if (!isAudioClip) {
    if (!warnings.has("audio-params-midi-clip")) {
      console.error("Warning: audio parameters ignored for MIDI clips");
      warnings.add("audio-params-midi-clip");
    }
    return;
  }
  applyAudioParams(clip, audioParams, rng);
}

/**
 * Apply MIDI parameters to a clip if appropriate
 */
export function applyMidiTransformIfNeeded(clip, midiParams, rng, warnings) {
  const isMidiClip = clip.getProperty("is_midi_clip") === 1;
  if (!isMidiClip) {
    if (!warnings.has("midi-params-audio-clip")) {
      console.error("Warning: MIDI parameters ignored for audio clips");
      warnings.add("midi-params-audio-clip");
    }
    return;
  }
  applyMidiParams(clip, midiParams, rng);
}

/**
 * Apply parameter transformations to all clips
 */
export function applyParameterTransforms(
  clips,
  {
    gainDbMin,
    gainDbMax,
    transposeMin,
    transposeMax,
    transposeValues,
    transposeValuesArray,
    velocityMin,
    velocityMax,
    durationMin,
    durationMax,
    velocityRange,
    probability,
  },
  rng,
  warnings,
) {
  const hasAudioParams = hasAudioTransformParams(
    gainDbMin,
    gainDbMax,
    transposeMin,
    transposeMax,
    transposeValues,
  );
  const hasMidiParams = hasMidiTransformParams(
    velocityMin,
    velocityMax,
    transposeMin,
    transposeMax,
    transposeValues,
    durationMin,
    durationMax,
    velocityRange,
    probability,
  );

  for (const clip of clips) {
    if (hasAudioParams) {
      applyAudioTransformIfNeeded(
        clip,
        {
          gainDbMin,
          gainDbMax,
          transposeMin,
          transposeMax,
          transposeValuesArray,
        },
        rng,
        warnings,
      );
    }
    if (hasMidiParams) {
      applyMidiTransformIfNeeded(
        clip,
        {
          velocityMin,
          velocityMax,
          transposeMin,
          transposeMax,
          transposeValuesArray,
          durationMin,
          durationMax,
          velocityRange,
          probability,
        },
        rng,
        warnings,
      );
    }
  }
}

/**
 * Generates a random number within a range
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @param {function(): number} rng - Random number generator function
 * @returns {number} Random number between min and max
 */
export function randomInRange(min, max, rng) {
  return min + rng() * (max - min);
}

/**
 * Shuffles an array using Fisher-Yates algorithm with seeded RNG
 * @param {Array} array - Array to shuffle
 * @param {function(): number} rng - Random number generator function
 * @returns {Array} Shuffled array
 */
export function shuffleArray(array, rng) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
