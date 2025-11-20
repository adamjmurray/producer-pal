import { VERSION } from "../../../shared/version.js";
import { readClip } from "../../clip/read/read-clip.js";
import { STATE } from "../../constants.js";
import { cleanupInternalDrumChains } from "../../shared/device/device-reader.js";
import {
  processAvailableRouting,
  processCurrentRouting,
} from "./track-routing-helpers.js";

/**
 * Read minimal track information for auto-inclusion when clips are requested.
 * Returns only id, type, trackIndex, and clip arrays/counts based on include flags.
 * @param {object} args - The parameters
 * @param {number} args.trackIndex - Track index
 * @param {object} args.includeFlags - Parsed include flags
 * @returns {object} Minimal track information
 */
export function readTrackMinimal({ trackIndex, includeFlags }) {
  const track = new LiveAPI(`live_set tracks ${trackIndex}`);

  if (!track.exists()) {
    return {
      id: null,
      type: null,
      trackIndex,
    };
  }

  const isMidiTrack = track.getProperty("has_midi_input") > 0;

  const result = {
    id: track.id,
    type: isMidiTrack ? "midi" : "audio",
    trackIndex,
  };

  // Session clips - only for regular tracks
  if (includeFlags.includeSessionClips || includeFlags.includeAllClips) {
    result.sessionClips = track
      .getChildIds("clip_slots")
      .map((_clipSlotId, sceneIndex) =>
        readClip({
          trackIndex,
          sceneIndex,
        }),
      )
      .filter((clip) => clip.id != null);
  } else {
    result.sessionClipCount = track
      .getChildIds("clip_slots")
      .map((_clipSlotId, sceneIndex) => {
        const clip = new LiveAPI(
          `live_set tracks ${trackIndex} clip_slots ${sceneIndex} clip`,
        );
        return clip.exists() ? clip : null;
      })
      .filter(Boolean).length;
  }

  // Arrangement clips - exclude group tracks which have no arrangement clips
  const isGroup = track.getProperty("is_foldable") > 0;
  if (isGroup) {
    if (includeFlags.includeArrangementClips || includeFlags.includeAllClips) {
      result.arrangementClips = [];
    } else {
      result.arrangementClipCount = 0;
    }
  } else if (
    includeFlags.includeArrangementClips ||
    includeFlags.includeAllClips
  ) {
    result.arrangementClips = track
      .getChildIds("arrangement_clips")
      .map((clipId) => readClip({ clipId }))
      .filter((clip) => clip.id != null);
  } else {
    const clipIds = track.getChildIds("arrangement_clips");
    result.arrangementClipCount = clipIds.length;
  }

  return result;
}

/**
 * Handle track that doesn't exist
 * @param {string} category - Track category (regular, return, or master)
 * @param {number} trackIndex - Track index
 * @returns {object} - Result object for non-existent track
 */
export function handleNonExistentTrack(category, trackIndex) {
  const result = {
    id: null,
    type: null,
    name: null,
  };
  if (category === "regular") {
    result.trackIndex = trackIndex;
  } else if (category === "return") {
    result.returnTrackIndex = trackIndex;
  } else if (category === "master") {
    result.trackIndex = null;
  }
  return result;
}

/**
 * Add optional boolean properties to track result
 * @param {object} result - Result object to modify
 * @param {LiveAPI} track - Track object
 * @param {boolean} canBeArmed - Whether the track can be armed
 */
export function addOptionalBooleanProperties(result, track, canBeArmed) {
  const isArmed = canBeArmed ? track.getProperty("arm") > 0 : false;
  if (isArmed) {
    result.isArmed = isArmed;
  }
  const isGroup = track.getProperty("is_foldable") > 0;
  if (isGroup) {
    result.isGroup = isGroup;
  }
  const isGroupMember = track.getProperty("is_grouped") > 0;
  if (isGroupMember) {
    result.isGroupMember = isGroupMember;
  }
}

/**
 * Add track index property based on category
 * @param {object} result - Result object to modify
 * @param {string} category - Track category (regular, return, or master)
 * @param {number} trackIndex - Track index
 */
