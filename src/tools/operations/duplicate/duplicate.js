import { select } from "#src/tools/control/select.js";
import { validateIdType } from "#src/tools/shared/validation/id-validation.js";
import { duplicateClipWithPositions } from "./helpers/duplicate-clip-position-helpers.js";
import { duplicateDevice } from "./helpers/duplicate-device-helpers.js";
import {
  duplicateTrack,
  duplicateScene,
  calculateSceneLength,
  duplicateSceneToArrangement,
} from "./helpers/duplicate-track-scene-helpers.js";
import {
  resolveArrangementPosition,
  validateBasicInputs,
  validateAndConfigureRouteToSource,
  validateClipParameters,
  validateDestinationParameter,
  validateArrangementParameters,
} from "./helpers/duplicate-validation-helpers.js";

/**
 * @typedef {object} DuplicateArgs
 * @property {string} type - Type of object to duplicate ("track", "scene", "clip", or "device")
 * @property {string} id - ID of the object to duplicate
 * @property {number} [count] - Number of duplicates to create (default 1)
 * @property {string} [destination] - Destination for clip duplication ("session" or "arrangement")
 * @property {string} [arrangementStart] - Start time in bar|beat format
 * @property {string} [arrangementLocatorId] - Locator ID for arrangement position
 * @property {string} [arrangementLocatorName] - Locator name for arrangement position
 * @property {string} [arrangementLength] - Duration in bar:beat format
 * @property {string} [name] - Optional name for the duplicated object(s)
 * @property {boolean} [withoutClips] - Whether to exclude clips
 * @property {boolean} [withoutDevices] - Whether to exclude devices
 * @property {boolean} [routeToSource] - Whether to enable MIDI layering
 * @property {boolean} [switchView] - Automatically switch view
 * @property {number} [toTrackIndex] - Destination track index (for session clips)
 * @property {string} [toSceneIndex] - Destination scene index(es)
 * @property {string} [toPath] - Destination path for device duplication
 */

/**
 * Duplicates an object based on its type.
 * @param {DuplicateArgs} args - The parameters
 * @param {Partial<ToolContext>} [context] - Context object
 * @returns {object | Array<object>} Result object(s)
 */
export function duplicate(
  {
    type,
    id,
    count = 1,
    destination,
    arrangementStart,
    arrangementLocatorId,
    arrangementLocatorName,
    arrangementLength,
    name,
    withoutClips,
    withoutDevices,
    routeToSource,
    switchView,
    toTrackIndex,
    toSceneIndex,
    toPath,
  },
  context = {},
) {
  // Validate basic inputs
  validateBasicInputs(type, id, count);

  // Auto-configure for routing back to source
  const routeToSourceConfig = validateAndConfigureRouteToSource(
    type,
    routeToSource,
    withoutClips,
    withoutDevices,
  );

  withoutClips = routeToSourceConfig.withoutClips;
  withoutDevices = routeToSourceConfig.withoutDevices;

  // Validate the ID exists and matches the expected type
  const object = validateIdType(id, type, "duplicate");

  // Validate clip-specific parameters
  validateClipParameters(type, destination, toTrackIndex, toSceneIndex);

  // Validate destination parameter compatibility with type
  validateDestinationParameter(type, destination);

  // Validate arrangement parameters
  validateArrangementParameters(
    destination,
    arrangementStart,
    arrangementLocatorId,
    arrangementLocatorName,
  );

  // Handle device duplication separately (single copy only)
  if (type === "device") {
    return duplicateDevice(object, toPath, name, count);
  }

  // For clips, use position-based iteration; for tracks/scenes, use count-based
  const createdObjects =
    type === "clip"
      ? duplicateClipWithPositions(
          destination,
          object,
          id,
          name,
          toTrackIndex,
          toSceneIndex,
          arrangementStart,
          arrangementLocatorId,
          arrangementLocatorName,
          arrangementLength,
          context,
        )
      : duplicateTrackOrSceneWithCount(
          type,
          destination,
          object,
          id,
          count,
          name,
          {
            arrangementStart,
            arrangementLocatorId,
            arrangementLocatorName,
            arrangementLength,
            withoutClips,
            withoutDevices,
            routeToSource,
          },
          context,
        );

  // Handle view switching if requested
  switchViewIfRequested(switchView, destination, type);

  // Return single object or array based on results
  if (createdObjects.length === 1) {
    return createdObjects[0];
  }

  return createdObjects;
}

