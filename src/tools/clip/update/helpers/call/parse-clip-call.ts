// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { idOrPathRequired } from "#src/tools/shared/validation/id-validation.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  type EnvelopeLine,
  parseEnvelopeLines,
} from "#src/tools/clip/envelopes/envelope-lines.ts";
import { readSplitPoints } from "#src/tools/shared/arrangement/arrangement-splitting-params.ts";
import {
  ARRANGEMENT_SPLIT_MODE,
  LEGACY_SPLIT_MODE,
  type SplitMode,
} from "#src/tools/shared/arrangement/arrangement-splitting.ts";
import { resolveLocatorPositions } from "#src/tools/shared/locator/song-position.ts";
import { refuseDoubledSpelling } from "#src/tools/shared/validation/doubled-spelling.ts";
import {
  type PairedLabels,
  pairLabels,
} from "#src/tools/shared/validation/lists/labeled-targets.ts";
import { refuseNoWrite } from "#src/tools/shared/validation/lists/refuse-no-write.ts";
import { validateListLengths } from "#src/tools/shared/validation/lists/list-lengths.ts";
import {
  type NamedTarget,
  namedTargets,
} from "#src/tools/shared/validation/lists/named-targets.ts";
import {
  type TargetParams,
  foldTargetParams,
  targetCount,
  targetParamLabel,
} from "#src/tools/shared/validation/lists/target-lists.ts";
import {
  type ArrangementBeats,
  parseArrangementParams,
} from "../arrangement/update-clip-arrangement-params.ts";
import { type ClipValueArgs, clipValuesAt } from "../batch/clip-value-lists.ts";
import {
  type MoveDestinations,
  moveDestinationParam,
  resolveMoveDestinations,
} from "../move/move-destinations.ts";
import {
  laneWithPositionPerClip,
  refuseConvertWithMove,
  refuseConvertWithSplit,
  refuseSplitWithMove,
  refuseRegionWithDuplicateLoop,
  refuseUnreadableCall,
} from "../update-clip-refusals.ts";
import { type ClipUpdateArgs } from "./clip-update-args.ts";

/** Where a split cuts, and how its positions are read. */
export interface SplitRequest {
  points: number[];
  mode: SplitMode;
}

/** An update-clip call, read once and refused if it was written wrong. */
export interface ClipCall {
  args: ClipUpdateArgs;
  /** The target params as sent, for a blank one to be reported */
  sent: TargetParams;
  /** The targets, ids first, each as the caller wrote it */
  named: NamedTarget[];
  /** The name and color lists, paired with the targets named */
  labels: PairedLabels;
  /** The other per-target strings for the target at an index */
  valuesAt: (index: number) => ClipValueArgs;
  /** The `envelopes` param, already read into lines and checked */
  envelopeLines?: EnvelopeLine[];
  /** The split the call asks for, if it asks for one */
  split: SplitRequest | null;
  /** Where each target moves, from toPath or toSlot */
  moves: MoveDestinations;
  startBeats: ArrangementBeats;
  lengthBeats: ArrangementBeats;
  destinationParam: "toPath" | "toSlot";
  /** The param that named the clips' start: a toPath `[...]` or arrangementStart */
  startParam: "toPath" | "arrangementStart";
}

/**
 * Read an update-clip call, refusing one that was written wrong before any clip
 * is touched.
 *
 * Every list is checked together, before any of them is split: once one is
 * split nothing knows whether the others are lists at all. `id` and `path` name
 * different clips and add up, so the target count is their sum — comparing the
 * two to each other would refuse a call naming two of each.
 * @param args - The update-clip args
 * @returns The call
 * @throws Error when the call names no clip, asks nothing of the clips it
 *   names, or its params can't go together
 */
