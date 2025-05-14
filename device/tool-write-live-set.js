// device/tool-write-live-set.js
const { readLiveSet } = require("./tool-read-live-set");
const { sleep, DEFAULT_SLEEP_TIME_AFTER_WRITE } = require("./sleep");

/**
 * Updates Live Set parameters like tempo, time signature, and playback state
 * @param {Object} args - The parameters
 * @param {boolean} [args.isPlaying] - Start/stop transport
 * @param {number} [args.tempo] - Set tempo in BPM (20.0-999.0)
 * @param {string} [args.timeSignature] - Time signature in format "4/4"
 * @param {boolean} [args.stopAllClips=false] - Stop all clips in the Live Set
 * @returns {Object} Updated Live Set information
 */
async function writeLiveSet({ isPlaying, tempo, timeSignature, stopAllClips = false, view }) {
  const liveSet = new LiveAPI("live_set");

  if (isPlaying != null) {
    liveSet.set("is_playing", isPlaying);
  }

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

  if (stopAllClips) {
    liveSet.call("stop_all_clips", 0);
  }

  if (stopAllClips || isPlaying != null || view != null) {
    // clip triggered/playing/view state won't be updated until we wait a moment
    await sleep(DEFAULT_SLEEP_TIME_AFTER_WRITE);
  }

  return readLiveSet();
}

module.exports = { writeLiveSet };
