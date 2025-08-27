// src/tools/update-song.js
import { intervalsToPitchClasses } from "../notation/midi-pitch-to-name.js";
import { pitchClassNameToNumber } from "../notation/pitch-class-name-to-number.js";
import { VALID_SCALE_NAMES } from "./constants.js";
import { parseTimeSignature } from "./shared/utils.js";

/**
 * Updates Live Set parameters like tempo, time signature, scale, and playback state.\n * Note: Scale changes affect currently selected clips and set defaults for new clips.
 * @param {Object} args - The parameters
 * @param {number} [args.tempo] - Set tempo in BPM (20.0-999.0)
 * @param {string} [args.timeSignature] - Time signature in format "4/4"
 * @param {string} [args.scaleRoot] - Scale root note (e.g., "C", "F#", "Bb")
 * @param {string} [args.scale] - Scale name (must be one of the 35 valid scale names)
 * @param {boolean} [args.scaleEnabled] - Enable/disable scale highlighting
 * @returns {Object} Updated Live Set information
 */
export function updateSong({
  tempo,
  timeSignature,
  scaleRoot,
  scale,
  scaleEnabled,
} = {}) {
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

  // Include scalePitches when scale-related parameters are modified
  // But never include when scaleEnabled is explicitly set to false
  const shouldIncludeScalePitches =
    scaleEnabled !== false &&
    (scale != null || scaleRoot != null || scaleEnabled === true);

  if (shouldIncludeScalePitches) {
    const rootNote = liveSet.getProperty("root_note");
    const scaleIntervals = liveSet.getProperty("scale_intervals");
    songResult.scalePitches = intervalsToPitchClasses(scaleIntervals, rootNote);
  }

  return songResult;
}
