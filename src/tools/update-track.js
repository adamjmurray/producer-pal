// src/tools/update-track.js
import { withoutNulls, parseCommaSeparatedIds } from "../utils.js";

/**
 * Updates properties of existing tracks
 * @param {Object} args - The track parameters
 * @param {string} args.ids - Track ID or comma-separated list of track IDs to update
 * @param {string} [args.name] - Optional track name
 * @param {string} [args.color] - Optional track color (CSS format: hex)
 * @param {boolean} [args.mute] - Optional mute state
 * @param {boolean} [args.solo] - Optional solo state
 * @param {boolean} [args.arm] - Optional arm state
 * @returns {Object|Array<Object>} Single track object or array of track objects
 */
export function updateTrack({ ids, name, color, mute, solo, arm } = {}) {
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
      throw new Error(`updateTrack failed: track with id "${id}" does not exist`);
    }

    track.setAll({
      name,
      color,
      mute,
      solo,
      arm,
    });

    // Find trackIndex for consistency with readTrack format
    const trackIndex = Number(track.path.match(/live_set tracks (\d+)/)?.[1]);
    if (Number.isNaN(trackIndex)) {
      throw new Error(`updateTrack failed: could not determine trackIndex for id "${id}" (path="${track.path}")`);
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
      })
    );
  }

  // Return single object if single ID was provided, array if comma-separated IDs were provided
  return trackIds.length > 1 ? updatedTracks : updatedTracks[0];
}
