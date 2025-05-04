// device/tone-lang.js

/**
 * Parse a ToneLang token into note information
 * @param {string} token - The token to parse (e.g. "C3*2:v90", "R/2")
 * @returns {Object|null} Note information or null if invalid
 */
function parseToneLangToken(token) {
  // Check for rest
  const isRest = token.startsWith("R");

  // Extract velocity if present
  let velocity = 100; // Default velocity
  const velocityMatch = token.match(/:v(\d+)$/);
  if (velocityMatch) {
    velocity = parseInt(velocityMatch[1], 10);
    if (velocity < 1) velocity = 1;
    if (velocity > 127) velocity = 127;
    // Remove velocity part for further processing
    token = token.replace(/:v\d+$/, "");
  }

  // Extract duration modifier
  let durationMultiplier = 1; // Default: quarter note
  if (token.includes("*")) {
    const parts = token.split("*");
    durationMultiplier = parseFloat(parts[1] || "1");
    token = parts[0];
  } else if (token.includes("/")) {
    const parts = token.split("/");
    durationMultiplier = 1 / parseFloat(parts[1] || "1");
    token = parts[0];
  }

  // For rests, we just need the duration
  if (isRest) {
    return {
      isRest: true,
      duration: durationMultiplier,
      velocity: 0, // Rests have no velocity
    };
  }

  // Otherwise, it's a note that needs pitch parsing
  const pitch = parseToneLangNote(token);
  if (pitch === null) return null;

  return {
    pitch,
    duration: durationMultiplier,
    velocity,
  };
}

/**
 * Parse a single ToneLang note name (e.g. "C3", "Bb2") to MIDI pitch
 * @param {string} note - The note name to parse
 * @returns {number|null} MIDI pitch value, or null if invalid
 */
function parseToneLangNote(note) {
  const pitchClasses = {
    C: 0,
    "C#": 1,
    Db: 1,
    D: 2,
    "D#": 3,
    Eb: 3,
    E: 4,
    F: 5,
    "F#": 6,
    Gb: 6,
    G: 7,
    "G#": 8,
    Ab: 8,
    A: 9,
    "A#": 10,
    Bb: 10,
    B: 11,
  };

  // Match note name, accidental, and octave
  const match = note.match(/^([A-G])([#b]?)(-?\d+)$/i);
  if (!match) return null;

  const [, letter, accidental, octave] = match;
  const noteKey = letter.toUpperCase() + accidental;
  const pitchClass = pitchClasses[noteKey];

  if (pitchClass === undefined) return null;

  // MIDI formula: (octave + 2) * 12 + pitch class
  return (Number(octave) + 2) * 12 + pitchClass;
}

/**
 * Parse a ToneLang music notation string into an array of note objects
 * @param {string} musicString - ToneLang notation string
 * @returns {Array<{pitch: number, start_time: number, duration: number, velocity: number}>} Array of note objects
 */
function parseToneLang(musicString) {
  if (!musicString) return [];

  const notes = [];
  let currentTime = 0;

  // Split by whitespace but preserve chord groupings
  const tokens = musicString.match(/\[.*?\](?:[\*\/]\d+)?(?::v\d+)?|\S+/g) || [];

  for (const token of tokens) {
    if ((token.startsWith("[") && token.endsWith("]")) || (token.startsWith("[") && token.includes("]"))) {
      // Handle chord
      let chordText = token;

      // Extract velocity
      let chordVelocity = 100;
      const velocityMatch = chordText.match(/:v(\d+)/);
      if (velocityMatch) {
        chordVelocity = parseInt(velocityMatch[1], 10);
        chordText = chordText.replace(/:v\d+/, "");
      }

      // Extract duration
      let chordDuration = 1;
      const durationMatch = chordText.match(/\]([\*\/]\d+)/);
      if (durationMatch) {
        const modifier = durationMatch[1];
        if (modifier.startsWith("*")) {
          chordDuration = parseFloat(modifier.substring(1));
        } else if (modifier.startsWith("/")) {
          chordDuration = 1 / parseFloat(modifier.substring(1));
        }
        chordText = chordText.replace(/\]([\*\/]\d+)/, "]");
      }

      // Extract notes from within brackets
      const notesMatch = chordText.match(/\[(.*?)\]/);
      if (notesMatch) {
        const noteNames = notesMatch[1].trim().split(/\s+/);
        for (const noteName of noteNames) {
          const pitch = parseToneLangNote(noteName);
          if (pitch !== null) {
            notes.push({
              pitch,
              start_time: currentTime,
              duration: chordDuration,
              velocity: chordVelocity,
            });
          }
        }
      }

      // Advance time
      currentTime += chordDuration;
    } else {
      // Parse single token (note or rest)
      const tokenInfo = parseToneLangToken(token);

      if (tokenInfo) {
        if (tokenInfo.isRest) {
          // For rests, just advance time
          currentTime += tokenInfo.duration;
        } else {
          // For notes, add to the array and advance time
          notes.push({
            pitch: tokenInfo.pitch,
            start_time: currentTime,
            duration: tokenInfo.duration,
            velocity: tokenInfo.velocity,
          });
          currentTime += tokenInfo.duration;
        }
      }
    }
  }

  return notes;
}

module.exports = { parseToneLangNote, parseToneLangToken, parseToneLang };
