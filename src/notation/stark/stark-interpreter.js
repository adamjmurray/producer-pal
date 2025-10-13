import { pitchClassNameToNumber } from "../pitch-class-name-to-number.js";
import * as parser from "./stark-parser.js";
import {
  VELOCITY_LOUD_MIN,
  VELOCITY_LOUD_MAX,
  VELOCITY_SOFT_MIN,
  VELOCITY_SOFT_MAX,
  VELOCITY_ACCENT_MIN,
  VELOCITY_ACCENT_MAX,
  QUARTER_NOTE_BEATS,
  SIXTEENTH_NOTE_BEATS,
  BASS_DEFAULT_OCTAVE,
  BASS_MIN_OCTAVE,
  BASS_MAX_OCTAVE,
  MELODY_DEFAULT_OCTAVE,
  MELODY_MIN_OCTAVE,
  MELODY_MAX_OCTAVE,
  CHORD_OCTAVE,
} from "./stark-config.js";

// Scale definitions: intervals in semitones from root
const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10], // Same as natural minor
  locrian: [0, 1, 3, 5, 6, 8, 10],
};

// Chord intervals (triad + optional 7th)
const CHORD_TYPES = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  diminished: [0, 3, 6],
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  dom7: [0, 4, 7, 10],
  halfdim7: [0, 3, 6, 10], // ø7
  dim7: [0, 3, 6, 9],
};

/**
 * Random integer in range [min, max] inclusive
 */
