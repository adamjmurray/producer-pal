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
import { validateIdType, validateIdTypes } from "../shared/id-validation.js";
import { parseCommaSeparatedIds } from "../shared/utils.js";
import { applyAudioParams, applyMidiParams } from "./transform-clips-params.js";

const HOLDING_AREA_START = 40000;

/**
 * Transforms multiple clips by shuffling positions and/or randomizing parameters
 * @param {Object} args - The parameters
 * @param {string} [args.clipIds] - Comma-separated clip IDs (takes priority over arrangementTrackId)
 * @param {string} [args.arrangementTrackId] - Track ID to query arrangement clips from (ignored if clipIds provided)
 * @param {string} [args.arrangementStart] - Bar|beat position (e.g., '1|1.0') for range start
 * @param {string} [args.arrangementLength] - Bar:beat duration (e.g., '4:0.0') for range length
 * @param {string} [args.slice] - Bar:beat slice size (e.g., '1:0.0') - tiles clips into repeating segments
 * @param {boolean} [args.shuffleOrder] - Randomize clip positions
 * @param {number} [args.gainDbMin] - Min gain offset in dB to add (audio clips, -24 to 24)
 * @param {number} [args.gainDbMax] - Max gain offset in dB to add (audio clips, -24 to 24)
 * @param {number} [args.transposeMin] - Min transpose in semitones (audio/MIDI clips, -128 to 128)
 * @param {number} [args.transposeMax] - Max transpose in semitones (audio/MIDI clips, -128 to 128)
 * @param {string} [args.transposeValues] - Comma-separated semitone values to randomly pick from (ignores transposeMin/transposeMax)
 * @param {number} [args.velocityMin] - Min velocity offset (MIDI clips, -127 to 127)
 * @param {number} [args.velocityMax] - Max velocity offset (MIDI clips, -127 to 127)
 * @param {number} [args.durationMin] - Min duration multiplier (MIDI clips, 0.01 to 100)
 * @param {number} [args.durationMax] - Max duration multiplier (MIDI clips, 0.01 to 100)
 * @param {number} [args.velocityRange] - Velocity deviation offset (MIDI clips, -127 to 127)
 * @param {number} [args.probability] - Probability offset (MIDI clips, -1.0 to 1.0)
 * @param {number} [args.seed] - RNG seed for reproducibility
 * @returns {Object} Result with clipIds and seed
 */
