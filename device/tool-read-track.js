// device/tool-read-track.js
const { readClip } = require("./tool-read-clip");
const { midiPitchToName } = require("./tone-lang");

const DEVICE_TYPE_INSTRUMENT = 1;
const DEVICE_TYPE_AUDIO_EFFECT = 2;
const DEVICE_TYPE_MIDI_EFFECT = 4;

/**
 * Read comprehensive information about a track
 * @param {Object} args - The parameters
 * @param {number} args.trackIndex - Track index (0-based)
 * @returns {Object} Result object with track information
 */
function readTrack({ trackIndex }) {
  const track = new LiveAPI(`live_set tracks ${trackIndex}`);

  if (!track.exists()) {
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

    clips: track
      .getChildIds("clip_slots")
      .map((_clipSlotId, clipSlotIndex) => readClip({ trackIndex, clipSlotIndex }))
      .filter((clip) => clip.id != null),

    drumPads:
      track
        .getChildren("devices")
        .find((device) => device.getProperty("can_have_drum_pads"))
        ?.getChildren("drum_pads")
        .filter((pad) => pad.getChildIds("chains").length) // ignore empty pads with no device chains that can't produce sound
        .map((pad) => ({
          pitch: midiPitchToName(pad.getProperty("note")),
          name: pad.getProperty("name"),
        })) ?? null,
  };
}

module.exports = { readTrack, DEVICE_TYPE_INSTRUMENT };