export function addCategoryIndex(result, category, trackIndex) {
  if (category === "regular") {
    result.trackIndex = trackIndex;
  } else if (category === "return") {
    result.returnTrackIndex = trackIndex;
  }
}

/**
 * Clean up device chains from result
 * @param {object} result - Result object containing device chains
 */
export function cleanupDeviceChains(result) {
  if (result.midiEffects) {
    result.midiEffects = cleanupInternalDrumChains(result.midiEffects);
  }
  if (result.instrument) {
    result.instrument = cleanupInternalDrumChains(result.instrument);
  }
  if (result.audioEffects) {
    result.audioEffects = cleanupInternalDrumChains(result.audioEffects);
  }
}

/**
 * Add slot index properties for regular tracks
 * @param {object} result - Result object to modify
 * @param {LiveAPI} track - Track object
 * @param {string} category - Track category (regular, return, or master)
 */
export function addSlotIndices(result, track, category) {
  if (category !== "regular") {
    return;
  }
  const playingSlotIndex = track.getProperty("playing_slot_index");
  if (playingSlotIndex >= 0) {
    result.playingSlotIndex = playingSlotIndex;
  }
  const firedSlotIndex = track.getProperty("fired_slot_index");
  if (firedSlotIndex >= 0) {
    result.firedSlotIndex = firedSlotIndex;
  }
}

/**
 * Add state property if not default active state
 * @param {object} result - Result object to modify
 * @param {LiveAPI} track - Track object
 * @param {string} category - Track category (regular, return, or master)
 */
export function addStateIfNotDefault(result, track, category) {
  const trackState = computeState(track, category);
  if (trackState !== STATE.ACTIVE) {
    result.state = trackState;
  }
}

/**
 * Compute the state of a Live object (track, drum pad, or chain) based on mute/solo properties
 * @param {object} liveObject - Live API object with mute, solo, and muted_via_solo properties
 * @param {string} category - Track category (regular, return, or master)
 * @returns {string} State: "active" | "muted" | "muted-via-solo" | "muted-also-via-solo" | "soloed"
 */
function computeState(liveObject, category = "regular") {
  // Master track doesn't have mute/solo/muted_via_solo properties
  if (category === "master") {
    return STATE.ACTIVE;
  }
  const isMuted = liveObject.getProperty("mute") > 0;
  const isSoloed = liveObject.getProperty("solo") > 0;
  const isMutedViaSolo = liveObject.getProperty("muted_via_solo") > 0;
  if (isSoloed) {
    return STATE.SOLOED;
  }
  if (isMuted && isMutedViaSolo) {
    return STATE.MUTED_ALSO_VIA_SOLO;
  }
  if (isMutedViaSolo) {
    return STATE.MUTED_VIA_SOLO;
  }
  if (isMuted) {
    return STATE.MUTED;
  }
  return STATE.ACTIVE;
}

/**
 * Add routing information if requested
 * @param {object} result - Result object to modify
 * @param {LiveAPI} track - Track object
 * @param {string} category - Track category (regular, return, or master)
 * @param {boolean} isGroup - Whether the track is a group
 * @param {boolean} canBeArmed - Whether the track can be armed
 * @param {boolean} includeRoutings - Whether to include current routing info
 * @param {boolean} includeAvailableRoutings - Whether to include available routing options
 */
export function addRoutingInfo(
  result,
  track,
  category,
  isGroup,
  canBeArmed,
  includeRoutings,
  includeAvailableRoutings,
) {
  if (includeRoutings) {
    Object.assign(
      result,
      processCurrentRouting(track, category, isGroup, canBeArmed),
    );
  }
  if (includeAvailableRoutings) {
    Object.assign(result, processAvailableRouting(track, category, isGroup));
  }
}

/**
 * Add producer pal host information if applicable
 * @param {object} result - Result object to modify
 * @param {boolean} isProducerPalHost - Whether this is the Producer Pal host track
 */
export function addProducerPalHostInfo(result, isProducerPalHost) {
  if (isProducerPalHost) {
    result.hasProducerPalDevice = true;
    result.producerPalVersion = VERSION;
  }
}
