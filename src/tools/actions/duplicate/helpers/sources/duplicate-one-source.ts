// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// One source's turn: the branch that makes its copies, and the count-based loop
// tracks and scenes take. Which destinations the source gets is settled before
// it starts — see source-plan.ts.

import { stopForDeadline } from "#src/tools/clip/helpers/loop-deadline.ts";
import { validateIdType } from "#src/tools/shared/validation/id-validation.ts";
import { pathEntries } from "#src/tools/shared/validation/helpers/object-paths.ts";
import { duplicateClipWithPositions } from "../clip/duplicate-clip-with-positions.ts";
import { type ClipDestinations } from "../clip/clip-destinations.ts";
import { duplicateChainWithPaths } from "../device/duplicate-chain.ts";
import { duplicateDeviceWithPaths } from "../device/duplicate-device.ts";
import {
  copyPerDestination,
  warnCountIgnored,
} from "../device/copy-per-destination.ts";
import {
  duplicateDrumPad,
  resolveSourcePad,
} from "../device/duplicate-drum-pad.ts";
import {
  claimLabels,
  labelColor,
  labelName,
  type CopyLabels,
} from "./copy-labels.ts";
import { duplicateSceneToArrangementAtPositions } from "./scene-arrangement-positions.ts";
import { type SourceShare } from "./source-plan.ts";
import {
  refuseClipOverwrites,
  refusePadOverwrites,
} from "./source-overwrites.ts";
import { duplicateTrack } from "./duplicate-track.ts";
import { duplicateScene } from "./duplicate-scene.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";

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

/** Every source's turn, and what they share. */
export interface EverySourceArgs extends Omit<
  OneSourceArgs,
  "source" | "clipDestinations"
> {
  sources: SourceShare[];
  /** One destination set per source, or null for a type with no clip path. */
  clipDestinations: ClipDestinations[] | null;
}

/**
 * Makes every source's copies, in the order the call named them. Each source
 * takes its own share of the destinations and positions. A copy that would
 * land on another source refuses the call first: it would wreck that source's
 * own turn.
 * @param args - The sources, and what they share
 * @returns Every copy, source by source
 */
export async function duplicateEverySource(
  args: EverySourceArgs,
): Promise<object[]> {
  const created: object[] = [];

  if (args.clipDestinations != null) {
    refuseClipOverwrites(args.sources, args.clipDestinations, {
      arrangementLength: args.params.arrangementLength,
      takeLane: args.takeLane,
    });
  }

  for (const [index, source] of args.sources.entries()) {
    created.push(
      ...(await duplicateOneSource({
        ...args,
        source,
        clipDestinations: args.clipDestinations?.[index] ?? null,
        params: { ...args.params, arrangementStart: source.arrangementStart },
      })),
    );
  }

  return created;
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
 * a device chain rather than a spot on the timeline. A pad copy onto another
 * source pad refuses the call first.
 * @param type - "device" or "drum-pad"
 * @param sources - The shares to copy, in order
 * @param labels - The call's names and colors
 * @param count - The raw count param, which neither type uses
 * @returns One entry per destination each source named, in source order
 */
export function duplicateChainSources(
  type: string,
  sources: SourceShare[],
  labels: CopyLabels,
  count: number,
): object[] {
  if (type === "drum-pad") {
    refusePadOverwrites(sources);
  }

  return sources.flatMap((source, i) =>
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
 * @returns One entry per destination this source named
 */
function runOneChainSource(
  type: string,
  source: SourceShare,
  labels: CopyLabels,
  count: number,
): object[] {
  if (type === "drum-pad") {
    return duplicateDrumPadSource(source, labels, count);
  }

  const object = sourceObject(source, type);

  return type === "chain"
    ? duplicateChainWithPaths(
        object,
        source.toPath,
        source.named,
        labels,
        count,
      )
    : duplicateDeviceWithPaths(
        object,
        source.toPath,
        source.named,
        labels,
        count,
      );
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
 * Copies one source drum pad to the pads its share of toPath names, one entry
 * per pad.
 *
 * The source pad is read inside each destination's turn, so a source that can't
 * be copied at all is reported on every destination's entry rather than costing
 * the caller their slots.
 * @param source - The source's turn
 * @param labels - The call's names and colors
 * @param count - Number of copies (warns if > 1)
 * @returns One entry per destination, in the order toPath named them
 */
function duplicateDrumPadSource(
  source: SourceShare,
  labels: CopyLabels,
  count: number,
): object[] {
  warnCountIgnored(count, "drum pad");

  const paths = pathEntries(source.toPath, "toPath");

  // Unlike a device, a pad has no natural "next" slot to default to — the next
  // MIDI note is as likely to be occupied as empty — so the caller must say.
  if (paths.length === 0) {
    throw new Error("toPath is required for drum pads");
  }

  claimLabels(labels, paths.length);

  return copyPerDestination(paths, source.named, (destination, i) =>
    duplicateDrumPad(
      resolveSourcePad(sourceObject(source, "drum-pad")),
      // Never undefined: an empty toPath was refused above.
      destination as string,
      labelName(labels, i),
    ),
  );
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
        `${targetLabel(object)} is not a regular track, and Live only duplicates those`,
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
    throw new Error(`no scene index for ${targetLabel(object)}`);
  }

  const actualSceneIndex = sceneIndex + i;

  return duplicateScene(
    actualSceneIndex,
    objectName,
    objectColor,
    withoutClips,
  );
}
