import { dbToLiveGain, liveGainToDb } from "../shared/gain-utils.js";

/**
 * Generates a random number within a range
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @param {function(): number} rng - Random number generator function
 * @returns {number} Random number between min and max
 */
function randomInRange(min, max, rng) {
  return min + rng() * (max - min);
}

/**
 * Apply audio parameters to a clip
 * @param {object} clip - The clip to modify
 * @param {object} params - Audio parameters
 * @param {number} [params.gainDbMin] - Min gain offset in dB
 * @param {number} [params.gainDbMax] - Max gain offset in dB
 * @param {number} [params.transposeMin] - Min transpose offset
 * @param {number} [params.transposeMax] - Max transpose offset
 * @param {string} [params.transposeValues] - Comma-separated transpose values
 * @param {Array<number>} [params.transposeValuesArray] - Parsed transpose values
 * @param {function(): number} rng - Random number generator
 */
export function applyAudioParams(
  clip,
  { gainDbMin, gainDbMax, transposeMin, transposeMax, transposeValuesArray },
  rng,
) {
  // Apply gain (additive in dB space)
  if (gainDbMin != null && gainDbMax != null) {
    const currentLiveGain = clip.getProperty("gain");
    const currentGainDb = liveGainToDb(currentLiveGain);
    const gainDbOffset = randomInRange(gainDbMin, gainDbMax, rng);
    const newGainDb = Math.max(-70, Math.min(24, currentGainDb + gainDbOffset));
    const newLiveGain = dbToLiveGain(newGainDb);
    clip.set("gain", newLiveGain);
  }

  // Apply transpose (pitch shift)
  if (transposeValuesArray != null) {
    // Pick from discrete values
    const transposeOffset =
      transposeValuesArray[Math.floor(rng() * transposeValuesArray.length)];

    const currentPitchCoarse = clip.getProperty("pitch_coarse");
    const currentPitchFine = clip.getProperty("pitch_fine");
    const currentPitch = currentPitchCoarse + currentPitchFine / 100;

    const newPitch = currentPitch + transposeOffset;

    const pitchCoarse = Math.floor(newPitch);
    const pitchFine = Math.round((newPitch - pitchCoarse) * 100);
    clip.set("pitch_coarse", pitchCoarse);
    clip.set("pitch_fine", pitchFine);
  } else if (transposeMin != null && transposeMax != null) {
    // Random range
    const currentPitchCoarse = clip.getProperty("pitch_coarse");
    const currentPitchFine = clip.getProperty("pitch_fine");
    const currentPitch = currentPitchCoarse + currentPitchFine / 100;

    const transposeOffset = randomInRange(transposeMin, transposeMax, rng);
    const newPitch = currentPitch + transposeOffset;

    const pitchCoarse = Math.floor(newPitch);
    const pitchFine = Math.round((newPitch - pitchCoarse) * 100);
    clip.set("pitch_coarse", pitchCoarse);
    clip.set("pitch_fine", pitchFine);
  }
}

/**
 * Apply velocity offset to a note
 */
function applyVelocityOffset(note, velocityMin, velocityMax, rng) {
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
 */
function applyTranspose(note, transposeParams, rng) {
  const { transposeValuesArray, transposeMin, transposeMax } = transposeParams;
  if (transposeValuesArray != null) {
    // Pick from discrete values
    const transposeOffset =
      transposeValuesArray[Math.floor(rng() * transposeValuesArray.length)];
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
 */
function applyDurationMultiplier(note, durationMin, durationMax, rng) {
  if (durationMin == null || durationMax == null) {
    return;
  }
  const durationMultiplier = randomInRange(durationMin, durationMax, rng);
  note.duration = note.duration * durationMultiplier;
}

/**
 * Apply velocity deviation offset to a note
 */
function applyVelocityDeviation(note, velocityRange) {
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
 */
function applyProbabilityOffset(note, probability) {
  if (probability == null) {
    return;
  }
  const currentProbability = note.probability ?? 1.0;
  note.probability = Math.max(
    0.0,
    Math.min(1.0, currentProbability + probability),
  );
}

/**
 * Apply MIDI parameters to a clip's notes
 * @param {object} clip - The MIDI clip to modify
 * @param {object} params - MIDI parameters
 * @param {number} [params.velocityMin] - Min velocity offset
 * @param {number} [params.velocityMax] - Max velocity offset
 * @param {number} [params.transposeMin] - Min transpose offset
 * @param {number} [params.transposeMax] - Max transpose offset
 * @param {Array<number>} [params.transposeValuesArray] - Parsed transpose values
 * @param {number} [params.durationMin] - Min duration multiplier
 * @param {number} [params.durationMax] - Max duration multiplier
 * @param {number} [params.velocityRange] - Velocity deviation offset
 * @param {number} [params.probability] - Probability offset
 * @param {function(): number} rng - Random number generator
 */
export function applyMidiParams(
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
) {
  const lengthBeats = clip.getProperty("length");

  // Read notes
  const notesDictionary = clip.call(
    "get_notes_extended",
    0,
    128,
    0,
    lengthBeats,
  );
  const notesData = JSON.parse(notesDictionary);
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
