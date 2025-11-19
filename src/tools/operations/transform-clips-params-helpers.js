import * as console from "../../shared/v8-max-console.js";
import { applyAudioParams, applyMidiParams } from "./transform-clips-params.js";

/**
 * Check if any audio transformation parameters are specified
 * @param gainDbMin
 * @param gainDbMax
 * @param transposeMin
 * @param transposeMax
 * @param transposeValues
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
 * @param velocityMin
 * @param velocityMax
 * @param transposeMin
 * @param transposeMax
 * @param transposeValues
 * @param durationMin
 * @param durationMax
 * @param velocityRange
 * @param probability
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
 * @param clip
 * @param audioParams
 * @param rng
 * @param warnings
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
 * @param clip
 * @param midiParams
 * @param rng
 * @param warnings
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
 * @param clips
 * @param root0
 * @param root0.gainDbMin
 * @param root0.gainDbMax
 * @param root0.transposeMin
 * @param root0.transposeMax
 * @param root0.transposeValues
 * @param root0.transposeValuesArray
 * @param root0.velocityMin
 * @param root0.velocityMax
 * @param root0.durationMin
 * @param root0.durationMax
 * @param root0.velocityRange
 * @param root0.probability
 * @param rng
 * @param warnings
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
