import {
  LIVE_API_MONITORING_STATE_AUTO,
  LIVE_API_MONITORING_STATE_IN,
  LIVE_API_MONITORING_STATE_OFF,
  MONITORING_STATE,
} from "../constants.js";
import { validateIdTypes } from "../shared/id-validation.js";
import { parseCommaSeparatedIds } from "../shared/utils.js";

/**
 * Updates properties of existing tracks
 * @param {object} args - The track parameters
 * @param {string} args.ids - Track ID or comma-separated list of track IDs to update
 * @param {string} [args.name] - Optional track name
 * @param {string} [args.color] - Optional track color (CSS format: hex)
 * @param {boolean} [args.mute] - Optional mute state
 * @param {boolean} [args.solo] - Optional solo state
 * @param {boolean} [args.arm] - Optional arm state
 * @param {string} [args.inputRoutingTypeId] - Optional input routing type identifier
 * @param {string} [args.inputRoutingChannelId] - Optional input routing channel identifier
 * @param {string} [args.outputRoutingTypeId] - Optional output routing type identifier
 * @param {string} [args.outputRoutingChannelId] - Optional output routing channel identifier
 * @param {string} [args.monitoringState] - Optional monitoring state ('in', 'auto', 'off')
 * @param {boolean} [args.arrangementFollower] - Whether the track should follow the arrangement timeline
 * @param _context
 * @returns {object | Array<object>} Single track object or array of track objects
 */
export function updateTrack(
  {
    ids,
    name,
    color,
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

    // Handle routing properties
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

    // Handle arrangement follower
    if (arrangementFollower != null) {
      track.set("back_to_arranger", arrangementFollower ? 0 : 1);
    }

    // Handle monitoring state
    if (monitoringState != null) {
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
