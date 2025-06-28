// src/tools/update-song.js
import { parseTimeSignature, toLiveApiView } from "../utils.js";
import { pitchClassNameToNumber } from "../notation/pitch-class-name-to-number.js";

export const VALID_SCALE_NAMES = [
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
  "Messiaen 7",
];

/**
 * Updates Live Set parameters like tempo, time signature, scale, and playback state.\n * Note: Scale changes affect currently selected clips and set defaults for new clips.
 * @param {Object} args - The parameters
 * @param {number} [args.tempo] - Set tempo in BPM (20.0-999.0)
 * @param {string} [args.timeSignature] - Time signature in format "4/4"
 * @param {string} [args.view] - Switch between Session and Arrangement views
 * @param {string} [args.scaleRoot] - Scale root note (e.g., "C", "F#", "Bb")
 * @param {string} [args.scale] - Scale name (must be one of the 35 valid scale names)
 * @param {boolean} [args.scaleEnabled] - Enable/disable scale highlighting
 * @param {string|null} [args.selectedClipId] - Select a specific clip by ID, or pass null to deselect all clips
 * @param {boolean} [args.showClip] - Show the clip detail view after selecting a clip
 * @returns {Object} Updated Live Set information
 */
export function updateSong({
  view,
  tempo,
  timeSignature,
  scaleRoot,
  scale,
  scaleEnabled,
  selectedClipId,
  showClip,
} = {}) {
  const liveSet = new LiveAPI("live_set");

  // Handle clip selection/deselection (before scale changes)
  if (selectedClipId !== undefined) {
    const songView = new LiveAPI("live_set view");
    if (selectedClipId === null) {
      // Deselect all clips
      songView.set("detail_clip", "id 0");
    } else {
      // Select specific clip
      songView.set("detail_clip", "id " + selectedClipId);
    }
  }

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

  if (scaleRoot != null) {
    const scaleRootNumber = pitchClassNameToNumber(scaleRoot);
    liveSet.set("root_note", scaleRootNumber);
  }

  if (scale != null) {
    if (!VALID_SCALE_NAMES.includes(scale)) {
      throw new Error(
        `Scale name must be one of: ${VALID_SCALE_NAMES.join(", ")}`,
      );
    }
    liveSet.set("scale_name", scale);
  }

  if (scaleEnabled != null) {
    liveSet.set("scale_mode", scaleEnabled ? 1 : 0);
  }

  if (view != null) {
    const appView = new LiveAPI("live_app view");
    appView.call("show_view", toLiveApiView(view));
  }

  // Show clip detail view if requested (after view switching and clip selection)
  if (showClip && selectedClipId != null) {
    const appView = new LiveAPI("live_app view");
    appView.call("focus_view", "Detail/Clip");
  }

  // Build optimistic result object
  const songResult = {
    id: liveSet.id,
  };

  // Only include properties that were actually set
  if (tempo != null) songResult.tempo = tempo;
  if (timeSignature != null) songResult.timeSignature = timeSignature;
  if (scaleRoot != null) songResult.scaleRoot = scaleRoot;
  if (scale != null) songResult.scale = scale;
  if (scaleEnabled != null) songResult.scaleEnabled = scaleEnabled;
  if (view != null) songResult.view = view;
  if (selectedClipId !== undefined) songResult.selectedClipId = selectedClipId;
  if (showClip != null) songResult.showClip = showClip;

  return songResult;
}
