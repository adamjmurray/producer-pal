// device/get-clip.js
/**
 * Convert MIDI pitch number to note name (e.g., 60 -> "C3")
 * @param {number} pitch - MIDI pitch number
 * @returns {string} Note name in the format like "C3", "F#4", etc.
 */
function midiPitchToNoteName(pitch) {
  const octave = Math.floor(pitch / 12) - 2;
  const pitchClass = pitch % 12;

  // Using sharps by default for simplicity
  const pitchClassNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

  return pitchClassNames[pitchClass] + octave;
}

/**
 * Format a single note to ToneLang syntax
 * @param {Object} note - Note object from Live API
 * @returns {string} ToneLang representation of the note
 */
function formatNote(note) {
  const noteName = midiPitchToNoteName(note.pitch);
  let result = noteName;

  // Add velocity if not default (100)
  if (note.velocity !== 100) {
    result += `:v${Math.round(note.velocity)}`;
  }

  // Add duration if not default (1.0)
  if (note.duration !== 1) {
    // Use multiplication for longer notes, division for shorter
    if (note.duration > 1) {
      result += `*${note.duration}`;
    } else {
      result += `/${1 / note.duration}`;
    }
  }

  return result;
}

/**
 * Format a chord (notes with same start time) to ToneLang syntax
 * @param {Array} notes - Array of note objects with the same start time
 * @returns {string} ToneLang representation of the chord
 */
function formatChord(notes) {
  // Sort notes by pitch for consistency
  notes.sort((a, b) => a.pitch - b.pitch);

  // Extract common velocity and duration
  const velocity = notes[0].velocity;
  const duration = notes[0].duration;

  // Check if all notes have the same velocity and duration
  const sameProps = notes.every((n) => n.velocity === velocity && n.duration === duration);

  if (!sameProps) {
    // If notes have different properties, format them individually
    return notes.map(formatNote).join(" ");
  }

  // Format as chord
  const noteNames = notes.map((n) => midiPitchToNoteName(n.pitch)).join(" ");
  let result = `[${noteNames}]`;

  // Add velocity if not default
  if (velocity !== 100) {
    result += `:v${Math.round(velocity)}`;
  }

  // Add duration if not default
  if (duration !== 1) {
    if (duration > 1) {
      result += `*${duration}`;
    } else {
      result += `/${1 / duration}`;
    }
  }

  return result;
}

/**
 * Get a REST token with the specified duration
 * @param {number} duration - Duration of the rest
 * @returns {string} - ToneLang rest token
 */
function getRest(duration) {
  let rest = "R";

  // Add duration if not default
  if (duration !== 1) {
    if (duration > 1) {
      rest += `*${duration}`;
    } else {
      rest += `/${1 / duration}`;
    }
  }

  return rest;
}

/**
 * Convert Live clip notes to ToneLang string
 * @param {Array} clipNotes - Array of note objects from the Live API
 * @returns {string} ToneLang representation of the notes
 */
function convertClipNotesToToneLang(clipNotes) {
  if (!clipNotes || clipNotes.length === 0) {
    return "";
  }

  // Sort notes by start time
  clipNotes.sort((a, b) => a.start_time - b.start_time);

  // Group notes by start time to identify chords
  const noteGroups = [];
  let currentGroup = [clipNotes[0]];
  let currentTime = clipNotes[0].start_time;

  for (let i = 1; i < clipNotes.length; i++) {
    const note = clipNotes[i];

    // If this note starts at the same time as the current group, add it to the group
    if (Math.abs(note.start_time - currentTime) < 0.001) {
      currentGroup.push(note);
    } else {
      // Otherwise, finish the current group and start a new one
      noteGroups.push({
        type: "notes",
        time: currentTime,
        notes: currentGroup,
      });

      // Check if we need to add a rest
      if (note.start_time - (currentTime + currentGroup[0].duration) > 0.001) {
        noteGroups.push({
          type: "rest",
          time: currentTime + currentGroup[0].duration,
          duration: note.start_time - (currentTime + currentGroup[0].duration),
        });
      }

      currentGroup = [note];
      currentTime = note.start_time;
    }
  }

  // Add the last group
  noteGroups.push({
    type: "notes",
    time: currentTime,
    notes: currentGroup,
  });

  // Format each group
  const formattedGroups = noteGroups.map((group) => {
    if (group.type === "rest") {
      return getRest(group.duration);
    } else {
      // Format as chord if multiple notes, otherwise as single note
      return group.notes.length > 1 ? formatChord(group.notes) : formatNote(group.notes[0]);
    }
  });

  return formattedGroups.join(" ");
}

/**
 * Read a MIDI clip from Ableton Live and return its notes as a ToneLang string
 * @param {Object} args - Arguments for the function
 * @param {number} args.track - Track index (0-based)
 * @param {number} args.clipSlot - Clip slot index (0-based)
 * @returns {string} Result object. All properties will be null for non-existent clips.
 */
function getClip({ track: trackIndex, clipSlot: clipSlotIndex }) {
  try {
    // Get the clip slot
    const clipSlot = new LiveAPI(`live_set tracks ${trackIndex} clip_slots ${clipSlotIndex}`);

    // Check if the clip slot has a clip
    if (clipSlot.get("has_clip") == 0) {
      // Return null values
      return {
        type: null,
        name: null,
        length: null,
        notes: null,
        noteCount: null,
      };
    }

    // Get the clip
    const clip = new LiveAPI(`${clipSlot.unquotedpath} clip`);

    // Get clip name and length
    const clipName = clip.get("name")?.[0] || "Unnamed";
    const clipLength = clip.get("length")?.[0] || 0;

    // Check if it's a MIDI clip
    const isMidiClip = clip.get("is_midi_clip") > 0;

    if (isMidiClip) {
      // Get the clip notes for MIDI clips
      const notesDictionary = clip.call("get_notes_extended", 0, 127, 0, clipLength);
      const clipNotes = JSON.parse(notesDictionary).notes;

      return {
        type: "midi",
        name: clipName,
        length: clipLength,
        notes: convertClipNotesToToneLang(clipNotes),
        noteCount: clipNotes.length,
      };
    } else {
      // For audio clips, return name and length but null for notes
      return {
        type: "audio",
        name: clipName,
        length: clipLength,
        notes: null,
        noteCount: null,
      };
    }
  } catch (error) {
    return `Error: ${error.message}`;
  }
}

module.exports = { getClip, convertClipNotesToToneLang, midiPitchToNoteName };