function randomVelocity(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Parse scale string like "C Major" or "Eb Minor"
 * @param {string} scaleString - e.g., "C Major", "Eb Minor"
 * @returns {{root: number, type: string}} - {root: 0-11, type: "major"|"minor"|...}
 */
function parseScale(scaleString) {
  if (!scaleString) {
    return { root: 0, type: "major" }; // C Major default
  }

  const parts = scaleString.trim().split(/\s+/);
  if (parts.length < 2) {
    throw new Error(`Invalid scale string: "${scaleString}"`);
  }

  const rootName = parts[0];
  const scaleName = parts.slice(1).join(" ").toLowerCase();

  const root = pitchClassNameToNumber(rootName);

  // Map common scale names to our internal types
  const scaleTypeMap = {
    major: "major",
    minor: "minor",
    dorian: "dorian",
    phrygian: "phrygian",
    lydian: "lydian",
    mixolydian: "mixolydian",
    aeolian: "aeolian",
    locrian: "locrian",
  };

  const type = scaleTypeMap[scaleName];
  if (!type) {
    throw new Error(
      `Unknown scale type: "${scaleName}". Supported: ${Object.keys(scaleTypeMap).join(", ")}`,
    );
  }

  return { root, type };
}

/**
 * Apply scale to a letter name (A-G) to get MIDI pitch class (0-11)
 * @param {string} letter - "A" through "G"
 * @param {number} scaleRoot - 0-11
 * @param {string} scaleType - "major", "minor", etc.
 * @returns {number} MIDI pitch class (0-11)
 */
function applyScale(letter, scaleRoot, scaleType) {
  // Get natural pitch class for the letter (no accidentals)
  const naturalPitchClasses = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const naturalPitchClass = naturalPitchClasses[letter];
  if (naturalPitchClass == null) {
    throw new Error(`Invalid note letter: ${letter}`);
  }

  const intervals = SCALES[scaleType];
  if (!intervals) {
    throw new Error(`Invalid scale type: ${scaleType}`);
  }

  // Build the scale's absolute pitch classes
  const scalePitchClasses = intervals.map(
    (interval) => (scaleRoot + interval) % 12,
  );

  // Find the closest scale pitch class to the natural pitch class
  let closestPitch = scalePitchClasses[0];
  let minDistance = Math.abs(naturalPitchClass - closestPitch);

  for (const scalePitch of scalePitchClasses) {
    const distance = Math.abs(naturalPitchClass - scalePitch);
    if (distance < minDistance) {
      minDistance = distance;
      closestPitch = scalePitch;
    }
  }

  return closestPitch;
}

/**
 * Get chord quality based on scale degree in a given scale
 * @param {number} degree - 0-6 scale degree
 * @param {string} scaleType - "major", "minor", etc.
 * @param {boolean} hasSeventh - whether to include 7th
 * @returns {string} chord type name
 */
function getChordQuality(degree, scaleType, hasSeventh) {
  // Chord qualities by scale degree (I, ii, iii, IV, V, vi, vii)
  const qualities = {
    major: hasSeventh
      ? ["maj7", "min7", "min7", "maj7", "dom7", "min7", "halfdim7"]
      : ["major", "minor", "minor", "major", "major", "minor", "diminished"],
    minor: hasSeventh
      ? ["min7", "halfdim7", "maj7", "min7", "min7", "maj7", "dom7"]
      : ["minor", "diminished", "major", "minor", "minor", "major", "major"],
    // For other modes, use major scale qualities (simplified)
    dorian: hasSeventh
      ? ["min7", "min7", "maj7", "dom7", "min7", "halfdim7", "maj7"]
      : ["minor", "minor", "major", "major", "minor", "diminished", "major"],
    phrygian: hasSeventh
      ? ["min7", "maj7", "dom7", "min7", "halfdim7", "maj7", "min7"]
      : ["minor", "major", "major", "minor", "diminished", "major", "minor"],
    lydian: hasSeventh
      ? ["maj7", "dom7", "min7", "halfdim7", "maj7", "min7", "min7"]
      : ["major", "major", "minor", "diminished", "major", "minor", "minor"],
    mixolydian: hasSeventh
      ? ["dom7", "min7", "halfdim7", "maj7", "min7", "min7", "maj7"]
      : ["major", "minor", "diminished", "major", "minor", "minor", "major"],
    aeolian: hasSeventh
      ? ["min7", "halfdim7", "maj7", "min7", "min7", "maj7", "dom7"]
      : ["minor", "diminished", "major", "minor", "minor", "major", "major"],
    locrian: hasSeventh
      ? ["halfdim7", "maj7", "min7", "min7", "maj7", "dom7", "min7"]
      : ["diminished", "major", "minor", "minor", "major", "major", "minor"],
  };

  return qualities[scaleType][degree];
}

/**
 * Choose closest octave to previous note within range
 * @param {number} pitchClass - 0-11
 * @param {number} prevMidi - previous MIDI note
 * @param {number} minOctave - minimum octave
 * @param {number} maxOctave - maximum octave
 * @param {number} defaultOctave - default octave if no previous note
 * @returns {number} MIDI note number
 */
function chooseOctave(
  pitchClass,
  prevMidi,
  minOctave,
  maxOctave,
  defaultOctave,
) {
  if (prevMidi == null) {
    // First note: choose octave that keeps pitch class in the middle of the range
    // This ensures consistent register regardless of pitch class
    const targetMidi = (minOctave * 12 + maxOctave * 12) / 2; // Mid-point of range
    let bestMidi = defaultOctave * 12 + pitchClass;
    let bestDist = Math.abs(bestMidi - targetMidi);

    // Try adjacent octaves
    for (let octave = minOctave; octave <= maxOctave; octave++) {
      const midi = octave * 12 + pitchClass;
      const dist = Math.abs(midi - targetMidi);
      if (dist < bestDist) {
        bestDist = dist;
        bestMidi = midi;
      }
    }

    return bestMidi;
  }

  // Find closest interval
  const prevPitchClass = prevMidi % 12;
  const prevOctave = Math.floor(prevMidi / 12);

  // Try same octave first
  let bestMidi = prevOctave * 12 + pitchClass;
  let bestDist = Math.abs(bestMidi - prevMidi);

  // Try octave above
  const aboveMidi = bestMidi + 12;
  const aboveDist = Math.abs(aboveMidi - prevMidi);
  if (aboveDist < bestDist) {
    bestMidi = aboveMidi;
    bestDist = aboveDist;
  }

  // Try octave below
  const belowMidi = bestMidi - 12;
  const belowDist = Math.abs(belowMidi - prevMidi);
  if (belowDist < bestDist) {
    bestMidi = belowMidi;
  }

  // Constrain to range
  const minMidi = minOctave * 12;
  const maxMidi = maxOctave * 12 + 11;
  if (bestMidi < minMidi) return minMidi + pitchClass;
  if (bestMidi > maxMidi) return maxMidi - (11 - pitchClass);

  return bestMidi;
}

/**
 * Convert Stark notation to MIDI note events
 * @param {string} starkExpression - Stark notation string
 * @param {Object} options - Options
 * @param {number} [options.timeSigNumerator] - Time signature numerator
 * @param {string} [options.scale] - Scale string like "C Major" or "Eb Minor"
 * @returns {Array<{pitch: number, start_time: number, duration: number, velocity: number}>}
 */
export function interpretNotation(starkExpression, options = {}) {
  if (!starkExpression || starkExpression.trim() === "") {
    return [];
  }

  const { timeSigNumerator = 4, scale: scaleParam } = options;

  // Parse scale
  const { root: scaleRoot, type: scaleType } = parseScale(scaleParam);

  try {
    const ast = parser.parse(starkExpression);
    const notes = [];

    // Handle drums mode (array of drum lines)
    if (Array.isArray(ast)) {
      for (const drumLine of ast) {
        processDrumLine(drumLine, notes, timeSigNumerator);
      }
      return notes;
    }

    // Handle bass/melody/chords mode (single object)
    if (ast.type === "bass") {
      processMono(
        ast,
        notes,
        timeSigNumerator,
        scaleRoot,
        scaleType,
        BASS_DEFAULT_OCTAVE,
        BASS_MIN_OCTAVE,
        BASS_MAX_OCTAVE,
      );
    } else if (ast.type === "melody") {
      processMono(
        ast,
        notes,
        timeSigNumerator,
        scaleRoot,
        scaleType,
        MELODY_DEFAULT_OCTAVE,
        MELODY_MIN_OCTAVE,
        MELODY_MAX_OCTAVE,
      );
    } else if (ast.type === "chords") {
      processChords(ast, notes, timeSigNumerator, scaleRoot, scaleType);
    }

    return notes;
  } catch (error) {
    throw new Error(`Stark notation parse error: ${error.message}`);
  }
}

/**
 * Process a drum line
 */
function processDrumLine(drumLine, notes, beatsPerBar) {
  const midi = drumLine.midi;
  let time = 0;
  let bar = 1;

  for (const item of drumLine.content) {
    if (item.barMarker) {
      // Move to next bar
      bar++;
      time = (bar - 1) * beatsPerBar;
      continue;
    }

    if (item.type === "rest") {
      // Advance time
      time +=
        item.duration === "quarter" ? QUARTER_NOTE_BEATS : SIXTEENTH_NOTE_BEATS;
      continue;
    }

    if (item.type === "sustain") {
      // For drums, sustain is like rest (no retrigger)
      time +=
        item.duration === "quarter" ? QUARTER_NOTE_BEATS : SIXTEENTH_NOTE_BEATS;
      continue;
    }

    if (item.type === "hit") {
      const velocity =
        item.velocity === "accent"
          ? randomVelocity(VELOCITY_ACCENT_MIN, VELOCITY_ACCENT_MAX)
          : item.velocity === "loud"
            ? randomVelocity(VELOCITY_LOUD_MIN, VELOCITY_LOUD_MAX)
            : randomVelocity(VELOCITY_SOFT_MIN, VELOCITY_SOFT_MAX);

      const duration =
        item.duration === "quarter" ? QUARTER_NOTE_BEATS : SIXTEENTH_NOTE_BEATS;

      notes.push({
        pitch: midi,
        start_time: time,
        duration: duration,
        velocity: velocity,
        mute: 0,
        probability: 1.0,
      });

      time += duration;
    }
  }
}

/**
 * Process mono mode (bass or melody)
 */
function processMono(
  ast,
  notes,
  beatsPerBar,
  scaleRoot,
  scaleType,
  defaultOctave,
  minOctave,
  maxOctave,
) {
  let time = 0;
  let bar = 1;
  let prevMidi = null;
  let sustainingNote = null;

  for (const item of ast.content) {
    if (item.barMarker) {
      bar++;
      time = (bar - 1) * beatsPerBar;
      sustainingNote = null;
      continue;
    }

    const duration =
      item.duration === "quarter" ? QUARTER_NOTE_BEATS : SIXTEENTH_NOTE_BEATS;

    if (item.type === "rest") {
      time += duration;
      sustainingNote = null;
      continue;
    }

    if (item.type === "sustain") {
      // Extend previous note's duration
      if (sustainingNote) {
        sustainingNote.duration += duration;
      }
      time += duration;
      continue;
    }

    if (item.type === "note") {
      // Apply scale
      const pitchClass = applyScale(item.note, scaleRoot, scaleType);
      const midi = chooseOctave(
        pitchClass,
        prevMidi,
        minOctave,
        maxOctave,
        defaultOctave,
      );

      const velocity =
        item.velocity === "loud"
          ? randomVelocity(VELOCITY_LOUD_MIN, VELOCITY_LOUD_MAX)
          : randomVelocity(VELOCITY_SOFT_MIN, VELOCITY_SOFT_MAX);

      const note = {
        pitch: midi,
        start_time: time,
        duration: duration,
        velocity: velocity,
        mute: 0,
        probability: 1.0,
      };

      notes.push(note);
      prevMidi = midi;
      sustainingNote = note;
      time += duration;
    }
  }
}

/**
 * Process chords mode
 */
function processChords(ast, notes, beatsPerBar, scaleRoot, scaleType) {
  let time = 0;
  let bar = 1;

  for (const item of ast.content) {
    if (item.barMarker) {
      bar++;
      time = (bar - 1) * beatsPerBar;
      continue;
    }

    const duration =
      item.duration === "quarter" ? QUARTER_NOTE_BEATS : SIXTEENTH_NOTE_BEATS;

    if (item.type === "rest") {
      time += duration;
      continue;
    }

    if (item.type === "sustain") {
      // Extend previous chord notes
      // Find all notes at previous time position and extend them
      const prevTime = time - duration;
      for (const note of notes) {
        if (Math.abs(note.start_time - prevTime) < 0.001) {
          note.duration += duration;
        }
      }
      time += duration;
      continue;
    }

    if (item.type === "chord") {
      // Get root pitch class with scale
      const letterMap = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
      const degree = letterMap[item.root];
      if (degree == null) {
        throw new Error(`Invalid chord root: ${item.root}`);
      }

      const rootPitchClass = applyScale(item.root, scaleRoot, scaleType);
      const chordQuality = getChordQuality(degree, scaleType, item.hasSeventh);
      const intervals = CHORD_TYPES[chordQuality];

      if (!intervals) {
        throw new Error(`Unknown chord quality: ${chordQuality}`);
      }

      const velocity =
        item.velocity === "loud"
          ? randomVelocity(VELOCITY_LOUD_MIN, VELOCITY_LOUD_MAX)
          : randomVelocity(VELOCITY_SOFT_MIN, VELOCITY_SOFT_MAX);

      // Create chord notes
      for (const interval of intervals) {
        const pitch = CHORD_OCTAVE * 12 + ((rootPitchClass + interval) % 12);
        notes.push({
          pitch: pitch,
          start_time: time,
          duration: duration,
          velocity: velocity,
          mute: 0,
          probability: 1.0,
        });
      }

      time += duration;
    }
  }
}
