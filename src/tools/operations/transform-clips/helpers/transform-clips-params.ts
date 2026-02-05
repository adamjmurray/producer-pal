// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

import { dbToLiveGain, liveGainToDb } from "#src/tools/shared/gain-utils.ts";

export interface MidiNote {
  pitch: number;
  velocity: number;
  duration: number;
  velocity_deviation?: number;
  probability?: number;
}

interface TransposeParams {
  transposeValuesArray?: number[] | null;
  transposeMin?: number;
  transposeMax?: number;
}

/**
 * Generates a random number within a range
 * @param min - Minimum value
 * @param max - Maximum value
 * @param rng - Random number generator function
 * @returns Random number between min and max
 */
function randomInRange(min: number, max: number, rng: () => number): number {
  return min + rng() * (max - min);
}

/**
 * Apply a pitch shift offset to an audio clip
 * @param clip - The clip to modify
 * @param transposeOffset - Semitones to shift
 */
function applyAudioPitchShift(clip: LiveAPI, transposeOffset: number): void {
  const currentPitchCoarse = clip.getProperty("pitch_coarse") as number;
  const currentPitchFine = clip.getProperty("pitch_fine") as number;
  const currentPitch = currentPitchCoarse + currentPitchFine / 100;

  const newPitch = currentPitch + transposeOffset;

  const pitchCoarse = Math.floor(newPitch);
  const pitchFine = Math.round((newPitch - pitchCoarse) * 100);

  clip.set("pitch_coarse", pitchCoarse);
  clip.set("pitch_fine", pitchFine);
}

export interface AudioParams {
  gainDbMin?: number;
  gainDbMax?: number;
  transposeMin?: number;
  transposeMax?: number;
  transposeValues?: string;
  transposeValuesArray?: number[] | null;
}

/**
 * Apply audio parameters to a clip
 * @param clip - The clip to modify
 * @param params - Audio parameters
 * @param params.gainDbMin - Minimum gain in dB
 * @param params.gainDbMax - Maximum gain in dB
 * @param params.transposeMin - Minimum transpose semitones
 * @param params.transposeMax - Maximum transpose semitones
 * @param params.transposeValuesArray - Parsed transpose values array
 * @param rng - Random number generator
 */
export function applyAudioParams(
  clip: LiveAPI,
  {
    gainDbMin,
    gainDbMax,
    transposeMin,
    transposeMax,
    transposeValuesArray,
  }: AudioParams,
  rng: () => number,
): void {
  // Apply gain (additive in dB space)
  if (gainDbMin != null && gainDbMax != null) {
    const currentLiveGain = clip.getProperty("gain") as number;
    const currentGainDb = liveGainToDb(currentLiveGain);
    const gainDbOffset = randomInRange(gainDbMin, gainDbMax, rng);
    const newGainDb = Math.max(-70, Math.min(24, currentGainDb + gainDbOffset));
    const newLiveGain = dbToLiveGain(newGainDb);

    clip.set("gain", newLiveGain);
  }

  // Apply transpose (pitch shift)
  if (transposeValuesArray != null) {
    // Pick from discrete values
    const transposeOffset = transposeValuesArray[
      Math.floor(rng() * transposeValuesArray.length)
    ] as number;

    applyAudioPitchShift(clip, transposeOffset);
  } else if (transposeMin != null && transposeMax != null) {
    // Random range
    const transposeOffset = randomInRange(transposeMin, transposeMax, rng);

    applyAudioPitchShift(clip, transposeOffset);
  }
}

/**
 * Apply velocity offset to a note
 * @param note - The note object to modify
 * @param velocityMin - Minimum velocity offset
 * @param velocityMax - Maximum velocity offset
 * @param rng - Random number generator function
 */
function applyVelocityOffset(
  note: MidiNote,
  velocityMin: number | undefined,
  velocityMax: number | undefined,
  rng: () => number,
): void {
  if (velocityMin == null || velocityMax == null) {
    return;
  }

  const velocityOffset = Math.round(
    randomInRange(velocityMin, velocityMax, rng),
  );

  note.velocity = Math.max(1, Math.min(127, note.velocity + velocityOffset));
}

