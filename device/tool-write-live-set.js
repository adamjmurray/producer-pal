// device/tool-write-live-set.js
const { readLiveSet } = require("./tool-read-live-set");
/**
 * Updates Live Set parameters like tempo, time signature, and playback state
 * @param {Object} args - The parameters
 * @param {number} [args.tempo] - Set tempo in BPM (20.0-999.0)
 * @param {string} [args.timeSignature] - Time signature in format "4/4"
 * @param {string} [args.view] - Switch between Session and Arranger views
 * @returns {Object} Updated Live Set information
 */
function writeLiveSet({ view, tempo, timeSignature } = {}) {
  const liveSet = new LiveAPI("live_set");

  if (tempo != null) {
    if (tempo < 20 || tempo > 999) {
      throw new Error("Tempo must be between 20.0 and 999.0 BPM");
    }
    liveSet.set("tempo", tempo);
  }

  if (timeSignature != null) {
    const match = timeSignature.match(/^(\d+)\/(\d+)$/);
    if (!match) {
      throw new Error('Time signature must be in format "n/m" (e.g. "4/4")');
    }
    const numerator = parseInt(match[1], 10);
    const denominator = parseInt(match[2], 10);
    liveSet.set("signature_numerator", numerator);
    liveSet.set("signature_denominator", denominator);
  }

  if (view != null) {
    const appView = new LiveAPI("live_app view");
    appView.call("show_view", view);
  }

  return {
    ...readLiveSet(),
    ...(view != null ? { view } : {}),
  };
}

module.exports = { writeLiveSet };
