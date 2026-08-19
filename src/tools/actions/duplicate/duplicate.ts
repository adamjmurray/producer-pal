// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/max/v8-max-console.ts";
import { stopForDeadline } from "#src/tools/clip/helpers/loop-deadline.ts";
import {
  getColorForIndex,
  parseCommaSeparatedColors,
} from "#src/tools/shared/validation/color-utils.ts";
import { pathEntries } from "#src/tools/shared/validation/object-path-helpers.ts";
import { validateIdType } from "#src/tools/shared/validation/id-validation.ts";
import {
  getNameForIndex,
  parseCommaSeparatedNames,
  warnExtraNames,
} from "#src/tools/shared/validation/name-utils.ts";
import { duplicateClipWithPositions } from "./helpers/clip/duplicate-clip-position-helpers.ts";
import { resolveClipDestinations } from "./helpers/clip/duplicate-destination-helpers.ts";
import { duplicateDeviceWithPaths } from "./helpers/duplicate-device-helpers.ts";
import {
  duplicateDrumPad,
  resolveSourcePad,
  type PadTarget,
} from "./helpers/duplicate-drum-pad-helpers.ts";
import { focusIfRequested } from "./helpers/duplicate-focus-helpers.ts";
import { duplicateSceneToArrangementAtPositions } from "./helpers/duplicate-position-helpers.ts";
import {
  duplicateTrack,
  duplicateScene,
} from "./helpers/duplicate-track-scene-helpers.ts";
import { applyTransformsToDuplicatedClips } from "./helpers/clip/duplicate-transform-helpers.ts";
import {
  hasArrangementPosition,
  resolveDestinationAndWarn,
  validateBasicInputs,
  validateAndConfigureRouteToSource,
} from "./helpers/duplicate-validation-helpers.ts";

interface DuplicateArgs {
  type: string;
  id?: string;
  path?: string;
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
 * @param args.path - Source drum pad path, instead of id
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
    path,
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
  validateBasicInputs(type, id, count, path);

  // Auto-configure for routing back to source
  const routeToSourceConfig = validateAndConfigureRouteToSource(
    type,
    routeToSource,
    withoutClips,
    withoutDevices,
  );

  withoutClips = routeToSourceConfig.withoutClips;
  withoutDevices = routeToSourceConfig.withoutDevices;

  // Validate the ID exists and matches the expected type. Only a drum-pad call
  // naming its source by path gets here without one.
  const object = id ? validateIdType(id, type, "duplicate") : null;

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

  const destination = resolveDestinationAndWarn({
    type,
    clipDestinations,
    count,
    toPath,
    toSlot,
    arrangementStart,
    locator,
    arrangementLength,
    takeLane,
    transforms,
    code,
  });

  // Both of these take comma-separated toPath for multiple destinations
  if (type === "drum-pad") {
    const sourcePad = resolveSourcePad(object, path);

    return sourcePad == null
      ? []
      : duplicateDrumPadToPaths(sourcePad, toPath, name, count);
  }

  if (type === "device") {
    return duplicateDeviceWithPaths(object as LiveAPI, toPath, name, count);
  }

  // For clips, use position-based iteration; for tracks/scenes, use count-based
  const createdObjects = await (clipDestinations != null
    ? duplicateClipWithPositions(
        clipDestinations,
        object as LiveAPI,
        id as string,
        name,
        color,
        arrangementStart,
        locator,
        arrangementLength,
        takeLane,
        takeLaneName,
        context,
      )
    : duplicateTrackOrSceneWithCount(
        type,
        destination,
        object as LiveAPI,
        id as string,
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
 * Copies a drum pad to one or more destination pads.
 * Supports comma-separated toPath for multiple destinations.
 * @param source - The pad to copy from
 * @param toPath - Destination pad path(s), comma-separated for multiple
 * @param name - Optional name(s) for the chain(s) each copy creates
 * @param count - Number of copies (warns if > 1)
 * @returns Result object, or an array of them for multiple destinations
 */
function duplicateDrumPadToPaths(
  source: PadTarget,
  toPath: string | undefined,
  name: string | undefined,
  count: number,
): object | object[] {
  if (count > 1) {
    console.warn(
      `count ${count} ignored: a drum pad copy goes to the pads toPath names`,
    );
  }

  const paths = pathEntries(toPath, "toPath");

  // Unlike a device, a pad has no natural "next" slot to default to — the next
  // MIDI note is as likely to be occupied as empty — so the caller must say.
  if (paths.length === 0) {
    throw new Error("duplicate failed: toPath is required for drum pads");
  }

  const parsedNames = parseCommaSeparatedNames(name, paths.length);

  warnExtraNames(parsedNames, paths.length, "duplicate");

  const results = paths
    .map((destination, i) =>
      duplicateDrumPad(
        source,
        destination,
        getNameForIndex(name, i, parsedNames),
      ),
    )
    .filter((result) => result != null);

  // Collapse on what was asked for, not on what survived: one object back from
  // a two-destination call would read as a one-destination call that worked.
  if (paths.length > 1) {
    return results;
  }

  // A lone copy that was skipped has nothing to report but its warning.
  return results[0] ?? results;
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

    createdObjects.push(
      duplicateTrackOrSceneToSession(
        type,
        object,
        id,
        i,
        getNameForIndex(name, i, parsedNames),
        getColorForIndex(color, i, parsedColors),
        withoutClips,
        withoutDevices,
        routeToSource,
      ),
    );
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
): object {
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
  }

  // Only "track" and "scene" get here: clip, device and drum-pad all return
  // from duplicate() before the count-based path.
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
