import * as console from "#src/shared/v8-max-console.js";
import { applyAudioParams, applyMidiParams } from "./transform-clips-params.js";

/**
 * Check if any audio transformation parameters are specified
 * @param gainDbMin - Minimum gain in decibels
 * @param gainDbMax - Maximum gain in decibels
 * @param transposeMin - Minimum transpose amount
 * @param transposeMax - Maximum transpose amount
 * @param transposeValues - Comma-separated list of transpose values
 * @returns True if any audio params are specified
 */
function hasAudioTransformParams(
  gainDbMin: number | undefined,
  gainDbMax: number | undefined,
  transposeMin: number | undefined,
  transposeMax: number | undefined,
  transposeValues: string | undefined,
): boolean {
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
 * @param velocityMin - Minimum velocity value
 * @param velocityMax - Maximum velocity value
 * @param transposeMin - Minimum transpose amount
 * @param transposeMax - Maximum transpose amount
 * @param transposeValues - Comma-separated list of transpose values
 * @param durationMin - Minimum note duration
 * @param durationMax - Maximum note duration
 * @param velocityRange - Range for velocity variation
 * @param probability - Probability for note generation
 * @returns True if any MIDI params are specified
 */
function hasMidiTransformParams(
  velocityMin: number | undefined,
  velocityMax: number | undefined,
  transposeMin: number | undefined,
  transposeMax: number | undefined,
  transposeValues: string | undefined,
  durationMin: number | undefined,
  durationMax: number | undefined,
  velocityRange: number | undefined,
  probability: number | undefined,
): boolean {
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

interface AudioTransformParams {
  gainDbMin?: number;
  gainDbMax?: number;
  transposeMin?: number;
  transposeMax?: number;
  transposeValuesArray?: number[] | null;
}

/**
 * Apply audio parameters to a clip if appropriate
 * @param clip - Live API clip object
 * @param audioParams - Audio transformation parameters
 * @param rng - Random number generator
 * @param warnings - Set to track emitted warnings
 */
function applyAudioTransformIfNeeded(
  clip: LiveAPI,
  audioParams: AudioTransformParams,
  rng: () => number,
  warnings: Set<string>,
): void {
  const isAudioClip = (clip.getProperty("is_audio_clip") as number) > 0;

  if (!isAudioClip) {
    if (!warnings.has("audio-params-midi-clip")) {
      console.error("Warning: audio parameters ignored for MIDI clips");
      warnings.add("audio-params-midi-clip");
    }

    return;
  }

  applyAudioParams(clip, audioParams, rng);
}

interface MidiTransformParams {
  velocityMin?: number;
  velocityMax?: number;
  transposeMin?: number;
  transposeMax?: number;
  transposeValuesArray?: number[] | null;
  durationMin?: number;
  durationMax?: number;
  velocityRange?: number;
  probability?: number;
}

/**
 * Apply MIDI parameters to a clip if appropriate
 * @param clip - Live API clip object
 * @param midiParams - MIDI transformation parameters
 * @param rng - Random number generator
 * @param warnings - Set to track emitted warnings
 */
function applyMidiTransformIfNeeded(
  clip: LiveAPI,
  midiParams: MidiTransformParams,
  rng: () => number,
  warnings: Set<string>,
): void {
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

interface ParameterTransformOptions {
  gainDbMin?: number;
  gainDbMax?: number;
  transposeMin?: number;
  transposeMax?: number;
  transposeValues?: string;
  transposeValuesArray?: number[] | null;
  velocityMin?: number;
  velocityMax?: number;
  durationMin?: number;
  durationMax?: number;
  velocityRange?: number;
  probability?: number;
}

/**
 * Apply parameter transformations to all clips
 * @param clips - Array of Live API clip objects
 * @param options - Transformation parameters object
 * @param rng - Random number generator
 * @param warnings - Set to track emitted warnings
 */
export function applyParameterTransforms(
  clips: LiveAPI[],
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
  }: ParameterTransformOptions,
  rng: () => number,
  warnings: Set<string>,
): void {
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
