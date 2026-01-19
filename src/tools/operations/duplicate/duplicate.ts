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

interface DuplicateArgs {
  type: string;
  id: string;
  count?: number;
  destination?: string;
  arrangementStart?: string;
  arrangementLocatorId?: string;
  arrangementLocatorName?: string;
  arrangementLength?: string;
  name?: string;
  withoutClips?: boolean;
  withoutDevices?: boolean;
  routeToSource?: boolean;
  switchView?: boolean;
  toTrackIndex?: number;
  toSceneIndex?: string;
  toPath?: string;
}

interface DuplicateParams {
  arrangementStart?: string;
  arrangementLocatorId?: string;
  arrangementLocatorName?: string;
  arrangementLength?: string;
  withoutClips?: boolean;
  withoutDevices?: boolean;
  routeToSource?: boolean;
  toTrackIndex?: number | null;
  toSceneIndex?: string | null;
}

/**
 * Duplicates an object based on its type.
 * @param args - The parameters
 * @param context - Context object
 * @returns Result object(s)
 */
// eslint-disable-next-line jsdoc/require-param -- destructured params typed via DuplicateArgs interface
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
  }: DuplicateArgs,
  context: Partial<ToolContext> = {},
): object | object[] {
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
            toTrackIndex: null,
            toSceneIndex: null,
          },
          context,
        );

  // Handle view switching if requested
  switchViewIfRequested(switchView, destination, type);

  // Return single object or array based on results
  if (createdObjects.length === 1) {
    return createdObjects[0] as object;
  }

  return createdObjects;
}

/**
 * Generates a name for a duplicated object
 * @param baseName - Base name for the object
 * @param count - Total number of duplicates
 * @param index - Current duplicate index
 * @returns Generated name or undefined
 */
function generateObjectName(
  baseName: string | undefined,
  count: number,
  index: number,
): string | undefined {
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
 * @param type - Type of object (track or scene)
 * @param destination - Destination for duplication
 * @param object - Live API object to duplicate
 * @param id - ID of the object
 * @param count - Number of duplicates to create
 * @param name - Base name for duplicated objects
 * @param params - Additional parameters
 * @param context - Context object with holdingAreaStartBeats
 * @returns Array of result objects
 */
function duplicateTrackOrSceneWithCount(
  type: string,
  destination: string | undefined,
  object: LiveAPI,
  id: string,
  count: number,
  name: string | undefined,
  params: DuplicateParams,
  context: Partial<ToolContext>,
): object[] {
  const createdObjects: object[] = [];
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

    if (newObjectMetadata != null) {
      createdObjects.push(newObjectMetadata);
    }
  }

  return createdObjects;
}

/**
 * Determines the target view based on destination and type
 * @param destination - Destination for duplication
 * @param type - Type of object being duplicated
 * @returns Target view or null
 */
function determineTargetView(
  destination: string | undefined,
  type: string,
): "session" | "arrangement" | null {
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
 * @param switchView - Whether to switch view
 * @param destination - Destination for duplication
 * @param type - Type of object being duplicated
 */
function switchViewIfRequested(
  switchView: boolean | undefined,
  destination: string | undefined,
  type: string,
): void {
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
 * @param object - Live API object to duplicate
 * @param id - ID of the object
 * @param i - Current duplicate index
 * @param objectName - Name for the duplicated object
 * @param arrangementStart - Start time in bar|beat format
 * @param arrangementLocatorId - Locator ID for arrangement position
 * @param arrangementLocatorName - Locator name for arrangement position
 * @param arrangementLength - Duration in bar|beat format
 * @param withoutClips - Whether to exclude clips
 * @param context - Context object with holdingAreaStartBeats
 * @returns Metadata about the duplicated object
 */
function duplicateSceneToArrangementView(
  object: LiveAPI,
  id: string,
  i: number,
  objectName: string | undefined,
  arrangementStart: string | undefined,
  arrangementLocatorId: string | undefined,
  arrangementLocatorName: string | undefined,
  arrangementLength: string | undefined,
  withoutClips: boolean | undefined,
  context: Partial<ToolContext>,
): object {
  // All arrangement operations need song time signature for bar|beat conversion
  const liveSet = LiveAPI.from("live_set");
  const songTimeSigNumerator = liveSet.getProperty(
    "signature_numerator",
  ) as number;
  const songTimeSigDenominator = liveSet.getProperty(
    "signature_denominator",
  ) as number;

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
 * @param type - Type of object being duplicated (track or scene)
 * @param object - Live API object to duplicate
 * @param id - ID of the object
 * @param i - Current duplicate index
 * @param objectName - Name for the duplicated object
 * @param withoutClips - Whether to exclude clips
 * @param withoutDevices - Whether to exclude devices
 * @param routeToSource - Whether to route to source track
 * @returns Metadata about the duplicated object
 */
function duplicateTrackOrSceneToSession(
  type: string,
  object: LiveAPI,
  id: string,
  i: number,
  objectName: string | undefined,
  withoutClips: boolean | undefined,
  withoutDevices: boolean | undefined,
  routeToSource: boolean | undefined,
): object | undefined {
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
 * @param type - Type of object being duplicated (track or scene)
 * @param destination - Destination for duplication
 * @param object - Live API object to duplicate
 * @param id - ID of the object
 * @param i - Current duplicate index
 * @param objectName - Name for the duplicated object
 * @param params - Additional parameters for duplication
 * @param context - Context object with holdingAreaStartBeats
 * @returns Metadata about the duplicated object
 */
function performDuplication(
  type: string,
  destination: string | undefined,
  object: LiveAPI,
  id: string,
  i: number,
  objectName: string | undefined,
  params: DuplicateParams,
  context: Partial<ToolContext>,
): object | undefined {
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
