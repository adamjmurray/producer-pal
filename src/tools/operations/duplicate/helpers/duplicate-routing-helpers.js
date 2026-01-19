import * as console from "#src/shared/v8-max-console.js";

/**
 * @typedef {object} RoutingType
 * @property {string} display_name - Display name of the routing type
 * @property {string | number} identifier - Identifier of the routing type
 */

/**
 * Find the correct routing option for a track when duplicate names exist
 * @param {LiveAPI} sourceTrack - The source track LiveAPI object
 * @param {string} sourceTrackName - The source track's name
 * @param {RoutingType[]} availableTypes - Available output routing types from the new track
 * @returns {RoutingType | undefined} The correct routing option or undefined
 */
export function findRoutingOptionForDuplicateNames(
  sourceTrack,
  sourceTrackName,
  availableTypes,
) {
  // Get all routing options with the same name
  const matchingOptions = availableTypes.filter(
    (type) => type.display_name === sourceTrackName,
  );

  // If only one match, return it (no duplicates)
  if (matchingOptions.length <= 1) {
    return matchingOptions[0];
  }

  // Multiple matches - need to find the correct one
  const liveSet = LiveAPI.from("live_set");
  const allTrackIds = liveSet.getChildIds("tracks");

  // Find all tracks with the same name and their info
  const tracksWithSameName = allTrackIds
    .map((trackId, index) => {
      const track = LiveAPI.from(trackId);

      return {
        index,
        id: track.id,
        name: track.getProperty("name"),
      };
    })
    .filter((track) => track.name === sourceTrackName);

  // Sort by ID (creation order) - IDs are numeric strings
  tracksWithSameName.sort((a, b) => {
    const idA = Number.parseInt(a.id);
    const idB = Number.parseInt(b.id);

    return idA - idB;
  });

  // Find source track's position in the sorted list
  const sourcePosition = tracksWithSameName.findIndex(
    (track) => track.id === sourceTrack.id,
  );

  if (sourcePosition === -1) {
    console.error(
      `Warning: Could not find source track in duplicate name list for "${sourceTrackName}"`,
    );

    return;
  }

  // Return the routing option at the same position
  return matchingOptions[sourcePosition];
}
