// device/read-track.js
const { liveColorToCss } = require("./utils");

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
    name: track.get("name")?.[0],
    color: liveColorToCss(track.get("color")),
    type: track.get("has_midi_input") > 0 ? "midi" : "audio",

    // Basic track states
    isMuted: track.get("mute") > 0,
    isSoloed: track.get("solo") > 0,
    isArmed: track.get("arm") > 0,

    // Grouping and folding
    isGroup: track.get("is_foldable") > 0,
    isGrouped: track.get("is_grouped") > 0,
    isFolded: track.get("fold_state") > 0,
    isVisible: track.get("is_visible") > 0,

    // Capabilities
    canBeArmed: track.get("can_be_armed") > 0,
    canBeFrozen: track.get("can_be_frozen") > 0,
    canShowChains: track.get("can_show_chains") > 0,
    isShowingChains: track.get("is_showing_chains") > 0,

    // Additional states
    isFrozen: track.get("is_frozen") > 0,
    mutedViaSolo: track.get("muted_via_solo") > 0,
    backToArranger: track.get("back_to_arranger") > 0,

    // I/O capabilities
    hasAudioInput: track.get("has_audio_input") > 0,
    hasAudioOutput: track.get("has_audio_output") > 0,
    hasMidiInput: track.get("has_midi_input") > 0,
    hasMidiOutput: track.get("has_midi_output") > 0,

    // Playback states derived from slot indices
    playingSlotIndex: track.get("playing_slot_index")?.[0],
    firedSlotIndex: track.get("fired_slot_index")?.[0],
    isPlaying: track.get("playing_slot_index")?.[0] >= 0,
    isTriggered: track.get("fired_slot_index")?.[0] >= 0,
  };

  return trackInfo;
}

module.exports = { readTrack };
