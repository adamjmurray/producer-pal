// src/tonelang/tonelang-converter.js

export const DEFAULT_DURATION = 1;
export const DEFAULT_VELOCITY = 70;

export const PITCH_CLASS_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

/**
 * Convert MIDI pitch number to note name (e.g., 60 -> "C3")
 * @param {number} pitch - MIDI pitch number
 * @returns {string} Pitch name in the ToneLang format like "C3", "F#4", etc, or empty string for invalid inputs.
 */
export function midiPitchToName(midiPitch) {
  const pitchClass = midiPitch % 12;
  const octave = Math.floor(midiPitch / 12) - 2;
  return `${PITCH_CLASS_NAMES[pitchClass]}${octave}`;
}

// /**
//  * Convert MIDI pitch number to note name (e.g., 60 -> "C3")
//  * @param {number} pitch - MIDI pitch number
//  * @returns {string} Note name in the format like "C3", "F#4", etc.
//  */
// export function midiPitchToNoteName(pitch) {
//   const octave = Math.floor(pitch / 12) - 2;
//   const pitchClass = pitch % 12;

//   // Using sharps by default for simplicity
//   const pitchClassNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

//   return pitchClassNames[pitchClass] + octave;
// }

/**
 * Format a single note to ToneLang syntax
 * @param {Object} note - Note object from Live API
 * @returns {string} ToneLang representation of the note
 */
export function formatNote(note) {
  const noteName = midiPitchToName(note.pitch);
  let result = noteName;

  if (note.velocity !== DEFAULT_VELOCITY) {
    result += `v${Math.round(note.velocity)}`;
  }

  if (note.duration !== DEFAULT_DURATION) {
    result += `n${note.duration}`;
  }

  return result;
}

/**
 * Format a chord (notes with same start time) to ToneLang syntax
 * @param {Array} notes - Array of note objects with the same start time
 * @returns {string} ToneLang representation of the chord
 */
export function formatChord(notes) {
  // Sort notes by pitch for consistency
  notes.sort((a, b) => a.pitch - b.pitch);

  const velocity = notes[0].velocity;
  const duration = notes[0].duration;

  // Check if all notes have the same velocity and duration
  const sameProps = notes.every((n) => n.velocity === velocity && n.duration === duration);

  if (!sameProps) {
    // If notes have different properties, format them individually
    return notes.map(formatNote).join(" ");
  }

  const noteNames = notes.map((n) => midiPitchToName(n.pitch)).join(" ");
  let result = `[${noteNames}]`;

  if (velocity !== DEFAULT_VELOCITY) {
    result += `v${Math.round(velocity)}`;
  }

  if (duration !== DEFAULT_DURATION) {
    result += `n${duration}`;
  }

  return result;
}

/**
 * Convert Live clip notes to ToneLang string
 * @param {Array} clipNotes - Array of note objects from the Live API
 * @returns {string} ToneLang representation of the notes
 */
export function convertClipNotesToToneLang(clipNotes) {
  if (!clipNotes || clipNotes.length === 0) return "";

  // Sort notes by start time
  clipNotes.sort((a, b) => a.start_time - b.start_time);

  // Group notes by start time to identify chords
  const timeGroups = {};
  for (const note of clipNotes) {
    const timeKey = note.start_time.toFixed(3);
    if (!timeGroups[timeKey]) {
      timeGroups[timeKey] = [];
    }
    timeGroups[timeKey].push(note);
  }

  const sortedGroups = Object.entries(timeGroups)
    .map(([time, notes]) => ({
      time: parseFloat(time),
      notes,
    }))
    .sort((a, b) => a.time - b.time);

  const elements = [];
  for (let i = 0; i < sortedGroups.length; i++) {
    const group = sortedGroups[i];
    const nextGroup = sortedGroups[i + 1];

    if (group.notes.length === 1) {
      const note = group.notes[0];
      let element = formatNote(note);

      if (nextGroup) {
        const timeUntilNext = nextGroup.time - group.time;
        const noteDuration = note.duration || 1; // Use default duration if not specified

        // Only add t if it differs from note duration or it's not the default duration (1)
        if (Math.abs(timeUntilNext - noteDuration) > 0.001) {
          element += `t${timeUntilNext}`;
        }
      }

      elements.push(element);
    } else {
      const chordDuration = group.notes[0].duration || 1;
      let element = formatChord(group.notes);

      if (nextGroup) {
        const timeUntilNext = nextGroup.time - group.time;

        // Only add t if it differs from chord duration or it's not the default duration (1)
        if (Math.abs(timeUntilNext - chordDuration) > 0.001) {
          element += `t${timeUntilNext}`;
        }
      }

      elements.push(element);
    }
  }

  return elements.join(" ");
}

/**
 * Convert Live clip notes in drum tracks to ToneLang string
 * @param {Array} clipNotes - Array of note objects from the Live API
 * @returns {string} ToneLang representation of the notes
 */
export function convertDrumClipNotesToToneLang(clipNotes) {
  if (!clipNotes || clipNotes.length === 0) return "";

  // Group notes by pitch
  const pitchGroups = {};
  for (const note of clipNotes) {
    const pitch = note.pitch;
    if (!pitchGroups[pitch]) {
      pitchGroups[pitch] = [];
    }
    pitchGroups[pitch].push(note);
  }

  // Sort pitch groups by pitch (low to high)
  const sortedPitches = Object.keys(pitchGroups).sort((a, b) => parseInt(a) - parseInt(b));

  // Convert each pitch group to a voice
  const voices = [];
  for (const pitch of sortedPitches) {
    const notes = pitchGroups[pitch];
    if (notes.length === 0) continue;

    // Sort notes by start time
    notes.sort((a, b) => a.start_time - b.start_time);

    const elements = [];

    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];
      const nextNote = notes[i + 1];

      let element = formatNote(note);

      if (nextNote) {
        const timeUntilNext = nextNote.start_time - note.start_time;
        const noteDuration = note.duration || DEFAULT_DURATION;

        if (Math.abs(timeUntilNext - noteDuration) > 0.001) {
          element += `t${timeUntilNext}`;
        }
      }

      elements.push(element);
    }

    voices.push(elements.join(" "));
  }

  return voices.join("; ");
}

/**
 * Format MIDI notes to ToneLang string
 * @param {Array} notes - Array of MIDI note objects
 * @param {Object} options - Formatting options
 * @param {boolean} options.isDrumTrack - Whether to format as drum track
 * @returns {string} ToneLang representation
 */
export function formatNotation(notes, options = {}) {
  if (options.isDrumTrack) {
    return convertDrumClipNotesToToneLang(notes);
  } else {
    return convertClipNotesToToneLang(notes);
  }
}
