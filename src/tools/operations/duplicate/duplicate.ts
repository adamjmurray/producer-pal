// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { parseCommaSeparatedIds } from "#src/tools/shared/utils.ts";
import { validateIdType } from "#src/tools/shared/validation/id-validation.ts";
import { duplicateClipWithPositions } from "./helpers/duplicate-clip-position-helpers.ts";
import { duplicateDevice } from "./helpers/duplicate-device-helpers.ts";
import { switchViewIfRequested } from "./helpers/duplicate-misc-helpers.ts";
import {
  duplicateTrack,
  duplicateScene,
  calculateSceneLength,
  duplicateSceneToArrangement,
} from "./helpers/duplicate-track-scene-helpers.ts";
import {
  resolveArrangementPositions,
  inferDestination,
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

  arrangementStart?: string;
  locatorId?: string;
  locatorName?: string;
  arrangementLength?: string;
  name?: string;
  withoutClips?: boolean;
  withoutDevices?: boolean;
  routeToSource?: boolean;
  switchView?: boolean;
  toSlot?: string;
  toPath?: string;
}

interface DuplicateParams {
  arrangementStart?: string;
  locatorId?: string;
  locatorName?: string;
  arrangementLength?: string;
  withoutClips?: boolean;
  withoutDevices?: boolean;
  routeToSource?: boolean;
}

/**
 * Duplicates an object based on its type.
 * @param args - The parameters
 * @param args.type - Object type to duplicate
 * @param args.id - Object ID
 * @param args.count - Number of duplicates
 * @param args.arrangementStart - Arrangement start position
 * @param args.locatorId - Arrangement locator ID(s)
 * @param args.locatorName - Arrangement locator name(s)
 * @param args.arrangementLength - Arrangement length
 * @param args.name - Name for duplicates
 * @param args.withoutClips - Exclude clips
 * @param args.withoutDevices - Exclude devices
 * @param args.routeToSource - Route to source
 * @param args.switchView - Switch view
 * @param args.toSlot - Destination clip slot(s)
 * @param args.toPath - Destination path
 * @param context - Context object
 * @returns Result object(s)
 */
export function duplicate(
  {
    type,
    id,
    count = 1,
    arrangementStart,
    locatorId,
    locatorName,
    arrangementLength,
    name,
    withoutClips,
    withoutDevices,
    routeToSource,
    switchView,
    toSlot,
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

  // Infer destination from position parameters
  const destination = inferDestination(
    type,
    arrangementStart,
    locatorId,
    locatorName,
    toSlot,
  );

  // Validate clip-specific parameters
  validateClipParameters(type, destination, toSlot);

  // Validate destination parameter compatibility with type
  validateDestinationParameter(type, destination);

  // Validate arrangement parameters
  validateArrangementParameters(
    destination,
    arrangementStart,
    locatorId,
    locatorName,
  );

  // Handle device duplication (supports comma-separated toPath for multiple destinations)
  if (type === "device") {
    return duplicateDeviceWithPaths(object, toPath, name, count);
  }

  // For clips, use position-based iteration; for tracks/scenes, use count-based
  const createdObjects =
    type === "clip"
      ? duplicateClipWithPositions(
          destination,
          object,
          id,
          name,
          toSlot,
          arrangementStart,
          locatorId,
          locatorName,
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
            locatorId,
            locatorName,
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
    return createdObjects[0] as object;
  }

  return createdObjects;
}

/**
 * Duplicates a device to one or more destination paths.
 * Supports comma-separated toPath for multiple destinations.
 * @param object - LiveAPI device object
 * @param toPath - Destination path(s), comma-separated for multiple
 * @param name - Optional name for duplicated device(s)
 * @param count - Number of copies (warns if > 1)
 * @returns Result object or array of result objects
 */
function duplicateDeviceWithPaths(
  object: LiveAPI,
  toPath: string | undefined,
  name: string | undefined,
  count: number,
): object | object[] {
  const paths = parseCommaSeparatedIds(toPath);

  if (paths.length <= 1) {
    return duplicateDevice(object, toPath, name, count);
  }

  return paths.map((path) => duplicateDevice(object, path, name, 1));
}

/**
 * Duplicates a track or scene using count-based or position-based iteration
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
  // Scene to arrangement: use position-based iteration (supports multi-value locators)
  if (type === "scene" && destination === "arrangement") {
    return duplicateSceneToArrangementAtPositions(
      object,
      id,
      count,
      name,
      params,
      context,
    );
  }

  // Count-based iteration for tracks and session scenes
  const createdObjects: object[] = [];
  const { withoutClips, withoutDevices, routeToSource } = params;

  for (let i = 0; i < count; i++) {
    const result = duplicateTrackOrSceneToSession(
      type,
      object,
      id,
      i,
      name,
      withoutClips,
      withoutDevices,
      routeToSource,
    );

    if (result != null) {
      createdObjects.push(result);
    }
  }

  return createdObjects;
}

/**
 * Duplicates a scene to the arrangement at one or more positions.
 * Supports multiple positions from comma-separated locator IDs/names.
 * When a single position is given with count > 1, places copies sequentially.
 * @param object - Live API scene object
 * @param id - Scene ID
 * @param count - Number of copies (for sequential placement from a single position)
 * @param name - Base name for duplicated objects
 * @param params - Arrangement parameters (arrangementStart, locatorId, locatorName, etc.)
 * @param context - Context object
 * @returns Array of result objects
 */
function duplicateSceneToArrangementAtPositions(
  object: LiveAPI,
  id: string,
  count: number,
  name: string | undefined,
  params: DuplicateParams,
  context: Partial<ToolContext>,
): object[] {
  const { arrangementStart, locatorId, locatorName, arrangementLength } =
    params;
  const withoutClips = params.withoutClips;

  const liveSet = LiveAPI.from(livePath.liveSet);
  const songTimeSigNumerator = liveSet.getProperty(
    "signature_numerator",
  ) as number;
  const songTimeSigDenominator = liveSet.getProperty(
    "signature_denominator",
  ) as number;

  // Resolve all positions from bar|beat or locator(s)
  const positions = resolveArrangementPositions(
    liveSet,
    arrangementStart,
    locatorId,
    locatorName,
    songTimeSigNumerator,
    songTimeSigDenominator,
  );

  const sceneIndex = object.sceneIndex;

  if (sceneIndex == null) {
    throw new Error(
      `duplicate failed: no scene index for id "${id}" (path="${object.path}")`,
    );
  }

  // When single position + count > 1, expand to sequential positions
  const sceneLength = calculateSceneLength(sceneIndex);
  const allPositions =
    positions.length === 1 && count > 1
      ? Array.from(
          { length: count },
          // bounded by count, index always valid
          (_, i) => (positions[0] as number) + i * sceneLength,
        )
      : positions;

  const createdObjects: object[] = [];

  for (let i = 0; i < allPositions.length; i++) {
    const result = duplicateSceneToArrangement(
      id,
      allPositions[i] as number, // bounded by loop
      name,
      withoutClips,
      arrangementLength,
      songTimeSigNumerator,
      songTimeSigDenominator,
      context,
    );

    createdObjects.push(result);
  }

  return createdObjects;
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
    const trackIndex = object.trackIndex;

    if (trackIndex == null) {
      throw new Error(
        `duplicate failed: no track index for id "${id}" (path="${object.path}")`,
      );
    }

    const actualTrackIndex = trackIndex + i;

    return duplicateTrack(
      actualTrackIndex,
      objectName,
      withoutClips,
      withoutDevices,
      routeToSource,
      trackIndex,
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
