// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { validateIdType } from "#src/tools/shared/validation/id-validation.ts";
import { duplicateClipWithPositions } from "./helpers/duplicate-clip-position-helpers.ts";
import { duplicateDevice } from "./helpers/duplicate-device-helpers.ts";
import {
  generateObjectName,
  switchViewIfRequested,
} from "./helpers/duplicate-misc-helpers.ts";
import {
  duplicateTrack,
  duplicateScene,
  calculateSceneLength,
  duplicateSceneToArrangement,
} from "./helpers/duplicate-track-scene-helpers.ts";
import {
  resolveArrangementPosition,
  validateBasicInputs,
  validateAndConfigureRouteToSource,
  validateClipParameters,
  validateDestinationParameter,
  validateArrangementParameters,
} from "./helpers/duplicate-validation-helpers.ts";

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
 * @param args.type - Object type to duplicate
 * @param args.id - Object ID
 * @param args.count - Number of duplicates
 * @param args.destination - Destination type
 * @param args.arrangementStart - Arrangement start position
 * @param args.arrangementLocatorId - Locator ID
 * @param args.arrangementLocatorName - Locator name
 * @param args.arrangementLength - Arrangement length
 * @param args.name - Name for duplicates
 * @param args.withoutClips - Exclude clips
 * @param args.withoutDevices - Exclude devices
 * @param args.routeToSource - Route to source
 * @param args.switchView - Switch view
 * @param args.toTrackIndex - Destination track index
 * @param args.toSceneIndex - Destination scene index
 * @param args.toPath - Destination path
 * @param context - Context object
 * @returns Result object(s)
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
  const liveSet = LiveAPI.from(livePath.liveSet);
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
