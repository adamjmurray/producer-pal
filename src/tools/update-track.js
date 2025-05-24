// src/tools/update-track.js

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
  const trackIds = ids
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

  const updatedTracks = [];

  for (const id of trackIds) {
    // Convert string ID to LiveAPI path if needed
    const trackPath = id.startsWith("id ") ? id : `id ${id}`;
    const track = new LiveAPI(trackPath);

    if (!track.exists()) {
      throw new Error(`updateTrack failed: track with id "${id}" does not exist`);
    }

    // Update properties if provided
    if (name != null) {
      track.set("name", name);
    }

    if (color != null) {
      track.setColor(color);
    }

    if (mute != null) {
      track.set("mute", mute);
    }

    if (solo != null) {
      track.set("solo", solo);
    }

    if (arm != null) {
      track.set("arm", arm);
    }

    // Find trackIndex for consistency with readTrack format
    const trackIndex = Number(track.path.match(/live_set tracks (\d+)/)?.[1]);
    if (Number.isNaN(trackIndex)) {
      throw new Error(`updateTrack failed: could not determine trackIndex for id "${id}" (path="${track.path}")`);
    }

    // Build optimistic result object
    const trackResult = {
      id: track.id,
      trackIndex,
    };

    // Only include properties that were actually set
    if (name != null) trackResult.name = name;
    if (color != null) trackResult.color = color;
    if (mute != null) trackResult.mute = mute;
    if (solo != null) trackResult.solo = solo;
    if (arm != null) trackResult.arm = arm;

    updatedTracks.push(trackResult);
  }

  // Return single object if single ID was provided, array if comma-separated IDs were provided
  return trackIds.length > 1 ? updatedTracks : updatedTracks[0];
}