/**
 * Generates a name for a duplicated object
 * @param {string | undefined} baseName - Base name for the object
 * @param {number} count - Total number of duplicates
 * @param {number} index - Current duplicate index
 * @returns {string | undefined} Generated name or undefined
 */
function generateObjectName(baseName, count, index) {
  if (baseName == null) {
    return;
  }

  if (count === 1) {
    return baseName;
  }

  if (index === 0) {
    return baseName;
  }

  return `${baseName} ${index + 1}`;
}

/**
 * Duplicates a track or scene using count-based iteration
 * @param {string} type - Type of object (track or scene)
 * @param {string | undefined} destination - Destination for duplication
 * @param {object} object - Live API object to duplicate
 * @param {string} id - ID of the object
 * @param {number} count - Number of duplicates to create
 * @param {string | undefined} name - Base name for duplicated objects
 * @param {object} params - Additional parameters
 * @param {object} context - Context object with holdingAreaStartBeats
 * @returns {Array<object>} Array of result objects
 */
function duplicateTrackOrSceneWithCount(
  type,
  destination,
  object,
  id,
  count,
  name,
  params,
  context,
) {
  const createdObjects = [];
  const {
    arrangementStart,
    arrangementLocatorId,
    arrangementLocatorName,
    arrangementLength,
    withoutClips,
    withoutDevices,
    routeToSource,
  } = params;

  for (let i = 0; i < count; i++) {
    const objectName = generateObjectName(name, count, i);

    const newObjectMetadata = performDuplication(
      type,
      destination,
      object,
      id,
      i,
      objectName,
      {
        arrangementStart,
        arrangementLocatorId,
        arrangementLocatorName,
        arrangementLength,
        withoutClips,
        withoutDevices,
        routeToSource,
        toTrackIndex: null,
        toSceneIndex: null,
      },
      context,
    );

    createdObjects.push(newObjectMetadata);
  }

  return createdObjects;
}

/**
 * Determines the target view based on destination and type
 * @param {string | undefined} destination - Destination for duplication
 * @param {string} type - Type of object being duplicated
 * @returns {string | null} Target view or null
 */
function determineTargetView(destination, type) {
  if (destination === "arrangement") {
    return "arrangement";
  }

  if (destination === "session" || type === "track" || type === "scene") {
    return "session";
  }

  return null;
}

/**
 * Switches to the appropriate view if requested
 * @param {boolean | undefined} switchView - Whether to switch view
 * @param {string | undefined} destination - Destination for duplication
 * @param {string} type - Type of object being duplicated
 */
function switchViewIfRequested(switchView, destination, type) {
  if (!switchView) {
    return;
  }

  const targetView = determineTargetView(destination, type);

  if (targetView) {
    select({ view: targetView });
  }
}

/**
 * Duplicates a scene to the arrangement view
 * @param {object} object - Live API object to duplicate
 * @param {string} id - ID of the object
 * @param {number} i - Current duplicate index
 * @param {string | undefined} objectName - Name for the duplicated object
 * @param {string | undefined} arrangementStart - Start time in bar|beat format
 * @param {string | undefined} arrangementLocatorId - Locator ID for arrangement position
 * @param {string | undefined} arrangementLocatorName - Locator name for arrangement position
 * @param {string | undefined} arrangementLength - Duration in bar|beat format
 * @param {boolean | undefined} withoutClips - Whether to exclude clips
 * @param {object} context - Context object with holdingAreaStartBeats
 * @returns {object} Metadata about the duplicated object
 */
