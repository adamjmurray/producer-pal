// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// One source's turn: the branch that makes its copies, and the count-based loop
// tracks and scenes take. Which destinations the source gets is settled before
// it starts — see source-plan.ts.

import { type LaneLedger } from "#src/tools/shared/arrangement/helpers/arrangement-lane-ledger.ts";
import { isDeadlineExceeded } from "#src/shared/max/v8-request-deadline.ts";
import { validateIdType } from "#src/tools/shared/validation/id-validation.ts";
import { errorMessage } from "#src/shared/error-message.ts";
import {
  skipEntry,
  type TargetSkip,
  unreachedDetail,
} from "#src/tools/shared/validation/lists/named-targets.ts";
import { pathEntries } from "#src/tools/shared/validation/helpers/object-paths.ts";
import { copyLedger } from "../clip/overwrites/copy-overwrites.ts";
import { duplicateClipWithPositions } from "../clip/duplicate-clip-with-positions.ts";
import { type ClipDestinations } from "../clip/clip-destinations.ts";
import { duplicateChainWithPaths } from "../device/duplicate-chain.ts";
import {
  type DeviceCopy,
  duplicateDeviceWithPaths,
  settleDevicePaths,
} from "../device/duplicate-device.ts";
import { copyPerDestination } from "../device/copy-per-destination.ts";
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
import { duplicateTrackCopies } from "./duplicate-track.ts";
import { type CopyEntry, settleCopyPaths } from "./copy-path-settling.ts";
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
  /** The call's arrangement lanes, shared by every copy it makes */
  ledger: LaneLedger;
}

/** Every source's turn, and what they share. */
export interface EverySourceArgs extends Omit<
  OneSourceArgs,
  "source" | "clipDestinations" | "ledger"
> {
  sources: SourceShare[];
  /** One destination set per source, or null for a type with no clip path. */
  clipDestinations: ClipDestinations[] | null;
}

/**
 * Makes every source's copies, in the order the call named them. Each source
 * takes its own share of the destinations and positions. A copy that would
 * land on a later source refuses the call first: it would wreck that source's
 * own turn.
 * @param args - The sources, and what they share
 * @returns Every copy, source by source
 */
export async function duplicateEverySource(
  args: EverySourceArgs,
): Promise<object[]> {
  const created: object[] = [];
  // Reads each arrangement lane once, so every copy can say what it overwrote.
  const ledger = copyLedger(args.context.lanes);

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
        ledger,
        clipDestinations: args.clipDestinations?.[index] ?? null,
        params: { ...args.params, arrangementStart: source.arrangementStart },
      })),
    );
  }

  // A later source's copies can push an earlier source's along. A scene's
  // arrangement copies are clips, which nothing here moves.
  if (args.type === "track") {
    settleCopyPaths(landedCopies(created), "track");
  } else if (args.type === "scene" && args.destination !== "arrangement") {
    settleCopyPaths(landedCopies(created), "scene");
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
  const { type, source, clipDestinations, labels, context, ledger } = args;
  const object = sourceObject(source, type);
  const id = source.id;

  if (clipDestinations != null) {
    return await duplicateClipWithPositions(
      clipDestinations,
      object,
      id,
      labels,
      args.params.arrangementStart,
      args.takeLane,
      args.takeLaneName,
      context,
      ledger,
    );
  }

  return await duplicateTrackOrSceneWithCount(
    type,
    args.destination,
    object,
    source,
    args.count,
    labels,
    args.params,
    context,
    ledger,
  );
}

/**
 * Copies a device or a drum pad — the two types whose destination is a slot in
 * a device chain rather than a spot on the timeline. A pad copy onto another
 * source pad refuses the call first.
 * @param type - "device" or "drum-pad"
 * @param sources - The shares to copy, in order
 * @param labels - The call's names and colors
 * @returns One entry per destination each source named, in source order
 */
export function duplicateChainSources(
  type: string,
  sources: SourceShare[],
  labels: CopyLabels,
): object[] {
  if (type === "drum-pad") {
    refusePadOverwrites(sources);
  }

  const entries = sources.flatMap((source) =>
    runOneChainSource(type, source, labels),
  );

  // A later copy, from this source or another, can push an earlier one along.
  if (type === "device") {
    settleDevicePaths(entries as Array<DeviceCopy | TargetSkip>);
  }

  return entries;
}

/**
 * The source's regular track index.
 * @param object - The source track
 * @returns Its index
 * @throws Error for a return or main track, which Live can't duplicate
 */
