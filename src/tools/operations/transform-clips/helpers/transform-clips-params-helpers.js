import * as console from "#src/shared/v8-max-console.js";
import { applyAudioParams, applyMidiParams } from "./transform-clips-params.js";

/**
 * Check if any audio transformation parameters are specified
 * @param {number | undefined} gainDbMin - Minimum gain in decibels
 * @param {number | undefined} gainDbMax - Maximum gain in decibels
 * @param {number | undefined} transposeMin - Minimum transpose amount
 * @param {number | undefined} transposeMax - Maximum transpose amount
 * @param {string | undefined} transposeValues - Comma-separated list of transpose values
 * @returns {boolean} True if any audio params are specified
 */
function hasAudioTransformParams(
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
 * @param {number | undefined} velocityMin - Minimum velocity value
 * @param {number | undefined} velocityMax - Maximum velocity value
 * @param {number | undefined} transposeMin - Minimum transpose amount
 * @param {number | undefined} transposeMax - Maximum transpose amount
 * @param {string | undefined} transposeValues - Comma-separated list of transpose values
 * @param {number | undefined} durationMin - Minimum note duration
 * @param {number | undefined} durationMax - Maximum note duration
 * @param {number | undefined} velocityRange - Range for velocity variation
 * @param {number | undefined} probability - Probability for note generation
 * @returns {boolean} True if any MIDI params are specified
 */
function hasMidiTransformParams(
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
 * @param {object} clip - Live API clip object
 * @param {object} audioParams - Audio transformation parameters
 * @param {object} rng - Random number generator
 * @param {Set} warnings - Set to track emitted warnings
 */
function applyAudioTransformIfNeeded(clip, audioParams, rng, warnings) {
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
 * @param {object} clip - Live API clip object
 * @param {object} midiParams - MIDI transformation parameters
 * @param {object} rng - Random number generator
 * @param {Set} warnings - Set to track emitted warnings
 */
function applyMidiTransformIfNeeded(clip, midiParams, rng, warnings) {
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
 * @param {Array<object>} clips - Array of Live API clip objects
 * @param {object} options - Transformation parameters object
 * @param {number | undefined} options.gainDbMin - Minimum gain in decibels
 * @param {number | undefined} options.gainDbMax - Maximum gain in decibels
 * @param {number | undefined} options.transposeMin - Minimum transpose amount
 * @param {number | undefined} options.transposeMax - Maximum transpose amount
 * @param {string | undefined} options.transposeValues - Comma-separated list of transpose values
 * @param {Array<number> | null} options.transposeValuesArray - Array of transpose values
 * @param {number | undefined} options.velocityMin - Minimum velocity value
 * @param {number | undefined} options.velocityMax - Maximum velocity value
 * @param {number | undefined} options.durationMin - Minimum note duration
 * @param {number | undefined} options.durationMax - Maximum note duration
 * @param {number | undefined} options.velocityRange - Range for velocity variation
 * @param {number | undefined} options.probability - Probability for note generation
 * @param {object} rng - Random number generator
 * @param {Set} warnings - Set to track emitted warnings
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
