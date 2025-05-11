// device/tool-read-track.js
const { readClip } = require("./tool-read-clip");
const { midiPitchToName } = require("./tone-lang");

const DEVICE_TYPE_INSTRUMENT = 1;
const DEVICE_TYPE_AUDIO_EFFECT = 2;
const DEVICE_TYPE_MIDI_EFFECT = 4;

function getDrumPads(trackIndex) {
  const track = new LiveAPI(`live_set tracks ${trackIndex}`);
  const deviceIds = track.getChildIds("devices");

  for (const deviceId of deviceIds) {
    const device = new LiveAPI(deviceId);

    if (device.getProperty("type") === DEVICE_TYPE_INSTRUMENT) {
      if (device.getProperty("can_have_drum_pads")) {
        const pads = [];
        const drumPadIds = device.getChildIds("drum_pads");
        for (const padId of drumPadIds) {
          const pad = new LiveAPI(padId);
          // Only add pads that have chains
          if (pad.getChildIds("chains").length) {
            pads.push({
              pitch: midiPitchToName(pad.getProperty("note")),
              name: pad.getProperty("name"),
            });
          }
        }
        return pads;
      }
      // Found an instrument but it's not a drum rack
      return null;
    }
  }
  // No instrument found
  return null;
}

/**
 * Read comprehensive information about a track
 * @param {Object} args - The parameters
 * @param {number} args.trackIndex - Track index (0-based)
 * @returns {Object} Result object with track information
 */
function readTrack({ trackIndex }) {
  const track = new LiveAPI(`live_set tracks ${trackIndex}`);

  if (track.id === "id 0") {
    // track does not exist
    return {
      id: null,
      type: null,
      name: null,
      trackIndex,
    };
  }

  return {
    id: track.id,
    type: track.getProperty("has_midi_input") ? "midi" : "audio",
    name: track.getProperty("name"),
    trackIndex,
    color: track.getColor(),
    isMuted: track.getProperty("mute") > 0,
    isSoloed: track.getProperty("solo") > 0,
    isArmed: track.getProperty("arm") > 0,
    playingSlotIndex: track.getProperty("playing_slot_index"),
    firedSlotIndex: track.getProperty("fired_slot_index"),

    drumPads: getDrumPads(trackIndex),

    clips: track
      .getChildIds("clip_slots")
      .map((clipSlotId, clipSlotIndex) =>
        new LiveAPI(clipSlotId).getProperty("has_clip") ? readClip({ trackIndex, clipSlotIndex }) : null
      )
      .filter((clip) => clip != null),
  };
}

module.exports = { readTrack, DEVICE_TYPE_INSTRUMENT };
