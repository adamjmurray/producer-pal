// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { resolveLocatorPositions } from "#src/tools/shared/locator/song-position.ts";
import { prepareSplitParams } from "#src/tools/shared/arrangement/arrangement-splitting-params.ts";
import {
  ARRANGEMENT_SPLIT_MODE,
  LEGACY_SPLIT_MODE,
  performSplitting,
  type SplitMode,
} from "#src/tools/shared/arrangement/arrangement-splitting.ts";
import { isTakeLaneClip } from "#src/tools/shared/arrangement/helpers/take-lanes.ts";
import {
  namedParam,
  paramNamesSomething,
} from "#src/tools/shared/helpers/param-presence.ts";
import { type ClipPath } from "#src/tools/shared/validation/helpers/object-paths.ts";
import {
  computeOverwritePlan,
  type OverwritePlan,
} from "./arrangement/update-clip-arrangement-optimizer.ts";
import {
  beatsForClip,
  parseArrangementParams,
} from "./arrangement/update-clip-arrangement-params.ts";
import { orderArrangementMoves } from "./arrangement/update-clip-move-order.ts";
import { refuseSplitWithMove } from "./update-clip-refusals.ts";
import {
  moveDestinationParam,
  resolveMoveDestinations,
  resolveRequestedClips,
} from "./move/move-destinations.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";

export interface ClipUpdatePlanArgs {
  /** Ids in call order, null where a path named no clip */
  requestedIds: Array<string | null>;
  toPath?: string;
  toSlot?: string;
  arrangementStart?: string;
  arrangementLength?: string;
  arrangementSplit?: string;
  split?: string;
  context: Partial<ToolContext>;
}

export interface ClipUpdatePlan {
  /** The clips to update, after any splitting, in the order the call named them */
  clips: LiveAPI[];
  /**
   * Positions in `clips`, in the order to process them. A move clears its
   * destination before the copy lands, so a clip another clip is moving on top
   * of goes first (see update-clip-move-order.ts).
   */
  moveOrder: number[];
  destinationById: Map<string, ClipPath>;
  destinationParam: "toPath" | "toSlot";
  /** Clips to clear rather than move, or null when nothing can be skipped */
  overwrites: OverwritePlan | null;
  startBeatsFor: (clip: LiveAPI) => number | null;
  lengthBeatsFor: (clip: LiveAPI) => number | null;
  /** Which clips each clip has to wait for, for the executor's own re-decide. */
  dependencies: Array<Set<number>>;
  /** Whether each clip's move was expected to free the span it sits on. */
  vacates: boolean[];
  /**
   * Call off a clip's move and resize before its turn comes, for a destination
   * Live turned down after this plan was made. Both halves go, for the reason
   * the plan-time refusal drops both.
   */
  refuseMove: (clipId: string) => void;
}

/**
 * Work out what the call does to which clips: refuse a split there is no
 * reading of, resolve the ids, split them if asked, and pair each one with
 * where it's headed.
 * @param args - The target and position params as the tool received them
 * @param args.requestedIds - Ids in call order
 * @param args.toPath - Destination path(s)
 * @param args.toSlot - Deprecated destination slot(s)
 * @param args.arrangementStart - Bar|beat position(s)
 * @param args.arrangementLength - Arrangement span duration(s)
 * @param args.arrangementSplit - Song-timeline split positions
 * @param args.split - Deprecated clip-relative split positions
 * @param args.context - Per-request context
 * @returns The clips and the per-clip values the update loop reads
 */
