import * as console from "#src/shared/v8-max-console.js";
import { VERSION } from "#src/shared/version.js";
import { readClip } from "#src/tools/clip/read/read-clip.js";
import { STATE } from "#src/tools/constants.js";
import { cleanupInternalDrumPads } from "#src/tools/shared/device/device-reader.js";
import { computeState } from "#src/tools/shared/device/helpers/device-state-helpers.js";
import {
  processAvailableRouting,
  processCurrentRouting,
} from "#src/tools/track/helpers/track-routing-helpers.js";

/**
 * Read all session clips from a track
 * @param {LiveAPI} track - Track object
 * @param {number} trackIndex - Track index
 * @param {Array<string>} [include] - Include array for nested reads
 * @returns {Array<object>} Array of clip objects (only clips that exist)
 */
export function readSessionClips(track, trackIndex, include = null) {
  return track
    .getChildIds("clip_slots")
    .map((_clipSlotId, sceneIndex) =>
      readClip({
        trackIndex,
        sceneIndex,
        ...(include && { include }),
      }),
    )
    .filter((clip) => clip.id != null);
}

/**
 * Count session clips in a track (faster than reading full clip details)
 * @param {LiveAPI} track - Track object
 * @param {number} trackIndex - Track index
 * @returns {number} Number of clips
 */
export function countSessionClips(track, trackIndex) {
  return track
    .getChildIds("clip_slots")
    .map((_clipSlotId, sceneIndex) => {
      const clip = LiveAPI.from(
        `live_set tracks ${trackIndex} clip_slots ${sceneIndex} clip`,
      );

      return clip.exists() ? clip : null;
    })
    .filter(Boolean).length;
}

/**
 * Read all arrangement clips from a track
 * @param {LiveAPI} track - Track object
 * @param {Array<string>} [include] - Include array for nested reads
 * @returns {Array<object>} Array of clip objects (only clips that exist)
 */
export function readArrangementClips(track, include = null) {
  return track
    .getChildIds("arrangement_clips")
    .map((clipId) =>
      readClip({
        clipId,
        ...(include && { include }),
      }),
    )
    .filter((clip) => clip.id != null);
}

/**
 * Count arrangement clips in a track
 * @param {LiveAPI} track - Track object
 * @returns {number} Number of clips
 */
export function countArrangementClips(track) {
  return track.getChildIds("arrangement_clips").length;
}

/**
 * Read minimal track information for auto-inclusion when clips are requested.
 * Returns only id, type, trackIndex, and clip arrays/counts based on include flags.
 * @param {object} args - The parameters
 * @param {number} args.trackIndex - Track index
 * @param {object} args.includeFlags - Parsed include flags
 * @returns {object} Minimal track information
 */
export function readTrackMinimal({ trackIndex, includeFlags }) {
  const track = LiveAPI.from(`live_set tracks ${trackIndex}`);

  if (!track.exists()) {
    return {
      id: null,
      type: null,
      trackIndex,
    };
  }

  const isMidiTrack =
    /** @type {number} */ (track.getProperty("has_midi_input")) > 0;

  const result = {
    id: track.id,
    type: isMidiTrack ? "midi" : "audio",
    trackIndex,
  };

  // Session clips - only for regular tracks
  if (includeFlags.includeSessionClips || includeFlags.includeAllClips) {
    result.sessionClips = readSessionClips(track, trackIndex);
  } else {
    result.sessionClipCount = countSessionClips(track, trackIndex);
  }

  // Arrangement clips - exclude group tracks which have no arrangement clips
  const isGroup = /** @type {number} */ (track.getProperty("is_foldable")) > 0;

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
    result.arrangementClips = readArrangementClips(track);
  } else {
    result.arrangementClipCount = countArrangementClips(track);
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
  const isArmed = canBeArmed
    ? /** @type {number} */ (track.getProperty("arm")) > 0
    : false;

  if (isArmed) {
    result.isArmed = isArmed;
  }

  const isGroup = /** @type {number} */ (track.getProperty("is_foldable")) > 0;

  if (isGroup) {
    result.isGroup = isGroup;
  }

  const isGroupMember =
    /** @type {number} */ (track.getProperty("is_grouped")) > 0;

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
    result.midiEffects = cleanupInternalDrumPads(result.midiEffects);
  }

  if (result.instrument) {
    result.instrument = cleanupInternalDrumPads(result.instrument);
  }

  if (result.audioEffects) {
    result.audioEffects = cleanupInternalDrumPads(result.audioEffects);
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

  const playingSlotIndex = /** @type {number} */ (
    track.getProperty("playing_slot_index")
  );

  if (playingSlotIndex >= 0) {
    result.playingSlotIndex = playingSlotIndex;
  }

  const firedSlotIndex = /** @type {number} */ (
    track.getProperty("fired_slot_index")
  );

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

/**
 * Read mixer device properties (gain, panning, and sends)
 * @param {LiveAPI} track - Track object
 * @param {Array<string>} [returnTrackNames] - Array of return track names for sends
 * @returns {object} Object with gain, pan, and sends properties, or empty if mixer doesn't exist
 */
export function readMixerProperties(track, returnTrackNames) {
  const mixer = LiveAPI.from(track.path + " mixer_device");

  if (!mixer.exists()) {
    return {};
  }

  const result = {};

  // Read gain
  const volume = LiveAPI.from(mixer.path + " volume");

  if (volume.exists()) {
    result.gainDb = volume.getProperty("display_value");
  }

  // Read panning mode
  const panningMode = mixer.getProperty("panning_mode");
  const isSplitMode = panningMode === 1;

  result.panningMode = isSplitMode ? "split" : "stereo";

  // Read panning based on mode
  if (isSplitMode) {
    const leftSplit = LiveAPI.from(mixer.path + " left_split_stereo");
    const rightSplit = LiveAPI.from(mixer.path + " right_split_stereo");

    if (leftSplit.exists()) {
      result.leftPan = leftSplit.getProperty("value");
    }

    if (rightSplit.exists()) {
      result.rightPan = rightSplit.getProperty("value");
    }
  } else {
    const panning = LiveAPI.from(mixer.path + " panning");

    if (panning.exists()) {
      result.pan = panning.getProperty("value");
    }
  }

  // Read sends
  const sends = mixer.getChildren("sends");

  if (sends.length > 0) {
    // Fetch return track names if not provided
    let names = returnTrackNames;

    if (!names) {
      const liveSet = LiveAPI.from("live_set");
      const returnTrackIds = liveSet.getChildIds("return_tracks");

      names = returnTrackIds.map((_, idx) => {
        const rt = LiveAPI.from(`live_set return_tracks ${idx}`);

        return /** @type {string} */ (rt.getProperty("name"));
      });
    }

    // Warn if send count doesn't match return track count
    if (sends.length !== names.length) {
      console.error(
        `Send count (${sends.length}) doesn't match return track count (${names.length})`,
      );
    }

    result.sends = sends.map((send, i) => ({
      gainDb: send.getProperty("display_value"),
      return: names[i] ?? `Return ${i + 1}`,
    }));
  }

  return result;
}
