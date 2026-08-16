// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/max/v8-max-console.ts";
import { stopForDeadline } from "#src/tools/clip/helpers/loop-deadline.ts";
import { resolveTakeLaneForDuplicate } from "#src/tools/shared/arrangement/take-lane-helpers.ts";
import {
  getColorForIndex,
  parseCommaSeparatedColors,
} from "#src/tools/shared/validation/color-utils.ts";
import { destinationPathEntries } from "#src/tools/shared/validation/destination-path.ts";
import { validateIdType } from "#src/tools/shared/validation/id-validation.ts";
import {
  getNameForIndex,
  parseCommaSeparatedNames,
  warnExtraNames,
} from "#src/tools/shared/validation/name-utils.ts";
import { duplicateClipWithPositions } from "./helpers/clip/duplicate-clip-position-helpers.ts";
import {
  resolveClipDestinations,
  warnInapplicableClipParams,
  warnUnusedDestination,
} from "./helpers/clip/duplicate-destination-helpers.ts";
import { duplicateDevice } from "./helpers/duplicate-device-helpers.ts";
import { focusIfRequested } from "./helpers/duplicate-focus-helpers.ts";
import { duplicateSceneToArrangementAtPositions } from "./helpers/duplicate-position-helpers.ts";
import {
  duplicateTrack,
  duplicateScene,
} from "./helpers/duplicate-track-scene-helpers.ts";
import { applyTransformsToDuplicatedClips } from "./helpers/clip/duplicate-transform-helpers.ts";
import {
  hasArrangementPosition,
  inferDestination,
  validateBasicInputs,
  validateAndConfigureRouteToSource,
  validateDestinationParameter,
  validateArrangementParameters,
} from "./helpers/duplicate-validation-helpers.ts";

interface DuplicateArgs {
  type: string;
  id: string;
  count?: number;

  arrangementStart?: string;
  locator?: string;
  arrangementLength?: string;
  name?: string;
  color?: string;
  withoutClips?: boolean;
  withoutDevices?: boolean;
  routeToSource?: boolean;
  focus?: boolean;
  toSlot?: string;
  toPath?: string;
  transforms?: string;
  code?: string;
  takeLane?: number | string;
  takeLaneName?: string;
}

