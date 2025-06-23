// src/tools/update-song.js
import { parseTimeSignature, toLiveApiView } from "../utils.js";

const VALID_SCALE_NAMES = [
  "Major",
  "Minor",
  "Dorian",
  "Mixolydian",
  "Lydian",
  "Phrygian",
  "Locrian",
  "Whole Tone",
  "Half-whole Dim.",
  "Whole-half Dim.",
  "Minor Blues",
  "Minor Pentatonic",
  "Major Pentatonic",
  "Harmonic Minor",
  "Harmonic Major",
  "Dorian #4",
  "Phrygian Dominant",
  "Melodic Minor",
  "Lydian Augmented",
  "Lydian Dominant",
  "Super Locrian",
  "8-Tone Spanish",
  "Bhairav",
  "Hungarian Minor",
  "Hirajoshi",
  "In-Sen",
  "Iwato",
  "Kumoi",
  "Pelog Selisir",
  "Pelog Tembung",
  "Messiaen 3",
  "Messiaen 4",
  "Messiaen 5",
  "Messiaen 6",
  "Messiaen 7"
];

/**
 * Updates Live Set parameters like tempo, time signature, key, and playback state
 * @param {Object} args - The parameters
 * @param {number} [args.tempo] - Set tempo in BPM (20.0-999.0)
 * @param {string} [args.timeSignature] - Time signature in format "4/4"
 * @param {string} [args.view] - Switch between Session and Arrangement views
 * @param {number} [args.rootNote] - Root note (0-11, where 0=C, 1=C#, 2=D, etc.)
 * @param {string} [args.scaleName] - Scale name (must be one of the 35 valid scale names)
 * @param {boolean} [args.scaleMode] - Enable/disable scale mode highlighting
 * @returns {Object} Updated Live Set information
 */
export function updateSong({ view, tempo, timeSignature, rootNote, scaleName, scaleMode } = {}) {
  const liveSet = new LiveAPI("live_set");

  if (tempo != null) {
    if (tempo < 20 || tempo > 999) {
      throw new Error("Tempo must be between 20.0 and 999.0 BPM");
    }
    liveSet.set("tempo", tempo);
  }

  if (timeSignature != null) {
    const parsed = parseTimeSignature(timeSignature);
    liveSet.set("signature_numerator", parsed.numerator);
    liveSet.set("signature_denominator", parsed.denominator);
  }

  if (rootNote != null) {
    if (!Number.isInteger(rootNote) || rootNote < 0 || rootNote > 11) {
      throw new Error("Root note must be an integer between 0 and 11 (0=C, 1=C#, 2=D, etc.)");
    }
    liveSet.set("root_note", rootNote);
  }

  if (scaleName != null) {
    if (!VALID_SCALE_NAMES.includes(scaleName)) {
      throw new Error(`Scale name must be one of: ${VALID_SCALE_NAMES.join(", ")}`);
    }
    liveSet.set("scale_name", scaleName);
  }

  if (scaleMode != null) {
    liveSet.set("scale_mode", scaleMode ? 1 : 0);
  }

  if (view != null) {
    const appView = new LiveAPI("live_app view");
    appView.call("show_view", toLiveApiView(view));
  }

  // Build optimistic result object
  const songResult = {
    id: liveSet.id,
  };

  // Only include properties that were actually set
  if (tempo != null) songResult.tempo = tempo;
  if (timeSignature != null) songResult.timeSignature = timeSignature;
  if (rootNote != null) songResult.rootNote = rootNote;
  if (scaleName != null) songResult.scaleName = scaleName;
  if (scaleMode != null) songResult.scaleMode = scaleMode;
  if (view != null) songResult.view = view;

  return songResult;
}
