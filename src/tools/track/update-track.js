// src/tools/update-track.js
import {
  LIVE_API_MONITORING_STATE_AUTO,
  LIVE_API_MONITORING_STATE_IN,
  LIVE_API_MONITORING_STATE_OFF,
  MONITORING_STATE,
} from "../constants.js";
import { parseCommaSeparatedIds, withoutNulls } from "../shared/utils.js";

/**
 * Updates properties of existing tracks
 * @param {Object} args - The track parameters
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
 * @returns {Object|Array<Object>} Single track object or array of track objects
 */
export function updateTrack({
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
} = {}) {
  if (!ids) {
    throw new Error("updateTrack failed: ids is required");
  }

  // Parse comma-separated string into array
  const trackIds = parseCommaSeparatedIds(ids);

  const updatedTracks = [];

  for (const id of trackIds) {
    // Convert string ID to LiveAPI path if needed
    const track = LiveAPI.from(id);

    if (!track.exists()) {
      throw new Error(
        `updateTrack failed: track with id "${id}" does not exist`,
      );
    }

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

    // Find trackIndex for consistency with readTrack format
    const trackIndex = Number(track.path.match(/live_set tracks (\d+)/)?.[1]);
    if (Number.isNaN(trackIndex)) {
      throw new Error(
        `updateTrack failed: could not determine trackIndex for id "${id}" (path="${track.path}")`,
      );
    }

    // Build optimistic result object
    updatedTracks.push(
      withoutNulls({
        id: track.id,
        trackIndex,
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
      }),
    );
  }

  // Return single object if single ID was provided, array if comma-separated IDs were provided
  return trackIds.length > 1 ? updatedTracks : updatedTracks[0];
}
