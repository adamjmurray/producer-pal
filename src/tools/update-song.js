// src/tools/update-song.js
import { parseTimeSignature, toLiveApiView } from "../utils.js";

/**
 * Updates Live Set parameters like tempo, time signature, and playback state
 * @param {Object} args - The parameters
 * @param {number} [args.tempo] - Set tempo in BPM (20.0-999.0)
 * @param {string} [args.timeSignature] - Time signature in format "4/4"
 * @param {string} [args.view] - Switch between Session and Arrangement views
 * @returns {Object} Updated Live Set information
 */
export function updateSong({ view, tempo, timeSignature } = {}) {
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
  if (view != null) songResult.view = view;

  return songResult;
}
