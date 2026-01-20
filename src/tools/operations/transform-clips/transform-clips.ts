import * as console from "#src/shared/v8-max-console.ts";
import { validateIdTypes } from "#src/tools/shared/validation/id-validation.ts";
import {
  parseTransposeValues,
  getClipIds,
  createSeededRNG,
} from "./helpers/transform-clips-helpers.ts";
import { applyParameterTransforms } from "./helpers/transform-clips-params-helpers.ts";
import { performShuffling } from "./helpers/transform-clips-shuffling-helpers.ts";
import {
  prepareSliceParams,
  performSlicing,
} from "./helpers/transform-clips-slicing-helpers.ts";
import type { SlicingContext } from "./helpers/transform-clips-slicing-helpers.ts";

interface TransformClipsArgs {
  clipIds?: string;
  arrangementTrackIndex?: string;
  arrangementStart?: string;
  arrangementLength?: string;
  slice?: string;
  shuffleOrder?: boolean;
  gainDbMin?: number;
  gainDbMax?: number;
  transposeMin?: number;
  transposeMax?: number;
  transposeValues?: string;
  velocityMin?: number;
  velocityMax?: number;
  durationMin?: number;
  durationMax?: number;
  velocityRange?: number;
  probability?: number;
  seed?: number;
}

interface TransformClipsResult {
  clipIds: string[];
  seed: number;
}

/**
 * Transforms multiple clips by shuffling positions and/or randomizing parameters
 * @param args - The parameters
 * @param args.clipIds - Comma-separated list of clip IDs to transform
 * @param args.arrangementTrackIndex - Track index for arrangement clips
 * @param args.arrangementStart - Start position for arrangement selection
 * @param args.arrangementLength - Length for arrangement selection
 * @param args.slice - Slice clips before shuffling
 * @param args.shuffleOrder - Shuffle order strategy
 * @param args.gainDbMin - Minimum gain in dB
 * @param args.gainDbMax - Maximum gain in dB
 * @param args.transposeMin - Minimum transpose semitones
 * @param args.transposeMax - Maximum transpose semitones
 * @param args.transposeValues - Comma-separated transpose values
 * @param args.velocityMin - Minimum velocity (0-127)
 * @param args.velocityMax - Maximum velocity (0-127)
 * @param args.durationMin - Minimum duration multiplier
 * @param args.durationMax - Maximum duration multiplier
 * @param args.velocityRange - Velocity range adjustment
 * @param args.probability - Note probability (0-1)
 * @param args.seed - Random seed for reproducibility
 * @param context - Internal context object with holdingAreaStartBeats and silenceWavPath
 * @returns Result with clipIds and seed
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
  }: TransformClipsArgs = {},
  context: Partial<SlicingContext> = {},
): TransformClipsResult {
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
  const warnings = new Set<string>();

  // Filter arrangement clips only for position shuffling and slicing
  const arrangementClips = clips.filter(
    (clip) => (clip.getProperty("is_arrangement_clip") as number) > 0,
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
      context as SlicingContext,
    );
    // After slicing, re-filter arrangement clips to get fresh objects
    // (the clips array was modified by splice operations during re-scanning)
    const freshArrangementClips = clips.filter(
      (clip) => (clip.getProperty("is_arrangement_clip") as number) > 0,
    );

    // Update arrangementClips reference for subsequent operations
    arrangementClips.length = 0;
    arrangementClips.push(...freshArrangementClips);
  }

  // Shuffle clip positions if requested
  if (shuffleOrder) {
    performShuffling(
      arrangementClips,
      clips,
      warnings,
      rng,
      context as { holdingAreaStartBeats: number },
    );
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