interface DuplicateParams {
  arrangementStart?: string;
  locator?: string;
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
 * @param args.locator - Arrangement locator ID(s) or name(s)
 * @param args.arrangementLength - Arrangement length
 * @param args.name - Name for duplicates
 * @param args.color - Color for duplicates (cycles if comma-separated)
 * @param args.withoutClips - Exclude clips
 * @param args.withoutDevices - Exclude devices
 * @param args.routeToSource - Route to source
 * @param args.focus - Focus duplicated clip/scene
 * @param args.toSlot - Deprecated destination clip slot(s); use toPath
 * @param args.toPath - Destination path(s): track, session slot, or device
 * @param args.transforms - Transform expressions broadcast across all copies
 * @param args.code - JavaScript function body broadcast across all copies
 * @param args.takeLane - Arrangement take lane target for clips (0/omitted = main, 1+, "new")
 * @param args.takeLaneName - Name for a take lane newly created by this call
 * @param context - Context object
 * @returns Result object(s)
 */
export async function duplicate(
  {
    type,
    id,
    count = 1,
    arrangementStart,
    locator,
    arrangementLength,
    name,
    color,
    withoutClips,
    withoutDevices,
    routeToSource,
    focus,
    toSlot,
    toPath,
    transforms,
    code,
    takeLane,
    takeLaneName,
  }: DuplicateArgs,
  context: Partial<ToolContext> = {},
): Promise<object | object[]> {
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

  // Resolve a clip's destination up front, so a bad path fails before anything
  // is created. Other types have no destination path.
  const clipDestinations =
    type === "clip"
      ? resolveClipDestinations(
          toPath,
          toSlot,
          hasArrangementPosition(arrangementStart, locator),
        )
      : null;

  warnUnusedDestination(type, toPath, toSlot);

  if (clipDestinations != null) {
    warnInapplicableClipParams(clipDestinations, count, arrangementLength);
  }

  const destination =
    clipDestinations?.destination ??
    inferDestination(type, arrangementStart, locator);

  // Validate destination parameter compatibility with type
  validateDestinationParameter(type, destination);

  // Validate arrangement parameters
  validateArrangementParameters(destination, arrangementStart, locator);

  // transforms/code only apply to clips
  if (type !== "clip" && (transforms != null || code != null)) {
    console.warn(
      `transforms/code ignored: only supported when duplicating clips (type "${type}")`,
    );
  }

  // takeLane only applies to arrangement-destination clips; the helper warns
  // and returns null for non-clip types and session-destination clips so a
  // malformed value doesn't throw before the warn-and-ignore path.
  const takeLaneTarget = resolveTakeLaneForDuplicate(
    type,
    destination,
    takeLane,
    console.warn,
  );

  // Handle device duplication (supports comma-separated toPath for multiple destinations)
  if (type === "device") {
    return duplicateDeviceWithPaths(object, toPath, name, count);
  }

  // For clips, use position-based iteration; for tracks/scenes, use count-based
  const createdObjects = await (clipDestinations != null
    ? duplicateClipWithPositions(
        clipDestinations,
        object,
        id,
        name,
        color,
        arrangementStart,
        locator,
        arrangementLength,
        takeLaneTarget,
        takeLaneName,
        context,
      )
    : duplicateTrackOrSceneWithCount(
        type,
        destination,
        object,
        id,
        count,
        name,
        color,
        {
          arrangementStart,
          locator,
          arrangementLength,
          withoutClips,
          withoutDevices,
          routeToSource,
        },
        context,
      ));

  // Apply transforms/code to the duplicated clips (per-clip via update-clip DSL)
  if (type === "clip" && (transforms != null || code != null)) {
    await applyTransformsToDuplicatedClips(
      createdObjects,
      transforms,
      code,
      context,
    );
  }

  // Handle view switching if requested
  focusIfRequested(focus, destination, type, createdObjects);

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
  // Reads a blank toPath as omitted the way clips do, and refuses one that
  // names nothing rather than quietly falling back to the default destination.
  const paths = destinationPathEntries(toPath);

  if (paths.length <= 1) {
    return duplicateDevice(object, paths[0], name, count);
  }

  const parsedNames = parseCommaSeparatedNames(name, paths.length);

  warnExtraNames(parsedNames, paths.length, "duplicate");

  return paths.map((path, i) =>
    duplicateDevice(object, path, getNameForIndex(name, i, parsedNames), 1),
  );
}

/**
 * Duplicates a track or scene using count-based or position-based iteration
 * @param type - Type of object (track or scene)
 * @param destination - Destination for duplication
 * @param object - Live API object to duplicate
 * @param id - ID of the object
 * @param count - Number of duplicates to create
 * @param name - Base name for duplicated objects
 * @param color - Color for duplicated objects (cycles if comma-separated)
 * @param params - Additional parameters
 * @param context - Context object with holdingAreaStartBeats
 * @returns Array of result objects
 */
async function duplicateTrackOrSceneWithCount(
  type: string,
  destination: string | undefined,
  object: LiveAPI,
  id: string,
  count: number,
  name: string | undefined,
  color: string | undefined,
  params: DuplicateParams,
  context: Partial<ToolContext>,
): Promise<object[]> {
  // Scene to arrangement: use position-based iteration (supports multi-value locators)
  if (type === "scene" && destination === "arrangement") {
    return await duplicateSceneToArrangementAtPositions(
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
  const parsedNames = parseCommaSeparatedNames(name, count);
  const parsedColors = parseCommaSeparatedColors(color, count);

  warnExtraNames(parsedNames, count, "duplicate");

  for (let i = 0; i < count; i++) {
    if (
      stopForDeadline(
        context.deadline,
        () =>
          `Ran out of time after duplicating ${createdObjects.length} of ${count} ${type}s. ` +
          `Re-run for the rest.`,
      )
    ) {
      break;
    }

    const result = duplicateTrackOrSceneToSession(
      type,
      object,
      id,
      i,
      getNameForIndex(name, i, parsedNames),
      getColorForIndex(color, i, parsedColors),
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
 * Duplicates a track or scene to the session view
 * @param type - Type of object being duplicated (track or scene)
 * @param object - Live API object to duplicate
 * @param id - ID of the object
 * @param i - Current duplicate index
 * @param objectName - Name for the duplicated object
 * @param objectColor - Color for the duplicated object
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
  objectColor: string | undefined,
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
      objectColor,
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

    return duplicateScene(
      actualSceneIndex,
      objectName,
      objectColor,
      withoutClips,
    );
  }

  return undefined;
}
