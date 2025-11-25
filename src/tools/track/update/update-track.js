import {
  LIVE_API_MONITORING_STATE_AUTO,
  LIVE_API_MONITORING_STATE_IN,
  LIVE_API_MONITORING_STATE_OFF,
  MONITORING_STATE,
} from "../../constants.js";
import { verifyColorQuantization } from "../../shared/color-verification-helpers.js";
import { parseCommaSeparatedIds } from "../../shared/utils.js";
import { validateIdTypes } from "../../shared/validation/id-validation.js";

/**
 * Apply routing properties to a track
 * @param {LiveAPI} track - Track object
 * @param {object} params - Routing properties
 * @param {string} params.inputRoutingTypeId - Input routing type ID
 * @param {string} params.inputRoutingChannelId - Input routing channel ID
 * @param {string} params.outputRoutingTypeId - Output routing type ID
 * @param {string} params.outputRoutingChannelId - Output routing channel ID
 */
function applyRoutingProperties(
  track,
  {
    inputRoutingTypeId,
    inputRoutingChannelId,
    outputRoutingTypeId,
    outputRoutingChannelId,
  },
) {
  if (inputRoutingTypeId != null) {
    track.setProperty("input_routing_type", {
      identifier: Number(inputRoutingTypeId),
    });
  }

  if (inputRoutingChannelId != null) {
    track.setProperty("input_routing_channel", {
      identifier: Number(inputRoutingChannelId),
    });
  }

  if (outputRoutingTypeId != null) {
    track.setProperty("output_routing_type", {
      identifier: Number(outputRoutingTypeId),
    });
  }

  if (outputRoutingChannelId != null) {
    track.setProperty("output_routing_channel", {
      identifier: Number(outputRoutingChannelId),
    });
  }
}

/**
 * Apply monitoring state to a track
 * @param {LiveAPI} track - Track object
 * @param {string} monitoringState - Monitoring state value (in, auto, off)
 */
function applyMonitoringState(track, monitoringState) {
  if (monitoringState == null) {
    return;
  }

  const monitoringValue = {
    [MONITORING_STATE.IN]: LIVE_API_MONITORING_STATE_IN,
    [MONITORING_STATE.AUTO]: LIVE_API_MONITORING_STATE_AUTO,
    [MONITORING_STATE.OFF]: LIVE_API_MONITORING_STATE_OFF,
  }[monitoringState];

  if (monitoringValue === undefined) {
    throw new Error(
      `updateTrack failed: invalid monitoring state "${monitoringState}". Must be one of: ${Object.values(MONITORING_STATE).join(", ")}`,
    );
  }

  track.set("current_monitoring_state", monitoringValue);
}

/**
 * Apply mixer properties (gain and panning) to a track
 * @param {LiveAPI} track - Track object
 * @param {object} params - Mixer properties
 * @param {number} params.gainDb - Track gain in dB (-70 to 6)
 * @param {number} params.pan - Pan position (-1 to 1)
 */
function applyMixerProperties(track, { gainDb, pan }) {
  const mixer = new LiveAPI(track.path + " mixer_device");

  if (!mixer.exists()) {
    return;
  }

  if (gainDb != null) {
    const volume = new LiveAPI(mixer.path + " volume");
    if (volume.exists()) {
      volume.set("display_value", gainDb);
    }
  }

  if (pan != null) {
    const panning = new LiveAPI(mixer.path + " panning");
    if (panning.exists()) {
      panning.set("value", pan);
    }
  }
}

/**
 * Updates properties of existing tracks
 * @param {object} args - The track parameters
 * @param {string} args.ids - Track ID or comma-separated list of track IDs to update
 * @param {string} [args.name] - Optional track name
 * @param {string} [args.color] - Optional track color (CSS format: hex)
 * @param {number} [args.gainDb] - Optional track gain in dB (-70 to 6)
 * @param {number} [args.pan] - Optional pan position (-1 to 1)
 * @param {boolean} [args.mute] - Optional mute state
 * @param {boolean} [args.solo] - Optional solo state
 * @param {boolean} [args.arm] - Optional arm state
 * @param {string} [args.inputRoutingTypeId] - Optional input routing type identifier
 * @param {string} [args.inputRoutingChannelId] - Optional input routing channel identifier
 * @param {string} [args.outputRoutingTypeId] - Optional output routing type identifier
 * @param {string} [args.outputRoutingChannelId] - Optional output routing channel identifier
 * @param {string} [args.monitoringState] - Optional monitoring state ('in', 'auto', 'off')
 * @param {boolean} [args.arrangementFollower] - Whether the track should follow the arrangement timeline
 * @param {object} _context - Internal context object (unused)
 * @returns {object | Array<object>} Single track object or array of track objects
 */
export function updateTrack(
  {
    ids,
    name,
    color,
    gainDb,
    pan,
    mute,
    solo,
    arm,
    inputRoutingTypeId,
    inputRoutingChannelId,
    outputRoutingTypeId,
    outputRoutingChannelId,
    monitoringState,
    arrangementFollower,
  } = {},
  _context = {},
) {
  if (!ids) {
    throw new Error("updateTrack failed: ids is required");
  }

  // Parse comma-separated string into array
  const trackIds = parseCommaSeparatedIds(ids);

  // Validate all IDs are tracks, skip invalid ones
  const tracks = validateIdTypes(trackIds, "track", "updateTrack", {
    skipInvalid: true,
  });

  const updatedTracks = [];

  for (const track of tracks) {
    track.setAll({
      name,
      color,
      mute,
      solo,
      arm,
    });

    // Verify color quantization if color was set
    if (color != null) {
      verifyColorQuantization(track, color);
    }

    // Handle mixer properties
    if (gainDb != null || pan != null) {
      applyMixerProperties(track, { gainDb, pan });
    }

    // Handle routing properties
    applyRoutingProperties(track, {
      inputRoutingTypeId,
      inputRoutingChannelId,
      outputRoutingTypeId,
      outputRoutingChannelId,
    });

    // Handle arrangement follower
    if (arrangementFollower != null) {
      track.set("back_to_arranger", arrangementFollower ? 0 : 1);
    }

    // Handle monitoring state
    applyMonitoringState(track, monitoringState);

    // Build optimistic result object
    updatedTracks.push({
      id: track.id,
    });
  }

  // Return single object if one valid result, array for multiple results or empty array for none
  if (updatedTracks.length === 0) {
    return [];
  }
  return updatedTracks.length === 1 ? updatedTracks[0] : updatedTracks;
}
