import * as console from "#src/shared/v8-max-console.js";

/**
 * Validates basic input parameters for duplication
 * @param {string} type - Type of object to duplicate
 * @param {string} id - ID of the object to duplicate
 * @param {number} count - Number of duplicates to create
 */
export function validateBasicInputs(type, id, count) {
  if (!type) {
    throw new Error("duplicate failed: type is required");
  }

  const validTypes = ["track", "scene", "clip"];

  if (!validTypes.includes(type)) {
    throw new Error(
      `duplicate failed: type must be one of ${validTypes.join(", ")}`,
    );
  }

  if (!id) {
    throw new Error("duplicate failed: id is required");
  }

  if (count < 1) {
    throw new Error("duplicate failed: count must be at least 1");
  }
}

/**
 * Validates and configures route to source parameters
 * @param {string} type - Type of object being duplicated
 * @param {boolean} routeToSource - Whether to route to source track
 * @param {boolean} withoutClips - Whether to exclude clips
 * @param {boolean} withoutDevices - Whether to exclude devices
 * @returns {object} Configured withoutClips and withoutDevices values
 */
export function validateAndConfigureRouteToSource(
  type,
  routeToSource,
  withoutClips,
  withoutDevices,
) {
  if (!routeToSource) {
    return { withoutClips, withoutDevices };
  }

  if (type !== "track") {
    throw new Error(
      "duplicate failed: routeToSource is only supported for type 'track'",
    );
  }

  // Emit warnings if user provided conflicting parameters
  if (withoutClips === false) {
    console.error(
      "Warning: routeToSource requires withoutClips=true, ignoring user-provided withoutClips=false",
    );
  }

  if (withoutDevices === false) {
    console.error(
      "Warning: routeToSource requires withoutDevices=true, ignoring user-provided withoutDevices=false",
    );
  }

  return { withoutClips: true, withoutDevices: true };
}

/**
 * Validates clip-specific parameters
 * @param {string} type - Type of object being duplicated
 * @param {string} destination - Destination for clip duplication
 * @param {number} toTrackIndex - Destination track index
 * @param {string} toSceneIndex - Destination scene index(es), comma-separated
 */
export function validateClipParameters(
  type,
  destination,
  toTrackIndex,
  toSceneIndex,
) {
  if (type !== "clip") {
    return;
  }

  if (!destination) {
    throw new Error(
      "duplicate failed: destination is required for type 'clip'",
    );
  }

  if (!["session", "arrangement"].includes(destination)) {
    throw new Error(
      "duplicate failed: destination must be 'session' or 'arrangement'",
    );
  }

  // Validate session clip destination parameters
  if (destination === "session") {
    if (toTrackIndex == null) {
      throw new Error(
        "duplicate failed: toTrackIndex is required for session clips",
      );
    }

    if (toSceneIndex == null || toSceneIndex.trim() === "") {
      throw new Error(
        "duplicate failed: toSceneIndex is required for session clips",
      );
    }
  }
}

/**
 * Validates destination parameter compatibility with object type
 * @param {string} type - Type of object being duplicated
 * @param {string} destination - Destination for duplication
 */
export function validateDestinationParameter(type, destination) {
  if (destination == null) {
    return; // destination is optional for tracks and scenes
  }

  if (type === "track" && destination === "arrangement") {
    throw new Error(
      "duplicate failed: tracks cannot be duplicated to arrangement (use destination='session' or omit destination parameter)",
    );
  }
}

/**
 * Validates arrangement-specific parameters
 * @param {string} destination - Destination for duplication
 * @param {string} arrangementStart - Start time in bar|beat format
 * @param {string} arrangementLocatorId - Locator ID for arrangement position
 * @param {string} arrangementLocatorName - Locator name for arrangement position
 */
export function validateArrangementParameters(
  destination,
  arrangementStart,
  arrangementLocatorId,
  arrangementLocatorName,
) {
  if (destination !== "arrangement") {
    return;
  }

  const hasStart = arrangementStart != null && arrangementStart.trim() !== "";
  const hasLocatorId = arrangementLocatorId != null;
  const hasLocatorName = arrangementLocatorName != null;
  const positionCount = [hasStart, hasLocatorId, hasLocatorName].filter(
    Boolean,
  ).length;

  if (positionCount === 0) {
    throw new Error(
      "duplicate failed: arrangementStart, arrangementLocatorId, or arrangementLocatorName is required when destination is 'arrangement'",
    );
  }

  if (positionCount > 1) {
    throw new Error(
      "duplicate failed: arrangementStart, arrangementLocatorId, and arrangementLocatorName are mutually exclusive",
    );
  }
}