/**
 * Apply transpose to a note
 * @param note - The note object to modify
 * @param transposeParams - Transpose parameters
 * @param rng - Random number generator function
 */
function applyTranspose(
  note: MidiNote,
  transposeParams: TransposeParams,
  rng: () => number,
): void {
  const { transposeValuesArray, transposeMin, transposeMax } = transposeParams;

  if (transposeValuesArray != null) {
    // Pick from discrete values
    const transposeOffset = transposeValuesArray[
      Math.floor(rng() * transposeValuesArray.length)
    ] as number;

    note.pitch = Math.max(
      0,
      Math.min(127, note.pitch + Math.round(transposeOffset)),
    );
  } else if (transposeMin != null && transposeMax != null) {
    // Random range
    const transposeOffset = Math.round(
      randomInRange(transposeMin, transposeMax, rng),
    );

    note.pitch = Math.max(0, Math.min(127, note.pitch + transposeOffset));
  }
}

/**
 * Apply duration multiplier to a note
 * @param note - The note object to modify
 * @param durationMin - Minimum duration multiplier
 * @param durationMax - Maximum duration multiplier
 * @param rng - Random number generator function
 */
function applyDurationMultiplier(
  note: MidiNote,
  durationMin: number | undefined,
  durationMax: number | undefined,
  rng: () => number,
): void {
  if (durationMin == null || durationMax == null) {
    return;
  }

  const durationMultiplier = randomInRange(durationMin, durationMax, rng);

  note.duration = note.duration * durationMultiplier;
}

/**
 * Apply velocity deviation offset to a note
 * @param note - The note object to modify
 * @param velocityRange - Velocity deviation range
 */
function applyVelocityDeviation(
  note: MidiNote,
  velocityRange: number | undefined,
): void {
  if (velocityRange == null) {
    return;
  }

  const currentDeviation = note.velocity_deviation ?? 0;

  note.velocity_deviation = Math.max(
    -127,
    Math.min(127, currentDeviation + velocityRange),
  );
}

/**
 * Apply probability offset to a note
 * @param note - The note object to modify
 * @param probability - Probability offset value
 */
function applyProbabilityOffset(
  note: MidiNote,
  probability: number | undefined,
): void {
  if (probability == null) {
    return;
  }

  const currentProbability = note.probability ?? 1.0;

  note.probability = Math.max(
    0.0,
    Math.min(1.0, currentProbability + probability),
  );
}

export interface MidiParams {
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
 * Apply MIDI parameters to a clip's notes
 * @param clip - The MIDI clip to modify
 * @param params - MIDI parameters
 * @param params.velocityMin - Minimum velocity (0-127)
 * @param params.velocityMax - Maximum velocity (0-127)
 * @param params.transposeMin - Minimum transpose semitones
 * @param params.transposeMax - Maximum transpose semitones
 * @param params.transposeValuesArray - Parsed transpose values array
 * @param params.durationMin - Minimum duration multiplier
 * @param params.durationMax - Maximum duration multiplier
 * @param params.velocityRange - Velocity range adjustment
 * @param params.probability - Note probability (0-1)
 * @param rng - Random number generator
 */
export function applyMidiParams(
  clip: LiveAPI,
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
  }: MidiParams,
  rng: () => number,
): void {
  const lengthBeats = clip.getProperty("length");

  // Read notes
  const notesDictionary = clip.call(
    "get_notes_extended",
    0,
    128,
    0,
    lengthBeats,
  ) as string;
  const notesData = JSON.parse(notesDictionary) as { notes: MidiNote[] };
  const notes = notesData.notes;

  if (notes.length > 0) {
    // Modify notes in place
    for (const note of notes) {
      applyVelocityOffset(note, velocityMin, velocityMax, rng);
      applyTranspose(
        note,
        { transposeValuesArray, transposeMin, transposeMax },
        rng,
      );
      applyDurationMultiplier(note, durationMin, durationMax, rng);
      applyVelocityDeviation(note, velocityRange);
      applyProbabilityOffset(note, probability);
    }

    // Apply note modifications
    clip.call("apply_note_modifications", JSON.stringify({ notes }));
  }
}
