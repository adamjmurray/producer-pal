// device/tool-read-track.js
const { readClip } = require("./tool-read-clip");
const { midiPitchToName } = require("./tone-lang");

const DEVICE_TYPE_INSTRUMENT = 1;

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
  // Get the track
  const track = new LiveAPI(`live_set tracks ${trackIndex}`);

  // Check if the track exists
  if (track.id === "id 0") {
    return {
      success: false,
      error: `Track at index ${trackIndex} does not exist`,
    };
  }

  // Get track properties
  const trackInfo = {
    success: true,
    trackIndex,
    id: track.id,
    name: track.getProperty("name"),
    color: track.getColor(),
    type: track.getProperty("has_midi_input") ? "midi" : "audio",

    // Basic track states
    isMuted: track.getProperty("mute") > 0,
    isSoloed: track.getProperty("solo") > 0,
    isArmed: track.getProperty("arm") > 0,

    // Grouping and folding
    isGroup: track.getProperty("is_foldable") > 0,
    isGrouped: track.getProperty("is_grouped") > 0,
    isFolded: track.getProperty("fold_state") > 0,
    isVisible: track.getProperty("is_visible") > 0,

    // Capabilities
    canBeArmed: track.getProperty("can_be_armed") > 0,
    canBeFrozen: track.getProperty("can_be_frozen") > 0,
    canShowChains: track.getProperty("can_show_chains") > 0,
    isShowingChains: track.getProperty("is_showing_chains") > 0,

    // Additional states
    isFrozen: track.getProperty("is_frozen") > 0,
    mutedViaSolo: track.getProperty("muted_via_solo") > 0,
    backToArranger: track.getProperty("back_to_arranger") > 0,

    // I/O capabilities
    hasAudioInput: track.getProperty("has_audio_input") > 0,
    hasAudioOutput: track.getProperty("has_audio_output") > 0,
    hasMidiInput: track.getProperty("has_midi_input") > 0,
    hasMidiOutput: track.getProperty("has_midi_output") > 0,

    // Playback states derived from slot indices
    playingSlotIndex: track.getProperty("playing_slot_index"),
    firedSlotIndex: track.getProperty("fired_slot_index"),
    isPlaying: track.getProperty("playing_slot_index") >= 0,
    isTriggered: track.getProperty("fired_slot_index") >= 0,

    // Drum pads (if available)
    drumPads: getDrumPads(trackIndex),

    clips: track
      .getChildIds("clip_slots")
      .map((clipSlotId, clipSlotIndex) =>
        new LiveAPI(clipSlotId).getProperty("has_clip") ? readClip({ trackIndex, clipSlotIndex }) : null
      )
      .filter((clip) => clip != null),
  };

  return trackInfo;
}

module.exports = { readTrack, DEVICE_TYPE_INSTRUMENT };
