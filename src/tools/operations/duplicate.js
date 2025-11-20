import { barBeatToAbletonBeats } from "../../notation/barbeat/barbeat-time.js";
import { select } from "../control/select.js";
import { validateIdType } from "../shared/validation/id-validation.js";
import {
  duplicateClipSlot,
  duplicateClipToArrangement,
} from "./duplicate-helpers.js";
import {
  duplicateTrack,
  duplicateScene,
  calculateSceneLength,
  duplicateSceneToArrangement,
} from "./duplicate-track-scene-helpers.js";

/**
 * Duplicates an object based on its type.
 * Note: Duplicated Arrangement clips will only play if their tracks are currently following the Arrangement timeline.
 * @param {object} args - The parameters
 * @param {string} args.type - Type of object to duplicate ("track", "scene", or "clip")
 * @param {string} args.id - ID of the object to duplicate
 * @param {number} [args.count=1] - Number of duplicates to create
 * @param {string} [args.destination] - Destination for clip duplication ("session" or "arrangement"), required when type is "clip"
 * @param {string} [args.arrangementStart] - Start time in bar|beat format for Arrangement view clips (uses song time signature)
 * @param {string} [args.arrangementLength] - Duration in bar:beat format (e.g., '4:0' = exactly 4 bars)
 * @param {string} [args.name] - Optional name for the duplicated object(s)
 * @param {boolean} [args.withoutClips] - Whether to exclude clips when duplicating tracks or scenes
 * @param {boolean} [args.withoutDevices] - Whether to exclude devices when duplicating tracks
 * @param {boolean} [args.routeToSource] - Whether to enable MIDI layering by routing the new track to the source track
 * @param {boolean} [args.switchView=false] - Automatically switch to the appropriate view based on destination or operation type
 * @param {number} [args.toTrackIndex] - Destination track index (required for session clips)
 * @param {number} [args.toSceneIndex] - Destination scene index (required for session clips)
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

  // Validate arrangement parameters
  validateArrangementParameters(destination, arrangementStart);

  const createdObjects = [];

  for (let i = 0; i < count; i++) {
    // Build the object name for this duplicate
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
        arrangementLength,
        withoutClips,
        withoutDevices,
        routeToSource,
        toTrackIndex,
        toSceneIndex,
      },
      context,
    );

    createdObjects.push(newObjectMetadata);
  }

  // Handle view switching if requested
  switchViewIfRequested(switchView, destination, type);

  // Return appropriate format based on count
  if (count === 1) {
    return createdObjects[0];
  }
  return createdObjects;
}

/**
 * Validates basic input parameters for duplication
 * @param {string} type - Type of object to duplicate
 * @param {string} id - ID of the object to duplicate
 * @param {number} count - Number of duplicates to create
 */
function validateBasicInputs(type, id, count) {
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
function validateAndConfigureRouteToSource(
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
 * @param {number} toSceneIndex - Destination scene index
 */
function validateClipParameters(type, destination, toTrackIndex, toSceneIndex) {
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
    if (toSceneIndex == null) {
      throw new Error(
        "duplicate failed: toSceneIndex is required for session clips",
      );
    }
  }
}

/**
 * Validates arrangement-specific parameters
 * @param {string} destination - Destination for duplication
 * @param {string} arrangementStart - Start time in bar|beat format
 */
function validateArrangementParameters(destination, arrangementStart) {
  if (destination === "arrangement" && arrangementStart == null) {
    throw new Error(
      "duplicate failed: arrangementStart is required when destination is 'arrangement'",
    );
  }
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
 * Duplicates an object to the arrangement view
 * @param {string} type - Type of object being duplicated
 * @param {object} object - Live API object to duplicate
 * @param {string} id - ID of the object
 * @param {number} i - Current duplicate index
 * @param {string} objectName - Name for the duplicated object
 * @param {string} arrangementStart - Start time in bar|beat format
 * @param {string} arrangementLength - Duration in bar|beat format
 * @param {boolean} withoutClips - Whether to exclude clips
 * @param {object} context - Context object with holdingAreaStartBeats
 * @returns {object} Metadata about the duplicated object
 */
function duplicateToArrangement(
  type,
  object,
  id,
  i,
  objectName,
  arrangementStart,
  arrangementLength,
  withoutClips,
  context,
) {
  // All arrangement operations need song time signature for bar|beat conversion
  const liveSet = new LiveAPI("live_set");
  const songTimeSigNumerator = liveSet.getProperty("signature_numerator");
  const songTimeSigDenominator = liveSet.getProperty("signature_denominator");

  // Convert arrangementStart from bar|beat to Ableton beats once
  const baseArrangementStartBeats = barBeatToAbletonBeats(
    arrangementStart,
    songTimeSigNumerator,
    songTimeSigDenominator,
  );

  if (type === "scene") {
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
  } else if (type === "clip") {
    // For multiple clips, place them sequentially to avoid overlap
    const clipLength = object.getProperty("length");
    const actualArrangementStartBeats =
      baseArrangementStartBeats + i * clipLength;
    return duplicateClipToArrangement(
      id,
      actualArrangementStartBeats,
      objectName,
      arrangementLength,
      songTimeSigNumerator,
      songTimeSigDenominator,
      context,
    );
  }
}

/**
 * Duplicates an object to the session view
 * @param {string} type - Type of object being duplicated
 * @param {object} object - Live API object to duplicate
 * @param {string} id - ID of the object
 * @param {number} i - Current duplicate index
 * @param {string} objectName - Name for the duplicated object
 * @param {boolean} withoutClips - Whether to exclude clips
 * @param {boolean} withoutDevices - Whether to exclude devices
 * @param {boolean} routeToSource - Whether to route to source track
 * @param {number} toTrackIndex - Destination track index
 * @param {number} toSceneIndex - Destination scene index
 * @returns {object} Metadata about the duplicated object
 */
function duplicateToSession(
  type,
  object,
  id,
  i,
  objectName,
  withoutClips,
  withoutDevices,
  routeToSource,
  toTrackIndex,
  toSceneIndex,
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
  } else if (type === "clip") {
    const trackIndex = object.trackIndex;
    const sceneIndex = object.sceneIndex;
    if (trackIndex == null || sceneIndex == null) {
      // We already validated object was a clip, so if we're here, this must be an arrangement
      // clip
      throw new Error(
        `unsupported duplicate operation: cannot duplicate arrangement clips to the session (source clip id="${id}" path="${object.path}") `,
      );
    }

    // For session clips with count > 1, place them sequentially at the destination track
    const actualToSceneIndex = toSceneIndex + i;
    return duplicateClipSlot(
      trackIndex,
      sceneIndex,
      toTrackIndex,
      actualToSceneIndex,
      objectName,
    );
  }
}

/**
 * Performs the duplication operation
 * @param {string} type - Type of object being duplicated
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
    arrangementLength,
    withoutClips,
    withoutDevices,
    routeToSource,
    toTrackIndex,
    toSceneIndex,
  } = params;

  if (destination === "arrangement") {
    return duplicateToArrangement(
      type,
      object,
      id,
      i,
      objectName,
      arrangementStart,
      arrangementLength,
      withoutClips,
      context,
    );
  }
  return duplicateToSession(
    type,
    object,
    id,
    i,
    objectName,
    withoutClips,
    withoutDevices,
    routeToSource,
    toTrackIndex,
    toSceneIndex,
  );
}
