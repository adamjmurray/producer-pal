// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// One source's turn: the branch that makes its copies, and the count-based loop
// tracks and scenes take. Which destinations the source gets is settled before
// it starts — see duplicate-source-helpers.ts.

import * as console from "#src/shared/max/v8-max-console.ts";
import { stopForDeadline } from "#src/tools/clip/helpers/loop-deadline.ts";
import { validateIdType } from "#src/tools/shared/validation/id-validation.ts";
import { pathEntries } from "#src/tools/shared/validation/helpers/object-path-helpers.ts";
import { duplicateClipWithPositions } from "../clip/duplicate-clip-position-helpers.ts";
import { type ClipDestinations } from "../clip/duplicate-destination-helpers.ts";
import { duplicateChainWithPaths } from "../device/duplicate-chain-helpers.ts";
import { duplicateDeviceWithPaths } from "../device/duplicate-device-helpers.ts";
import {
  duplicateDrumPad,
  resolveSourcePad,
  type PadTarget,
} from "../device/duplicate-drum-pad-helpers.ts";
import {
  claimLabels,
  labelColor,
  labelName,
  type CopyLabels,
} from "./duplicate-label-helpers.ts";
import { duplicateSceneToArrangementAtPositions } from "./duplicate-position-helpers.ts";
import {
  collectSources,
  type SourceShare,
} from "./duplicate-source-helpers.ts";
import {
  duplicateTrack,
  duplicateScene,
} from "../duplicate-track-scene-helpers.ts";

/** The params a track or scene copy reads beyond its name and color. */
export interface DuplicateParams {
  arrangementStart?: string;
  arrangementLength?: string;
  withoutClips?: boolean;
  withoutDevices?: boolean;
  routeToSource?: boolean;
}

/** Everything one source's turn needs beyond the shared params. */
export interface OneSourceArgs {
  type: string;
  source: SourceShare;
  destination: string | undefined;
  clipDestinations: ClipDestinations | null;
  count: number;
  labels: CopyLabels;
  params: DuplicateParams;
  takeLane: number | string | undefined;
  takeLaneName: string | undefined;
  context: Partial<ToolContext>;
}

/**
 * Makes one source's copies. Clips iterate by position, tracks and scenes by
 * count.
 * @param args - The source's turn
 * @returns Its copies, in the order the destinations were asked for
 */
export async function duplicateOneSource(
  args: OneSourceArgs,
): Promise<object[]> {
  const { type, source, clipDestinations, labels, context } = args;
  const object = sourceObject(source, type);
  const id = source.id;

  if (clipDestinations != null) {
    return await duplicateClipWithPositions(
      clipDestinations,
      object,
      id,
      labels,
      args.params.arrangementStart,
      args.params.arrangementLength,
      args.takeLane,
      args.takeLaneName,
      context,
    );
  }

  return await duplicateTrackOrSceneWithCount(
    type,
    args.destination,
    object,
    id,
    args.count,
    labels,
    args.params,
    context,
  );
}

/**
 * Copies a device or a drum pad — the two types whose destination is a slot in
 * a device chain rather than a spot on the timeline.
 * @param type - "device" or "drum-pad"
 * @param sources - The shares to copy, in order
 * @param labels - The call's names and colors
 * @param count - The raw count param, which neither type uses
 * @returns Result object, or an array of them for multiple destinations
 */
export function duplicateChainSources(
  type: string,
  sources: SourceShare[],
  labels: CopyLabels,
  count: number,
): object | object[] {
  return collectSources(sources, (source, i) =>
    // `count` doesn't apply to either type, and the warning that says so
    // belongs to the call rather than to every source in it.
    runOneChainSource(type, source, labels, i === 0 ? count : 1),
  );
}

// --- Helpers below main exports ---

/**
 * Run one source through the copier its type calls for.
 * @param type - Object type to duplicate
 * @param source - The source's turn
 * @param labels - The call's names and colors
 * @param count - Number of copies (warns if > 1)
 * @returns The copy or copies made for this source
 */
function runOneChainSource(
  type: string,
  source: SourceShare,
  labels: CopyLabels,
  count: number,
): object | object[] {
  if (type === "drum-pad") {
    return duplicateDrumPadSource(source, labels, count);
  }

  const object = sourceObject(source, type);

  return type === "chain"
    ? duplicateChainWithPaths(object, source.toPath, labels, count)
    : duplicateDeviceWithPaths(object, source.toPath, labels, count);
}

/**
 * Reads a source fresh at the start of its turn. A copy made for an earlier
 * source shifts the track and scene indices this one is read from, so the
 * object can't be resolved once for the whole call.
 * @param source - The source's turn
 * @param type - Object type to duplicate
 * @returns The object to copy
 */
function sourceObject(source: SourceShare, type: string): LiveAPI {
  return validateIdType(source.id, type);
}

/**
 * Copies one source drum pad to the pads its share of toPath names.
 * @param source - The source's turn
 * @param labels - The call's names and colors
 * @param count - Number of copies (warns if > 1)
 * @returns Result object, or an array of them for multiple destinations
 */
function duplicateDrumPadSource(
  source: SourceShare,
  labels: CopyLabels,
  count: number,
): object | object[] {
  const sourcePad = resolveSourcePad(sourceObject(source, "drum-pad"));

  return sourcePad == null
    ? []
    : duplicateDrumPadToPaths(sourcePad, source.toPath, labels, count);
}

/**
 * Copies a drum pad to one or more destination pads.
 * Supports comma-separated toPath for multiple destinations.
 * @param source - The pad to copy from
 * @param toPath - Destination pad path(s), comma-separated for multiple
 * @param labels - The call's names and colors
 * @param count - Number of copies (warns if > 1)
 * @returns Result object, or an array of them for multiple destinations
 */
function duplicateDrumPadToPaths(
  source: PadTarget,
  toPath: string | undefined,
  labels: CopyLabels,
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
    throw new Error("toPath is required for drum pads");
  }

  claimLabels(labels, paths.length);

  const results = paths
    .map((destination, i) =>
      duplicateDrumPad(source, destination, labelName(labels, i)),
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
 * @param labels - The call's names and colors
 * @param params - Additional parameters
 * @param context - Per-request context
 * @returns Array of result objects
 */
async function duplicateTrackOrSceneWithCount(
  type: string,
  destination: string | undefined,
  object: LiveAPI,
  id: string,
  count: number,
  labels: CopyLabels,
  params: DuplicateParams,
  context: Partial<ToolContext>,
): Promise<object[]> {
  // Scene to arrangement: use position-based iteration (supports a position list)
  if (type === "scene" && destination === "arrangement") {
    return await duplicateSceneToArrangementAtPositions(
      object,
      id,
      count,
      labels,
      params,
      context,
    );
  }

  // Count-based iteration for tracks and session scenes
  const createdObjects: object[] = [];
  const { withoutClips, withoutDevices, routeToSource } = params;

  claimLabels(labels, count);

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
        labelName(labels, i),
        labelColor(labels, i),
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
      throw new Error(`no track index for id "${id}" (path="${object.path}")`);
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
    throw new Error(`no scene index for id "${id}" (path="${object.path}")`);
  }

  const actualSceneIndex = sceneIndex + i;

  return duplicateScene(
    actualSceneIndex,
    objectName,
    objectColor,
    withoutClips,
  );
}
