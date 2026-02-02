import * as console from "#src/shared/v8-max-console.ts";

export interface RoutingType {
  display_name: string;
  identifier: string | number;
}

/**
 * Configure the source track input routing
 * @param sourceTrack - The source track LiveAPI object
 * @param sourceTrackName - The source track name
 */
function configureSourceTrackInput(
  sourceTrack: LiveAPI,
  sourceTrackName: string,
): void {
  // Arm the source track for input
  const currentArm = sourceTrack.getProperty("arm");

  sourceTrack.set("arm", 1);

  if (currentArm !== 1) {
    console.warn(`routeToSource: Armed the source track`);
  }

  const currentInputType = sourceTrack.getProperty(
    "input_routing_type",
  ) as RoutingType | null;
  const currentInputName = currentInputType?.display_name;

  if (currentInputName !== "No Input") {
    // Set source track input to "No Input" to prevent unwanted external input
    const sourceInputTypes = sourceTrack.getProperty(
      "available_input_routing_types",
    ) as RoutingType[] | null;
    const noInput = sourceInputTypes?.find(
      (type) => type.display_name === "No Input",
    );

    if (noInput) {
      sourceTrack.setProperty("input_routing_type", {
        identifier: noInput.identifier,
      });
      // Warn that input routing changed
      console.warn(
        `Changed track "${sourceTrackName}" input routing from "${currentInputName}" to "No Input"`,
      );
    } else {
      console.warn(
        `Tried to change track "${sourceTrackName}" input routing from "${currentInputName}" to "No Input" but could not find "No Input"`,
      );
    }
  }
}

/**
 * Find the correct routing option for a track when duplicate names exist
 * @param sourceTrack - The source track LiveAPI object
 * @param sourceTrackName - The source track's name
 * @param availableTypes - Available output routing types from the new track
 * @returns The correct routing option or undefined
 */
export function findRoutingOptionForDuplicateNames(
  sourceTrack: LiveAPI,
  sourceTrackName: string,
  availableTypes: RoutingType[],
): RoutingType | undefined {
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
    console.warn(
      `Could not find source track in duplicate name list for "${sourceTrackName}"`,
    );

    return;
  }

  // Return the routing option at the same position
  return matchingOptions[sourcePosition];
}

/**
 * Find source routing for duplicate track
 * @param sourceTrack - The source track LiveAPI object
 * @param sourceTrackName - The source track name
 * @param availableTypes - Available routing types
 * @returns The routing type to use
 */
function findSourceRouting(
  sourceTrack: LiveAPI,
  sourceTrackName: string,
  availableTypes: RoutingType[] | null,
): RoutingType | undefined {
  // Check if there are duplicate track names
  const matchingNames =
    availableTypes?.filter((type) => type.display_name === sourceTrackName) ??
    [];

  if (matchingNames.length > 1) {
    // Multiple tracks with the same name - use duplicate-aware matching
    // At this point, availableTypes must be non-null since matchingNames is non-empty
    const sourceRouting = findRoutingOptionForDuplicateNames(
      sourceTrack,
      sourceTrackName,
      availableTypes as RoutingType[],
    );

    if (!sourceRouting) {
      console.warn(
        `Could not route to "${sourceTrackName}" due to duplicate track names. ` +
          `Consider renaming tracks to have unique names.`,
      );
    }

    return sourceRouting;
  }

  // Simple case - use the single match (or undefined if no match)
  return matchingNames[0];
}

/**
 * Apply output routing configuration to the new track
 * @param newTrack - The new track LiveAPI object
 * @param sourceTrackName - The source track name
 * @param availableTypes - Available routing types
 * @param sourceTrack - The source track LiveAPI object
 */
function applyOutputRouting(
  newTrack: LiveAPI,
  sourceTrackName: string,
  availableTypes: RoutingType[] | null,
  sourceTrack: LiveAPI,
): void {
  const sourceRouting = findSourceRouting(
    sourceTrack,
    sourceTrackName,
    availableTypes,
  );

  if (sourceRouting) {
    newTrack.setProperty("output_routing_type", {
      identifier: sourceRouting.identifier,
    });
    // Let Live set the default channel for this routing type
  } else {
    const matchingNames =
      availableTypes?.filter((type) => type.display_name === sourceTrackName) ??
      [];

    if (matchingNames.length === 0) {
      console.warn(
        `Could not find track "${sourceTrackName}" in routing options`,
      );
    }
  }
}

/**
 * Configure routing to source track
 * @param newTrack - The new track LiveAPI object
 * @param sourceTrackIndex - Source track index
 */
export function configureRouting(
  newTrack: LiveAPI,
  sourceTrackIndex: number | undefined,
): void {
  const sourceTrack = LiveAPI.from(`live_set tracks ${sourceTrackIndex}`);
  const sourceTrackName = sourceTrack.getProperty("name") as string;

  configureSourceTrackInput(sourceTrack, sourceTrackName);

  const availableTypes = newTrack.getProperty(
    "available_output_routing_types",
  ) as RoutingType[] | null;

  applyOutputRouting(newTrack, sourceTrackName, availableTypes, sourceTrack);
}
