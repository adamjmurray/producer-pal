import { barBeatToAbletonBeats } from "#src/notation/barbeat/time/barbeat-time.js";
import { select } from "#src/tools/control/select.js";
import { resolveLocatorToBeats } from "#src/tools/shared/locator/locator-helpers.js";
import { validateIdType } from "#src/tools/shared/validation/id-validation.js";
import { duplicateClipWithPositions } from "./helpers/duplicate-clip-position-helpers.js";
import {
  duplicateTrack,
  duplicateScene,
  calculateSceneLength,
  duplicateSceneToArrangement,
} from "./helpers/duplicate-track-scene-helpers.js";
import {
  validateBasicInputs,
  validateAndConfigureRouteToSource,
  validateClipParameters,
  validateDestinationParameter,
  validateArrangementParameters,
} from "./helpers/duplicate-validation-helpers.js";

/**
 * Resolves arrangement position from bar|beat or locator
 * @param {LiveAPI} liveSet - The live_set LiveAPI object
 * @param {string} arrangementStart - Bar|beat position
 * @param {string} arrangementLocatorId - Locator ID for position
 * @param {string} arrangementLocatorName - Locator name for position
 * @param {number} timeSigNumerator - Time signature numerator
 * @param {number} timeSigDenominator - Time signature denominator
 * @returns {number} Position in beats
 */
function resolveArrangementPosition(
  liveSet,
  arrangementStart,
  arrangementLocatorId,
  arrangementLocatorName,
  timeSigNumerator,
  timeSigDenominator,
) {
  if (arrangementLocatorId != null || arrangementLocatorName != null) {
    return resolveLocatorToBeats(
      liveSet,
      { locatorId: arrangementLocatorId, locatorName: arrangementLocatorName },
      "duplicate",
    );
  }

  return barBeatToAbletonBeats(
    arrangementStart,
    timeSigNumerator,
    timeSigDenominator,
  );
}

/**
 * Duplicates an object based on its type.
 * Note: Duplicated Arrangement clips will only play if their tracks are currently following the Arrangement timeline.
 * @param {object} args - The parameters
 * @param {string} args.type - Type of object to duplicate ("track", "scene", or "clip")
 * @param {string} args.id - ID of the object to duplicate
 * @param {number} [args.count=1] - Number of duplicates to create
 * @param {string} [args.destination] - Destination for clip duplication ("session" or "arrangement"), required when type is "clip"
 * @param {string} [args.arrangementStart] - Start time in bar|beat format for Arrangement view clips (uses song time signature)
 * @param {string} [args.arrangementLocatorId] - Locator ID for arrangement position (e.g., 'locator-0')
 * @param {string} [args.arrangementLocatorName] - Locator name for arrangement position
 * @param {string} [args.arrangementLength] - Duration in bar:beat format (e.g., '4:0' = exactly 4 bars)
 * @param {string} [args.name] - Optional name for the duplicated object(s)
 * @param {boolean} [args.withoutClips] - Whether to exclude clips when duplicating tracks or scenes
 * @param {boolean} [args.withoutDevices] - Whether to exclude devices when duplicating tracks
 * @param {boolean} [args.routeToSource] - Whether to enable MIDI layering by routing the new track to the source track
 * @param {boolean} [args.switchView=false] - Automatically switch to the appropriate view based on destination or operation type
 * @param {number} [args.toTrackIndex] - Destination track index (required for session clips)
 * @param {string} [args.toSceneIndex] - Destination scene index(es), comma-separated (required for session clips)
 * @param {object} [context] - Context object with holdingAreaStartBeats and silenceWavPath
 * @returns {object | Array<object>} Result object(s) with information about the duplicated object(s)
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
  } = {},
  context = {
    holdingAreaStartBeats: 40000,
  },
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
 * @param {string} baseName - Base name for the object
 * @param {number} count - Total number of duplicates
 * @param {number} index - Current duplicate index
 * @returns {string | undefined} Generated name or undefined
 */
function generateObjectName(baseName, count, index) {
  if (baseName == null) {
    return undefined;
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
 * @param {string} destination - Destination for duplication
 * @param {object} object - Live API object to duplicate
 * @param {string} id - ID of the object
 * @param {number} count - Number of duplicates to create
 * @param {string} name - Base name for duplicated objects
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
 * @param {string} destination - Destination for duplication
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
 * @param {boolean} switchView - Whether to switch view
 * @param {string} destination - Destination for duplication
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
 * @param {string} objectName - Name for the duplicated object
 * @param {string} arrangementStart - Start time in bar|beat format
 * @param {string} arrangementLocatorId - Locator ID for arrangement position
 * @param {string} arrangementLocatorName - Locator name for arrangement position
 * @param {string} arrangementLength - Duration in bar|beat format
 * @param {boolean} withoutClips - Whether to exclude clips
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
  const liveSet = new LiveAPI("live_set");
  const songTimeSigNumerator = liveSet.getProperty("signature_numerator");
  const songTimeSigDenominator = liveSet.getProperty("signature_denominator");

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
 * @param {string} objectName - Name for the duplicated object
 * @param {boolean} withoutClips - Whether to exclude clips
 * @param {boolean} withoutDevices - Whether to exclude devices
 * @param {boolean} routeToSource - Whether to route to source track
 * @returns {object} Metadata about the duplicated object
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
 * @param {string} destination - Destination for duplication
 * @param {object} object - Live API object to duplicate
 * @param {string} id - ID of the object
 * @param {number} i - Current duplicate index
 * @param {string} objectName - Name for the duplicated object
 * @param {object} params - Additional parameters for duplication
 * @param {object} context - Context object with holdingAreaStartBeats
 * @returns {object} Metadata about the duplicated object
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