function duplicateSceneToArrangementView(
  object,
  id,
  i,
  objectName,
  arrangementStart,
  arrangementLocatorId,
  arrangementLocatorName,
  arrangementLength,
  withoutClips,
  context,
) {
  // All arrangement operations need song time signature for bar|beat conversion
  const liveSet = LiveAPI.from("live_set");
  const songTimeSigNumerator = /** @type {number} */ (
    liveSet.getProperty("signature_numerator")
  );
  const songTimeSigDenominator = /** @type {number} */ (
    liveSet.getProperty("signature_denominator")
  );

  // Resolve arrangement start position from bar|beat or locator
  const baseArrangementStartBeats = resolveArrangementPosition(
    liveSet,
    arrangementStart,
    arrangementLocatorId,
    arrangementLocatorName,
    songTimeSigNumerator,
    songTimeSigDenominator,
  );

  const sceneIndex = object.sceneIndex;

  if (sceneIndex == null) {
    throw new Error(
      `duplicate failed: no scene index for id "${id}" (path="${object.path}")`,
    );
  }

  // For multiple scenes, place them sequentially to avoid overlap
  const sceneLength = calculateSceneLength(sceneIndex);
  const actualArrangementStartBeats =
    baseArrangementStartBeats + i * sceneLength;

  return duplicateSceneToArrangement(
    id,
    actualArrangementStartBeats,
    objectName,
    withoutClips,
    arrangementLength,
    songTimeSigNumerator,
    songTimeSigDenominator,
    context,
  );
}

/**
 * Duplicates a track or scene to the session view
 * @param {string} type - Type of object being duplicated (track or scene)
 * @param {object} object - Live API object to duplicate
 * @param {string} id - ID of the object
 * @param {number} i - Current duplicate index
 * @param {string | undefined} objectName - Name for the duplicated object
 * @param {boolean | undefined} withoutClips - Whether to exclude clips
 * @param {boolean | undefined} withoutDevices - Whether to exclude devices
 * @param {boolean | undefined} routeToSource - Whether to route to source track
 * @returns {object | undefined} Metadata about the duplicated object
 */
function duplicateTrackOrSceneToSession(
  type,
  object,
  id,
  i,
  objectName,
  withoutClips,
  withoutDevices,
  routeToSource,
) {
  if (type === "track") {
    // Session view operations (no bar|beat conversion needed)
    const trackIndex = object.trackIndex;

    if (trackIndex == null) {
      throw new Error(
        `duplicate failed: no track index for id "${id}" (path="${object.path}")`,
      );
    }

    // For multiple tracks, we need to account for previously created tracks
    const actualTrackIndex = trackIndex + i;

    return duplicateTrack(
      actualTrackIndex,
      objectName,
      withoutClips,
      withoutDevices,
      routeToSource,
      trackIndex, // Pass original source track index for routing
    );
  } else if (type === "scene") {
    const sceneIndex = object.sceneIndex;

    if (sceneIndex == null) {
      throw new Error(
        `duplicate failed: no scene index for id "${id}" (path="${object.path}")`,
      );
    }

    const actualSceneIndex = sceneIndex + i;

    return duplicateScene(actualSceneIndex, objectName, withoutClips);
  }
}

/**
 * Performs the duplication operation for tracks or scenes
 * @param {string} type - Type of object being duplicated (track or scene)
 * @param {string | undefined} destination - Destination for duplication
 * @param {object} object - Live API object to duplicate
 * @param {string} id - ID of the object
 * @param {number} i - Current duplicate index
 * @param {string | undefined} objectName - Name for the duplicated object
 * @param {object} params - Additional parameters for duplication
 * @param {object} context - Context object with holdingAreaStartBeats
 * @returns {object | undefined} Metadata about the duplicated object
 */
function performDuplication(
  type,
  destination,
  object,
  id,
  i,
  objectName,
  params,
  context,
) {
  const {
    arrangementStart,
    arrangementLocatorId,
    arrangementLocatorName,
    arrangementLength,
    withoutClips,
    withoutDevices,
    routeToSource,
  } = params;

  if (destination === "arrangement") {
    return duplicateSceneToArrangementView(
      object,
      id,
      i,
      objectName,
      arrangementStart,
      arrangementLocatorId,
      arrangementLocatorName,
      arrangementLength,
      withoutClips,
      context,
    );
  }

  return duplicateTrackOrSceneToSession(
    type,
    object,
    id,
    i,
    objectName,
    withoutClips,
    withoutDevices,
    routeToSource,
  );
}