export function regularTrackIndex(object: LiveAPI): number {
  const trackIndex = object.trackIndex;

  if (trackIndex == null) {
    throw new Error(
      `${targetLabel(object)} is not a regular track, and Live only duplicates those`,
    );
  }

  return trackIndex;
}

// --- Helpers below main exports ---

/**
 * Run one source through the copier its type calls for.
 * @param type - Object type to duplicate
 * @param source - The source's turn
 * @param labels - The call's names and colors
 * @returns One entry per destination this source named
 */
function runOneChainSource(
  type: string,
  source: SourceShare,
  labels: CopyLabels,
): object[] {
  if (type === "drum-pad") {
    return duplicateDrumPadSource(source, labels);
  }

  const object = sourceObject(source, type);

  return type === "chain"
    ? duplicateChainWithPaths(object, source.toPath, source.named, labels)
    : duplicateDeviceWithPaths(object, source.toPath, source.named, labels);
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
 * @returns One entry per destination, in the order toPath named them
 */
function duplicateDrumPadSource(
  source: SourceShare,
  labels: CopyLabels,
): object[] {
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
 * @param source - The source's turn
 * @param count - Number of duplicates to create
 * @param labels - The call's names and colors
 * @param params - Additional parameters
 * @param context - Per-request context
 * @param ledger - The call's arrangement lanes, shared by every copy
 * @returns Array of result objects
 */
async function duplicateTrackOrSceneWithCount(
  type: string,
  destination: string | undefined,
  object: LiveAPI,
  source: SourceShare,
  count: number,
  labels: CopyLabels,
  params: DuplicateParams,
  context: Partial<ToolContext>,
  ledger: LaneLedger,
): Promise<object[]> {
  // Scene to arrangement: use position-based iteration (supports a position list)
  if (type === "scene" && destination === "arrangement") {
    return await duplicateSceneToArrangementAtPositions(
      object,
      source.id,
      count,
      labels,
      params,
      context,
      ledger,
    );
  }

  // Count-based iteration for tracks and session scenes
  const createdObjects: object[] = [];
  const { withoutClips, withoutDevices, routeToSource } = params;

  claimLabels(labels, count);

  if (type === "track") {
    return duplicateTrackCopies(
      regularTrackIndex(object),
      source.named,
      count,
      (i) => ({ name: labelName(labels, i), color: labelColor(labels, i) }),
      { withoutClips, withoutDevices, routeToSource },
      () => isDeadlineExceeded(context.deadline ?? null),
    );
  }

  let landed = 0;

  for (let i = 0; i < count; i++) {
    if (isDeadlineExceeded(context.deadline ?? null)) {
      // Each copy it never made keeps its slot.
      createdObjects.push(
        ...Array.from({ length: count - i }, () =>
          skipEntry(source.named, unreachedDetail("copy")),
        ),
      );

      break;
    }

    // Each copy is made from the last one that landed, so a failed one is
    // skipped over rather than copied from.
    try {
      createdObjects.push(
        duplicateSceneToSession(
          object,
          landed,
          labelName(labels, i),
          labelColor(labels, i),
          withoutClips,
        ),
      );
      landed++;
    } catch (error) {
      createdObjects.push(skipEntry(source.named, errorMessage(error)));
    }
  }

  return createdObjects;
}

/**
 * Duplicates a scene in the session view
 * @param object - The source scene
 * @param landed - Copies already made; the newest sits that far below the source
 * @param objectName - Name for the duplicated scene
 * @param objectColor - Color for the duplicated scene
 * @param withoutClips - Whether to exclude clips
 * @returns Metadata about the duplicated scene
 */
function duplicateSceneToSession(
  object: LiveAPI,
  landed: number,
  objectName: string | undefined,
  objectColor: string | undefined,
  withoutClips: boolean | undefined,
): object {
  // Only "track" and "scene" reach the count-based path, and tracks return
  // before the loop.
  const sceneIndex = object.sceneIndex;

  if (sceneIndex == null) {
    throw new Error(`no scene index for ${targetLabel(object)}`);
  }

  return duplicateScene(
    sceneIndex + landed,
    objectName,
    objectColor,
    withoutClips,
  );
}

/**
 * The entries of copies that landed.
 * @param entries - Every copy's entry
 * @returns Those that aren't skips
 */
function landedCopies(entries: object[]): CopyEntry[] {
  return entries.filter((entry) => !("ok" in entry)) as CopyEntry[];
}
