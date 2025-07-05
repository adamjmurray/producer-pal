// src/tools/read-track.js
import { getHostTrackIndex } from "../get-host-track-index";
import { midiPitchToName } from "../notation/midi-pitch-to-name";
import { VERSION } from "../version";
import { readClip } from "./read-clip";

export const DEVICE_TYPE_INSTRUMENT = 1;
export const DEVICE_TYPE_AUDIO_EFFECT = 2;
export const DEVICE_TYPE_MIDI_EFFECT = 4;

/**
 * Find drum pads on a track, including those nested in instrument racks
 * @param {Object} track - Live API track object
 * @returns {Array|null} Array of drum pad objects or null if none found
 */
function findDrumPads(track) {
  const devices = track.getChildren("devices");

  // First, look for direct drum racks
  const directDrumRack = devices.find((device) =>
    device.getProperty("can_have_drum_pads"),
  );
  if (directDrumRack) {
    return extractDrumPads(directDrumRack);
  }

  // Then, look for drum racks nested in instrument racks
  for (const device of devices) {
    // Check if this is an instrument rack
    if (device.getProperty("class_name") === "InstrumentGroupDevice") {
      const chains = device.getChildren("chains");
      if (chains.length > 0) {
        // Check first device in first chain
        const chainDevices = chains[0].getChildren("devices");
        if (chainDevices.length > 0) {
          const firstChainDevice = chainDevices[0];
          if (firstChainDevice.getProperty("can_have_drum_pads")) {
            return extractDrumPads(firstChainDevice);
          }
        }
      }
    }
  }

  return null;
}

/**
 * Extract drum pad information from a drum rack device
 * @param {Object} drumRack - Live API drum rack device object
 * @returns {Array} Array of drum pad objects
 */
function extractDrumPads(drumRack) {
  return drumRack
    .getChildren("drum_pads")
    .filter((pad) => pad.getChildIds("chains").length) // ignore empty pads with no device chains that can't produce sound
    .map((pad) => ({
      pitch: midiPitchToName(pad.getProperty("note")),
      name: pad.getProperty("name"),
    }));
}

/**
 * Read comprehensive information about a track
 * @param {Object} args - The parameters
 * @param {number} args.trackIndex - Track index (0-based)
 * @returns {Object} Result object with track information
 */
export function readTrack({ trackIndex } = {}) {
  const track = new LiveAPI(`live_set tracks ${trackIndex}`);

  if (!track.exists()) {
    return {
      id: null,
      type: null,
      name: null,
      trackIndex,
    };
  }

  const groupId = track.get("group_track")[1];

  const result = {
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
    followsArrangement: track.getProperty("back_to_arranger") === 0,
    isGroup: track.getProperty("is_foldable") > 0,
    isGroupMember: track.getProperty("is_grouped") > 0,
    groupId: groupId ? `${groupId}` : null, // id 0 means it doesn't exist, so convert to null

    sessionClips: track
      .getChildIds("clip_slots")
      .map((_clipSlotId, clipSlotIndex) =>
        readClip({ trackIndex, clipSlotIndex }),
      )
      .filter((clip) => clip.id != null),

    arrangementClips: track
      .getChildIds("arrangement_clips")
      .map((clipId) => readClip({ clipId }))
      .filter((clip) => clip.id != null),

    drumPads: findDrumPads(track),

    // List all devices on the track
    devices: track.getChildren("devices").map((device) => ({
      id: device.id,
      name: device.getProperty("name"),
      className: device.getProperty("class_name"),
      displayName: device.getProperty("class_display_name"),
      type: device.getProperty("type"),
      isInstrument: device.getProperty("type") === DEVICE_TYPE_INSTRUMENT,
      isActive: device.getProperty("is_active"),
      canHaveChains: device.getProperty("can_have_chains"),
      canHaveDrumPads: device.getProperty("can_have_drum_pads"),
    })),
  };

  if (trackIndex === getHostTrackIndex()) {
    result.isProducerPalHostTrack = true;
    result.producerPalVersion = VERSION;
  }

  return result;
}
