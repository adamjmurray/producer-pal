import * as console from "#src/shared/v8-max-console.js";
import { validateIdTypes } from "#src/tools/shared/validation/id-validation.js";
import {
  parseTransposeValues,
  getClipIds,
  createSeededRNG,
  randomInRange,
} from "./helpers/transform-clips-helpers.js";
import { applyParameterTransforms } from "./helpers/transform-clips-params-helpers.js";
import {
  performShuffling,
  shuffleArray,
} from "./helpers/transform-clips-shuffling-helpers.js";
import {
  prepareSliceParams,
  performSlicing,
} from "./helpers/transform-clips-slicing-helpers.js";

// Re-export helpers for backward compatibility with tests
export { createSeededRNG, randomInRange, shuffleArray };

/**
 * Transforms multiple clips by shuffling positions and/or randomizing parameters
 * @param {object} args - The parameters
 * @param {string} [args.clipIds] - Comma-separated clip IDs (takes priority over arrangementTrackIndex)
 * @param {string} [args.arrangementTrackIndex] - Track index(es) to query arrangement clips from (ignored if clipIds provided)
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
 * @param {object} context - Internal context object with holdingAreaStartBeats
 * @returns {object} Result with clipIds and seed
 */
export function transformClips(
  {
    clipIds,
    arrangementTrackIndex,
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
  context = {},
) {
  // Generate seed if not provided (do this early so it's available for return)
  const actualSeed = seed ?? Date.now();
  const rng = createSeededRNG(actualSeed);

  // Parse transposeValues if provided
  const transposeValuesArray = parseTransposeValues(
    transposeValues,
    transposeMin,
    transposeMax,
  );

  // Determine clip selection method
  const clipIdArray = getClipIds(
    clipIds,
    arrangementTrackIndex,
    arrangementStart,
    arrangementLength,
  );

  if (clipIdArray.length === 0) {
    console.error("Warning: no clips found in arrangement range");

    return { clipIds: [], seed: actualSeed };
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
    (clip) =>
      /** @type {number} */ (clip.getProperty("is_arrangement_clip")) > 0,
  );

  // Prepare slice parameters if needed
  const sliceBeats = prepareSliceParams(slice, arrangementClips, warnings);

  // Slice clips if requested
  if (slice != null && sliceBeats != null && arrangementClips.length > 0) {
    performSlicing(
      arrangementClips,
      sliceBeats,
      clips,
      warnings,
      slice,
      context,
    );
    // After slicing, re-filter arrangement clips to get fresh objects
    // (the clips array was modified by splice operations during re-scanning)
    const freshArrangementClips = clips.filter(
      (clip) =>
        /** @type {number} */ (clip.getProperty("is_arrangement_clip")) > 0,
    );

    // Update arrangementClips reference for subsequent operations
    arrangementClips.length = 0;
    arrangementClips.push(...freshArrangementClips);
  }

  // Shuffle clip positions if requested
  if (shuffleOrder) {
    performShuffling(arrangementClips, clips, warnings, rng, context);
  }

  // Apply randomization to each clip
  applyParameterTransforms(
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
  );

  // Return affected clip IDs and seed
  const affectedClipIds = clips.map((clip) => clip.id);

  return { clipIds: affectedClipIds, seed: actualSeed };
}