export function planClipUpdate({
  requestedIds,
  toPath,
  toSlot,
  arrangementStart,
  arrangementLength,
  arrangementSplit,
  split,
  context,
}: ClipUpdatePlanArgs): ClipUpdatePlan {
  // Before the first Live read, so a call there is no reading of changes
  // nothing.
  refuseSplitWithMove({
    arrangementSplit,
    split,
    toPath,
    toSlot,
    arrangementStart,
    arrangementLength,
  });

  // Rewrite every `loc:` position as the bar|beat it names, once, before
  // anything reads them, so nothing below needs a Live Set of its own.
  // `start`, `firstStart` and `split` are clip-relative and stay out of it.
  ({ arrangementStart, arrangementSplit } = resolveSongLocators(
    arrangementStart,
    arrangementSplit,
  ));

  // Paired against what the caller named, not against the clips that resolve:
  // an id that names nothing has to take its position with it, or every later
  // clip slides onto the wrong bar.
  const moves = resolveMoveDestinations(toPath, toSlot, requestedIds.length);
  const { startBeats, lengthBeats } = parseArrangementParams(
    arrangementStart,
    arrangementLength,
    requestedIds.length,
    moves.positions,
  );
  const { clips, destinationById, requestedIndexById } = resolveRequestedClips(
    requestedIds,
    moves.destinations,
  );
  const startBeatsFor = (clip: LiveAPI): number | null =>
    beatsForClip(startBeats, requestedIndexById.get(clip.id));
  const lengthBeatsFor = (clip: LiveAPI): number | null =>
    beatsForClip(lengthBeats, requestedIndexById.get(clip.id));
  const splitClips = applySplittingIfNeeded(
    clips,
    arrangementSplit,
    split,
    context,
  );
  const { order, blockedIds, dependencies, vacates } = orderArrangementMoves(
    splitClips,
    { startBeatsFor, lengthBeatsFor, destinationById },
  );
  // Starts with what the plan refused, and grows as the executor gives up on a
  // destination Live turns down — same set, so both refusals drop a move the
  // same way.
  const refusedIds = new Set(blockedIds);

  // A refused move must not reach Live by either route, so drop the lane too.
  const refuseMove = (clipId: string): void => {
    refusedIds.add(clipId);
    destinationById.delete(clipId);
  };

  for (const id of blockedIds) {
    destinationById.delete(id);
  }

  // Both halves go: a resize clears the span it tiles across just as a move
  // clears its destination, so letting it run alone would destroy the very
  // clip the refusal is protecting. Read per clip as its turn comes, so a
  // refusal made mid-call still reaches the clips after it.
  const startBeatsForMove = (clip: LiveAPI): number | null =>
    refusedIds.has(clip.id) ? null : startBeatsFor(clip);
  const lengthBeatsForMove = (clip: LiveAPI): number | null =>
    refusedIds.has(clip.id) ? null : lengthBeatsFor(clip);

  return {
    clips: splitClips,
    moveOrder: order,
    destinationById,
    destinationParam: moveDestinationParam(toPath, toSlot),
    // Weighed in processing order, and without the refused moves: the plan
    // holds a clip back for an overwrite that would now never come.
    overwrites: computeOverwritePlan(
      order.map((index) => splitClips[index] as LiveAPI),
      {
        startBeatsFor: startBeatsForMove,
        lengthBeatsFor: lengthBeatsForMove,
        destinationById,
      },
    ),
    startBeatsFor: startBeatsForMove,
    lengthBeatsFor: lengthBeatsForMove,
    dependencies,
    vacates,
    refuseMove,
  };
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
      : resolveLocatorPositions(liveSet, value, {
          paramName,
        });

  return {
    arrangementStart: resolve(arrangementStart, "arrangementStart"),
    arrangementSplit: resolve(arrangementSplit, "arrangementSplit"),
  };
}

/**
 * Apply splitting to arrangement clips if a split param is provided
 * @param clips - Validated clip LiveAPI objects
 * @param arrangementSplit - Comma-separated song-timeline split positions
 * @param split - Deprecated clip-relative split positions
 * @param context - Tool execution context
 * @returns Filtered clips (non-existent removed after splitting)
 */
function applySplittingIfNeeded(
  clips: LiveAPI[],
  arrangementSplit: string | undefined,
  split: string | undefined,
  context: Partial<ToolContext>,
): LiveAPI[] {
  const request = resolveSplitRequest(arrangementSplit, split);

  if (request == null) {
    return clips;
  }

  const { value, mode } = request;

  const arrangementClips = clips.filter((clip) => {
    if ((clip.getProperty("is_arrangement_clip") as number) <= 0) {
      return false;
    }

    // performSplitting uses duplicate_clip_to_arrangement (Track-only) which
    // can't target take lanes. Warn-and-skip rather than silently misroute
    // the split onto the main lane.
    if (isTakeLaneClip(clip)) {
      console.warn(
        `${mode.param} ignored for take-lane clip ${targetLabel(clip)}; split it in Live's UI`,
      );

      return false;
    }

    return true;
  });
  const splitPoints = prepareSplitParams(
    value,
    arrangementClips,
    new Set(),
    mode,
  );

  if (splitPoints != null) {
    performSplitting(arrangementClips, splitPoints, clips, context, mode);

    return clips.filter((clip) => clip.exists());
  }

  return clips;
}

/**
 * Pick which split param to act on. The two read positions on different
 * timelines, so sending both is ambiguous: warn and split nothing rather than
 * guess, matching how toPath/toSlot handle a doubled destination.
 * @param rawArrangementSplit - Song-timeline positions
 * @param rawSplit - Deprecated clip-relative positions
 * @returns The positions and how to read them, or null to skip splitting
 */
function resolveSplitRequest(
  rawArrangementSplit: string | undefined,
  rawSplit: string | undefined,
): { value: string; mode: SplitMode } | null {
  // A blank names no position, so reading one as a request made a caller that
  // fills unused strings with "" lose the split it did ask for. `split` is
  // hidden, so a model never saw the name — read it without the warning.
  const arrangementSplit = namedParam(rawArrangementSplit, "arrangementSplit");
  const split = paramNamesSomething(rawSplit) ? rawSplit?.trim() : undefined;

  if (arrangementSplit != null && split != null) {
    console.warn(
      "arrangementSplit and split both name split positions, so no clip was " +
        "split; use arrangementSplit alone (split is deprecated, and its " +
        "positions are measured from each clip's start instead of the song timeline)",
    );

    return null;
  }

  if (arrangementSplit != null) {
    return { value: arrangementSplit, mode: ARRANGEMENT_SPLIT_MODE };
  }

  if (split != null) {
    return { value: split, mode: LEGACY_SPLIT_MODE };
  }

  return null;
}