export function transformClips(
  {
    clipIds,
    arrangementTrackId,
    arrangementStart,
    arrangementLength,
    slice,
    shuffleOrder,
    gainDbMin,
    gainDbMax,
    transposeMin,
    transposeMax,
    transposeValues,
    velocityMin,
    velocityMax,
    durationMin,
    durationMax,
    velocityRange,
    probability,
    seed,
  } = {},
  _context = {},
) {
  // Generate seed if not provided (do this early so it's available for return)
  const actualSeed = seed ?? Date.now();
  const rng = createSeededRNG(actualSeed);

  // Parse transposeValues if provided
  let transposeValuesArray = null;
  if (transposeValues != null) {
    transposeValuesArray = transposeValues
      .split(",")
      .map((v) => parseFloat(v.trim()))
      .filter((v) => !isNaN(v));

    if (transposeValuesArray.length === 0) {
      throw new Error("transposeValues must contain at least one valid number");
    }

    // Warn if both transposeValues and transposeMin/transposeMax are provided
    if (transposeMin != null || transposeMax != null) {
      console.error(
        "Warning: transposeValues ignores transposeMin/transposeMax",
      );
    }
  }

  // Determine clip selection method
  let clipIdArray;

  if (clipIds) {
    // Priority: clipIds takes precedence if provided
    clipIdArray = parseCommaSeparatedIds(clipIds);
  } else if (arrangementTrackId) {
    // Alternative: Query clips from track by arrangement range
    const track = validateIdType(arrangementTrackId, "track", "transformClips");

    // Get song time signature for bar|beat conversion
    const liveSet = new LiveAPI("live_set");
    const songTimeSigNumerator = liveSet.getProperty("signature_numerator");
    const songTimeSigDenominator = liveSet.getProperty("signature_denominator");

    // Convert arrangementStart and arrangementLength to Ableton beats
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

    // Query all arrangement clips from track
    const allClipIds = track.getChildIds("arrangement_clips");

    // Filter clips by start_time in range
    clipIdArray = allClipIds.filter((clipId) => {
      const clip = new LiveAPI(clipId);
      const clipStartTime = clip.getProperty("start_time");
      return (
        clipStartTime >= arrangementStartBeats &&
        clipStartTime < arrangementEndBeats
      );
    });

    if (clipIdArray.length === 0) {
      console.error("Warning: no clips found in arrangement range");
      return { clipIds: [], seed: actualSeed };
    }
  } else {
    throw new Error(
      "transformClips failed: clipIds or arrangementTrackId is required",
    );
  }

  // Validate clip IDs
  const clips = validateIdTypes(clipIdArray, "clip", "transformClips", {
    skipInvalid: true,
  });

  if (clips.length === 0) {
    console.error("Warning: no valid clips found");
    return { clipIds: [], seed: actualSeed };
  }

  // Track warnings to emit each type only once
  const warnings = new Set();

  // Filter arrangement clips only for position shuffling and slicing
  const arrangementClips = clips.filter(
    (clip) => clip.getProperty("is_arrangement_clip") > 0,
  );

  // Prepare slice parameters if needed
  let sliceBeats = null;
  if (slice != null) {
    if (arrangementClips.length === 0) {
      if (!warnings.has("slice-no-arrangement")) {
        console.error("Warning: slice requires arrangement clips");
        warnings.add("slice-no-arrangement");
      }
    } else {
      // Get song time signature for bar:beat conversion
      const liveSet = new LiveAPI("live_set");
      const songTimeSigNumerator = liveSet.getProperty("signature_numerator");
      const songTimeSigDenominator = liveSet.getProperty(
        "signature_denominator",
      );

      // Convert slice from bar:beat to Ableton beats
      sliceBeats = barBeatDurationToAbletonBeats(
        slice,
        songTimeSigNumerator,
        songTimeSigDenominator,
      );

      if (sliceBeats <= 0) {
        throw new Error("slice must be greater than 0");
      }
    }
  }

  // Slice clips if requested
  if (slice != null && sliceBeats != null && arrangementClips.length > 0) {
    const holdingAreaStart =
      _context.holdingAreaStartBeats ?? HOLDING_AREA_START;
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

    // After slicing, re-filter arrangement clips to get fresh objects
    // (the clips array was modified by splice operations during re-scanning)
    const freshArrangementClips = clips.filter(
      (clip) => clip.getProperty("is_arrangement_clip") > 0,
    );
    // Update arrangementClips reference for subsequent operations
    arrangementClips.length = 0;
    arrangementClips.push(...freshArrangementClips);
  }

  // Shuffle clip positions if requested
  if (shuffleOrder) {
    if (arrangementClips.length === 0) {
      if (!warnings.has("shuffle-no-arrangement")) {
        console.error("Warning: shuffleOrder requires arrangement clips");
        warnings.add("shuffle-no-arrangement");
      }
    } else if (arrangementClips.length > 1) {
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
  }

  // Apply randomization to each clip
  const hasAudioParams =
    gainDbMin != null ||
    gainDbMax != null ||
    transposeMin != null ||
    transposeMax != null ||
    transposeValues != null;
  const hasMidiParams =
    velocityMin != null ||
    velocityMax != null ||
    transposeMin != null ||
    transposeMax != null ||
    transposeValues != null ||
    durationMin != null ||
    durationMax != null ||
    velocityRange != null ||
    probability != null;

  for (const clip of clips) {
    const isMidiClip = clip.getProperty("is_midi_clip") === 1;
    const isAudioClip = clip.getProperty("is_audio_clip") > 0;

    // Apply audio parameters
    if (hasAudioParams) {
      if (!isAudioClip && !warnings.has("audio-params-midi-clip")) {
        console.error("Warning: audio parameters ignored for MIDI clips");
        warnings.add("audio-params-midi-clip");
      } else if (isAudioClip) {
        applyAudioParams(
          clip,
          {
            gainDbMin,
            gainDbMax,
            transposeMin,
            transposeMax,
            transposeValuesArray,
          },
          rng,
        );
      }
    }

    // Apply MIDI parameters
    if (hasMidiParams) {
      if (!isMidiClip && !warnings.has("midi-params-audio-clip")) {
        console.error("Warning: MIDI parameters ignored for audio clips");
        warnings.add("midi-params-audio-clip");
      } else if (isMidiClip) {
        applyMidiParams(
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
        );
      }
    }
  }

  // Return affected clip IDs and seed
  const affectedClipIds = clips.map((clip) => clip.id);
  return { clipIds: affectedClipIds, seed: actualSeed };
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