export function parseClipCall(args: ClipUpdateArgs): ClipCall {
  const { id, ids, path, paths } = args;
  // Folded once, so a param that names nothing warns once.
  const folded = foldTargetParams({ id, ids, path, paths });

  validateListLengths(listArgs(folded, args));

  const named = namedTargets(folded);

  if (named.length === 0) {
    throw new Error(idOrPathRequired());
  }

  refuseNoWrite(args, "clips");
  refuseUnreadableCall(args, named.length);
  refuseRegionWithDuplicateLoop(args.start, args.length, args.duplicateLoop);

  // Every envelope line is read before the first clip is touched: a batch of
  // them half written can't be cleaned up.
  const envelopeLines =
    args.envelopes == null ? undefined : parseEnvelopeLines(args.envelopes);
  // Paired with the targets named, not the clips found, so name[k] lands on
  // target k and every piece of a split takes its target's name. Done before
  // anything is cut: a bad color or a gap in the names must be refused first.
  const labels = pairLabels({
    noun: "clip",
    count: named.length,
    name: args.name,
    color: args.color,
  });
  const valuesAt = clipValuesAt(args, named.length);
  const { toPath, toSlot, arrangementLength } = args;

  // Before the first Live read, so a call there is no reading of changes
  // nothing.
  refuseSplitWithMove({
    arrangementSplit: args.arrangementSplit,
    split: args.split,
    toPath,
    toSlot,
    arrangementStart: args.arrangementStart,
    arrangementLength,
  });

  refuseConvertWithSplit(args.convert, args.arrangementSplit, args.split);
  refuseConvertWithMove(args);

  // Rewrite every `loc:` position as the bar|beat it names, once, before
  // anything reads them. `start`, `firstStart` and `split` are clip-relative
  // and stay out of it.
  const songPositions = resolveSongLocators(
    args.arrangementStart,
    args.arrangementSplit,
  );
  // A split can't be undone, so every whole-call value it or the later note
  // writes depend on is read before any clip is touched.
  const split = readSplitRequest(songPositions.arrangementSplit, args.split);
  // Paired against what the caller named, not against the clips that resolve:
  // an id that names nothing has to take its position with it, or every later
  // clip slides onto the wrong bar.
  const moves = resolveMoveDestinations(
    toPath,
    toSlot,
    named.length,
    laneWithPositionPerClip(toPath, args.arrangementStart),
  );
  const { startBeats, lengthBeats } = parseArrangementParams(
    songPositions.arrangementStart,
    arrangementLength,
    named.length,
    moves.positions,
  );

  return {
    args,
    sent: { id, ids, path, paths },
    named,
    labels,
    valuesAt,
    envelopeLines,
    split,
    moves,
    startBeats,
    lengthBeats,
    destinationParam: moveDestinationParam(toPath, toSlot),
    // The two can't both be set: a coordinate beside arrangementStart is refused.
    startParam: moves.positions.some((position) => position != null)
      ? "toPath"
      : "arrangementStart",
  };
}

/**
 * The lists a call has to keep the same length.
 * @param folded - The call's target params, folded onto `id` and `path`
 * @param args - The update-clip args
 * @returns The lists to compare
 */
function listArgs(
  folded: TargetParams,
  args: ClipUpdateArgs,
): Parameters<typeof validateListLengths>[0] {
  return [
    { param: targetParamLabel(folded), count: targetCount(folded) },
    { param: "name", value: args.name },
    { param: "color", value: args.color },
    { param: "timeSignature", value: args.timeSignature },
    { param: "start", value: args.start },
    { param: "length", value: args.length },
    { param: "firstStart", value: args.firstStart },
    { param: "quantizePitch", value: args.quantizePitch },
    { param: "arrangementStart", value: args.arrangementStart },
    { param: "arrangementLength", value: args.arrangementLength },
    {
      param: args.toPath != null ? "toPath" : "toSlot",
      value: args.toPath ?? args.toSlot,
      isPath: true,
    },
  ];
}

/**
 * Resolve any `loc:` entry in the two song-timeline params to the bar|beat it
 * names. Neither one set costs no Live API call at all.
 * @param arrangementStart - Position list as the caller wrote it
 * @param arrangementSplit - Split-position list as the caller wrote it
 * @returns Both, with every locator resolved
 */
function resolveSongLocators(
  arrangementStart: string | undefined,
  arrangementSplit: string | undefined,
): { arrangementStart?: string; arrangementSplit?: string } {
  if (arrangementStart == null && arrangementSplit == null) {
    return { arrangementStart, arrangementSplit };
  }

  const liveSet = LiveAPI.from(livePath.liveSet);
  const resolve = (value: string | undefined, paramName: string) =>
    value == null
      ? undefined
      : resolveLocatorPositions(liveSet, value, { paramName });

  return {
    arrangementStart: resolve(arrangementStart, "arrangementStart"),
    arrangementSplit: resolve(arrangementSplit, "arrangementSplit"),
  };
}

/**
 * Read the split param the call used, refusing positions it can't use.
 * @param arrangementSplit - Song-timeline positions
 * @param split - Deprecated clip-relative positions
 * @returns The split positions and how to read them, or null for no split
 */
function readSplitRequest(
  arrangementSplit: string | undefined,
  split: string | undefined,
): SplitRequest | null {
  const request = resolveSplitRequest(arrangementSplit, split);

  return request == null
    ? null
    : {
        points: readSplitPoints(request.value, request.mode),
        mode: request.mode,
      };
}

/**
 * Pick which split param to act on. The two read positions on different
 * timelines, so sending both is ambiguous: refuse rather than guess, the same
 * way toPath/toSlot handle a doubled destination.
 * @param rawArrangementSplit - Song-timeline positions
 * @param rawSplit - Deprecated clip-relative positions
 * @returns The positions and how to read them, or null when none were sent
 */
function resolveSplitRequest(
  rawArrangementSplit: string | undefined,
  rawSplit: string | undefined,
): { value: string; mode: SplitMode } | null {
  // A blank names no position, so reading one as a request made a caller that
  // fills unused strings with "" lose the split it did ask for. `split` is
  // hidden, so a model never saw the name: its null reads without a warning.
  const { value: arrangementSplit, aliasValue: split } = refuseDoubledSpelling({
    param: "arrangementSplit",
    value: rawArrangementSplit,
    alias: "split",
    aliasValue: rawSplit,
    noun: "split positions",
  });

  if (arrangementSplit != null) {
    return { value: arrangementSplit, mode: ARRANGEMENT_SPLIT_MODE };
  }

  if (split != null) {
    return { value: split, mode: LEGACY_SPLIT_MODE };
  }

  return null;
}
