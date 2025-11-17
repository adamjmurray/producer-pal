import * as console from "../../shared/v8-max-console.js";
import { validateIdTypes } from "../shared/id-validation.js";
import { parseCommaSeparatedIds } from "../shared/utils.js";

const HOLDING_AREA_START = 40000;

/**
 * Creates a seeded random number generator using Mulberry32 algorithm
 * @param {number} seed - The seed value
 * @returns {function(): number} A function that returns a random number between 0 and 1
 */
function createSeededRNG(seed) {
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
function randomInRange(min, max, rng) {
  return min + rng() * (max - min);
}

/**
 * Shuffles an array using Fisher-Yates algorithm with seeded RNG
 * @param {Array} array - Array to shuffle
 * @param {function(): number} rng - Random number generator function
 * @returns {Array} Shuffled array
 */
function shuffleArray(array, rng) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Transforms multiple clips by shuffling positions and/or randomizing parameters
 * @param {Object} args - The parameters
 * @param {string} args.clipIds - Comma-separated clip IDs
 * @param {boolean} [args.shuffleOrder] - Randomize clip positions
 * @param {number} [args.gainMin] - Min gain multiplier (audio clips)
 * @param {number} [args.gainMax] - Max gain multiplier (audio clips)
 * @param {number} [args.pitchMin] - Min pitch shift in semitones (audio clips)
 * @param {number} [args.pitchMax] - Max pitch shift in semitones (audio clips)
 * @param {number} [args.velocityMin] - Min velocity offset (MIDI clips)
 * @param {number} [args.velocityMax] - Max velocity offset (MIDI clips)
 * @param {number} [args.transposeMin] - Min transpose in semitones (MIDI clips)
 * @param {number} [args.transposeMax] - Max transpose in semitones (MIDI clips)
 * @param {number} [args.durationMin] - Min duration multiplier (MIDI clips)
 * @param {number} [args.durationMax] - Max duration multiplier (MIDI clips)
 * @param {number} [args.velocityRange] - Velocity deviation offset (MIDI clips)
 * @param {number} [args.probability] - Probability offset (MIDI clips)
 * @param {number} [args.seed] - RNG seed for reproducibility
 * @returns {Object} Result with clipIds and seed
 */
export function transformClips(
  {
    clipIds,
    shuffleOrder,
    gainMin,
    gainMax,
    pitchMin,
    pitchMax,
    velocityMin,
    velocityMax,
    transposeMin,
    transposeMax,
    durationMin,
    durationMax,
    velocityRange,
    probability,
    seed,
  } = {},
  _context = {},
) {
  if (!clipIds) {
    throw new Error("transformClips failed: clipIds is required");
  }

  // Parse and validate clip IDs
  const clipIdArray = parseCommaSeparatedIds(clipIds);
  const clips = validateIdTypes(clipIdArray, "clip", "transformClips", {
    skipInvalid: true,
  });

  if (clips.length === 0) {
    console.error("Warning: no valid clips found");
    return { clipIds: [], seed: seed ?? Date.now() };
  }

  // Generate seed if not provided
  const actualSeed = seed ?? Date.now();
  const rng = createSeededRNG(actualSeed);

  // Track warnings to emit each type only once
  const warnings = new Set();

  // Filter arrangement clips only for position shuffling
  const arrangementClips = clips.filter(
    (clip) => clip.getProperty("is_arrangement_clip") > 0,
  );

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
    }
  }

  // Apply randomization to each clip
  const hasAudioParams =
    gainMin != null || gainMax != null || pitchMin != null || pitchMax != null;
  const hasMidiParams =
    velocityMin != null ||
    velocityMax != null ||
    transposeMin != null ||
    transposeMax != null ||
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
        // Apply gain
        if (gainMin != null && gainMax != null) {
          const currentGain = clip.getProperty("gain");
          const multiplier = randomInRange(gainMin, gainMax, rng);
          clip.set("gain", currentGain * multiplier);
        }

        // Apply pitch shift
        if (pitchMin != null && pitchMax != null) {
          const currentPitchCoarse = clip.getProperty("pitch_coarse");
          const currentPitchFine = clip.getProperty("pitch_fine");
          const currentPitch = currentPitchCoarse + currentPitchFine / 100;

          const pitchOffset = randomInRange(pitchMin, pitchMax, rng);
          const newPitch = currentPitch + pitchOffset;

          const pitchCoarse = Math.floor(newPitch);
          const pitchFine = Math.round((newPitch - pitchCoarse) * 100);
          clip.set("pitch_coarse", pitchCoarse);
          clip.set("pitch_fine", pitchFine);
        }
      }
    }

    // Apply MIDI parameters
    if (hasMidiParams) {
      if (!isMidiClip && !warnings.has("midi-params-audio-clip")) {
        console.error("Warning: MIDI parameters ignored for audio clips");
        warnings.add("midi-params-audio-clip");
      } else if (isMidiClip) {
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
            // Apply velocity offset
            if (velocityMin != null && velocityMax != null) {
              const velocityOffset = Math.round(
                randomInRange(velocityMin, velocityMax, rng),
              );
              note.velocity = Math.max(
                1,
                Math.min(127, note.velocity + velocityOffset),
              );
            }

            // Apply transpose
            if (transposeMin != null && transposeMax != null) {
              const transposeOffset = Math.round(
                randomInRange(transposeMin, transposeMax, rng),
              );
              note.pitch = Math.max(
                0,
                Math.min(127, note.pitch + transposeOffset),
              );
            }

            // Apply duration multiplier
            if (durationMin != null && durationMax != null) {
              const durationMultiplier = randomInRange(
                durationMin,
                durationMax,
                rng,
              );
              note.duration = note.duration * durationMultiplier;
            }

            // Apply velocity range (velocity_deviation) - non-random offset
            if (velocityRange != null) {
              const currentDeviation = note.velocity_deviation ?? 0;
              note.velocity_deviation = Math.max(
                -127,
                Math.min(127, currentDeviation + velocityRange),
              );
            }

            // Apply probability - non-random offset
            if (probability != null) {
              const currentProbability = note.probability ?? 1.0;
              note.probability = Math.max(
                0.0,
                Math.min(1.0, currentProbability + probability),
              );
            }
          }

          // Apply note modifications
          clip.call("apply_note_modifications", JSON.stringify({ notes }));
        }
      }
    }
  }

  // Return affected clip IDs and seed
  const affectedClipIds = clips.map((clip) => clip.id);
  return { clipIds: affectedClipIds, seed: actualSeed };
}
