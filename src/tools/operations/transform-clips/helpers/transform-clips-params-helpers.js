import * as console from "#~/shared/v8-max-console.js";
import { applyAudioParams, applyMidiParams } from "./transform-clips-params.js";

/**
 * Check if any audio transformation parameters are specified
 * @param {number} gainDbMin - Minimum gain in decibels
 * @param {number} gainDbMax - Maximum gain in decibels
 * @param {number} transposeMin - Minimum transpose amount
 * @param {number} transposeMax - Maximum transpose amount
 * @param {string} transposeValues - Comma-separated list of transpose values
 * @returns {boolean} True if any audio params are specified
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
 * @param {number} velocityMin - Minimum velocity value
 * @param {number} velocityMax - Maximum velocity value
 * @param {number} transposeMin - Minimum transpose amount
 * @param {number} transposeMax - Maximum transpose amount
 * @param {string} transposeValues - Comma-separated list of transpose values
 * @param {number} durationMin - Minimum note duration
 * @param {number} durationMax - Maximum note duration
 * @param {number} velocityRange - Range for velocity variation
 * @param {number} probability - Probability for note generation
 * @returns {boolean} True if any MIDI params are specified
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
 * @param {object} clip - Live API clip object
 * @param {object} audioParams - Audio transformation parameters
 * @param {object} rng - Random number generator
 * @param {Set} warnings - Set to track emitted warnings
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
 * @param {object} clip - Live API clip object
 * @param {object} midiParams - MIDI transformation parameters
 * @param {object} rng - Random number generator
 * @param {Set} warnings - Set to track emitted warnings
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
 * @param {Array<object>} clips - Array of Live API clip objects
 * @param {object} root0 - Transformation parameters object
 * @param {number} root0.gainDbMin - Minimum gain in decibels
 * @param {number} root0.gainDbMax - Maximum gain in decibels
 * @param {number} root0.transposeMin - Minimum transpose amount
 * @param {number} root0.transposeMax - Maximum transpose amount
 * @param {string} root0.transposeValues - Comma-separated list of transpose values
 * @param {Array<number>} root0.transposeValuesArray - Array of transpose values
 * @param {number} root0.velocityMin - Minimum velocity value
 * @param {number} root0.velocityMax - Maximum velocity value
 * @param {number} root0.durationMin - Minimum note duration
 * @param {number} root0.durationMax - Maximum note duration
 * @param {number} root0.velocityRange - Range for velocity variation
 * @param {number} root0.probability - Probability for note generation
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
