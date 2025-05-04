// device/create-clip.js
// CJS (require()'d by v8)

// Parse note name (e.g. "C3", "Bb2") to MIDI pitch
function parseNote(note) {
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
  const match = note.match(/^([A-G])([#b]?)(-?\d+)$/);
  if (!match) return null;

  const [, letter, accidental, octave] = match;
  const noteKey = letter + accidental;
  const pitchClass = pitchClasses[noteKey];

  if (pitchClass === undefined) return null;

  // MIDI formula: (octave + 2) * 12 + pitch class
  return (Number(octave) + 2) * 12 + pitchClass;
}

// Parse musical string format into notes/chords
function parseMusicString(musicString, duration = 1.0) {
  if (!musicString) return [];

  const notes = [];
  let currentTime = 0;

  // Split by whitespace but preserve chord groupings
  const tokens = musicString.match(/\[.*?\]|\S+/g) || [];

  for (const token of tokens) {
    if (token.startsWith("[") && token.endsWith("]")) {
      // Parse chord
      const chordNotes = token.slice(1, -1).split(/\s+/);
      for (const noteStr of chordNotes) {
        const pitch = parseNote(noteStr);
        if (pitch !== null) {
          notes.push({
            pitch,
            start_time: currentTime,
            duration,
            velocity: 100,
          });
        }
      }
      currentTime += duration;
    } else {
      // Parse single note
      const pitch = parseNote(token);
      if (pitch !== null) {
        notes.push({
          pitch,
          start_time: currentTime,
          duration,
          velocity: 100,
        });
        currentTime += duration;
      }
    }
  }

  return notes;
}

function createClip(trackIndex, clipSlotIndex, musicalNotes, duration = 1.0) {
  try {
    const clipSlot = new LiveAPI(`live_set tracks ${trackIndex} clip_slots ${clipSlotIndex}`);
    if (clipSlot.get("has_clip") == 0) {
      const notes = parseMusicString(musicalNotes, duration);
      const clipLength = Math.max(4, Math.ceil(notes.length * duration));

      clipSlot.call("create_clip", clipLength);

      if (notes.length > 0) {
        const clip = new LiveAPI(`${clipSlot.unquotedpath} clip`);
        clip.call("add_new_notes", { notes });

        return {
          content: [
            {
              type: "text",
              text: `Created clip with ${notes.length} notes at track ${trackIndex}, clip slot ${clipSlotIndex} with duration ${duration}`,
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: "text",
              text: `Created empty clip at track ${trackIndex}, clip slot ${clipSlotIndex}`,
            },
          ],
        };
      }
    } else {
      return {
        content: [
          {
            type: "text",
            text: `Error: Clip slot already has a clip at track ${trackIndex}, clip slot ${clipSlotIndex}`,
          },
        ],
        isError: true,
      };
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error creating clip: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}

module.exports = { createClip };
