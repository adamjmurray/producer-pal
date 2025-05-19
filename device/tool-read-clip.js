// device/tool-read-clip.js
const { DEFAULT_DURATION, DEFAULT_VELOCITY } = require("./tone-lang.js");

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
function formatChord(notes) {
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

  const noteNames = notes.map((n) => midiPitchToNoteName(n.pitch)).join(" ");
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
function convertClipNotesToToneLang(clipNotes) {
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
function convertDrumClipNotesToToneLang(clipNotes) {
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
 * Read a MIDI clip from Ableton Live and return its notes as a ToneLang string
 * @param {Object} args - Arguments for the function
 * @param {number} [args.trackIndex] - Track index (0-based)
 * @param {number} [args.clipSlotIndex] - Clip slot index (0-based)
 * @param {string} [args.clipId] - Clip ID to directly access any clip
 * @returns {Object} Result object with clip information
 */
function readClip({ trackIndex = null, clipSlotIndex = null, clipId = null }) {
  if (clipId === null && (trackIndex === null || clipSlotIndex === null)) {
    throw new Error("Either clipId or both trackIndex and clipSlotIndex must be provided");
  }

  // Support "id {id}" (such as returned by childIds()) and id values directly
  // TODO: Need test coverage of this logic
  const clip = new LiveAPI(
    clipId != null
      ? typeof clipId === "string" && clipId.startsWith("id ")
        ? clipId
        : `id ${clipId}`
      : `live_set tracks ${trackIndex} clip_slots ${clipSlotIndex} clip`
  );

  if (!clip.exists()) {
    if (clipId != null) throw new Error(`No clip exists for clipId "${clipId}"`);
    return {
      id: null,
      type: null,
      name: null,
      trackIndex,
      clipSlotIndex,
    };
  }

  const isArrangerClip = clip.getProperty("is_arrangement_clip") > 0;

  const result = {
    id: clip.id,
    type: clip.getProperty("is_midi_clip") ? "midi" : "audio",
    name: clip.getProperty("name"),
    view: isArrangerClip ? "Arranger" : "Session",
    color: clip.getColor(),
    loop: clip.getProperty("looping") > 0,
    length: clip.getProperty("length"),
    startMarker: clip.getProperty("start_marker"),
    endMarker: clip.getProperty("end_marker"),
    loopStart: clip.getProperty("loop_start"),
    loopEnd: clip.getProperty("loop_end"),
    isPlaying: clip.getProperty("is_playing") > 0,
    isTriggered: clip.getProperty("is_triggered") > 0,
  };

  if (isArrangerClip) {
    result.trackIndex = Number.parseInt(clip.path.match(/live_set tracks (\d+)/)[1]);
    result.arrangerStartTime = clip.getProperty("start_time");
  } else {
    const pathMatch = clip.path.match(/live_set tracks (\d+) clip_slots (\d+)/);
    result.trackIndex = Number.parseInt(pathMatch?.[1]);
    result.clipSlotIndex = Number.parseInt(pathMatch?.[2]);
  }

  if (result.type === "midi") {
    // Get the clip notes for MIDI clips
    const notesDictionary = clip.call("get_notes_extended", 0, 127, 0, result.length);
    const notes = JSON.parse(notesDictionary).notes;

    // Use a different ToneLang conversion algorithm for drum tracks and non-drums
    const track = new LiveAPI(`live_set tracks ${result.trackIndex}`);
    const isDrumTrack = !!track.getChildren("devices").find((device) => device.getProperty("can_have_drum_pads"));

    result.noteCount = notes.length;
    result.notes = isDrumTrack ? convertDrumClipNotesToToneLang(notes) : convertClipNotesToToneLang(notes);
  }

  return result;
}

module.exports = {
  readClip,
  formatNote,
  formatChord,
  convertClipNotesToToneLang,
  convertDrumClipNotesToToneLang,
  midiPitchToNoteName,
};
