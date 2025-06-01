// src/tools/read-track.js
import { getHostTrackIndex } from "../get-host-track-index";
import { midiPitchToName } from "../notation/midi-pitch-to-name";
import { VERSION } from "../version";
import { readClip } from "./read-clip";

export const DEVICE_TYPE_INSTRUMENT = 1;
export const DEVICE_TYPE_AUDIO_EFFECT = 2;
export const DEVICE_TYPE_MIDI_EFFECT = 4;

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
      .map((_clipSlotId, clipSlotIndex) => readClip({ trackIndex, clipSlotIndex }))
      .filter((clip) => clip.id != null),

    arrangementClips: track
      .getChildIds("arrangement_clips")
      .map((clipId) => readClip({ clipId }))
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

  if (trackIndex === getHostTrackIndex()) {
    result.isProducerPalHostTrack = true;
    result.producerPalVersion = VERSION;
  }

  return result;
}
