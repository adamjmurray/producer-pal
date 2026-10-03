// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { MAX_AUTO_CREATED_TRACKS } from "#src/tools/constants.ts";
import { type Insertion } from "#src/tools/shared/validation/lists/insertion-plan.ts";
import {
  type InsertionRun,
  startInsertionRun,
} from "#src/tools/shared/validation/lists/insertion-run.ts";
import {
  type PairedLabels,
  pairLabels,
} from "#src/tools/shared/validation/lists/labeled-targets.ts";
import { type Target } from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import { type CreateTrackTarget } from "./create-track-targets.ts";
import { type CreateTrackCall } from "./parse-create-track-call.ts";

/** What the check found, shared by every target's write. */
export interface CreateTrackChecked extends PairedLabels {
  liveSet: LiveAPI;
  call: CreateTrackCall;
  /** The regular tracks' inserts; null when the call makes only return tracks */
  run: InsertionRun | null;
  /** Each target's place in `run`, by target; undefined for a return track */
  entryOf: Array<number | undefined>;
  /** How many return tracks the Set had before the call */
  returnBase: number;
  /** How many return tracks the call has made so far */
  returnsMade: number;
}

/**
 * Stage 3: plan where the regular tracks go, refuse a call past the track cap,
 * and pair names and colors with the tracks. Reads only.
 * @param call - The create-track call
 * @param targets - The call's targets
 * @returns What every write shares
 * @throws Error when the call would grow the Set past the track cap, or a name
 *   or color list can't be paired
 */
export function checkCreateTrackCall(
  call: CreateTrackCall,
  targets: Array<Target<CreateTrackTarget>>,
): CreateTrackChecked {
  const liveSet = LiveAPI.from(livePath.liveSet);
  const entryOf: Array<number | undefined> = [];
  const spots: CreateTrackTarget["spot"][] = [];

  for (const [index, { data }] of targets.entries()) {
    const { type, spot } = data as CreateTrackTarget;

    // Return tracks aren't in the plan: Live puts them on the end of their own
    // list.
    if (type !== "return") {
      entryOf[index] = spots.length;
      spots.push(spot);
    }
  }

  const run =
    spots.length === 0
      ? null
      : startInsertionRun(spots, liveSet.getChildIds("tracks"));

  validateTrackCap(targets.length, run?.plan ?? []);

  return {
    ...pairLabels({
      noun: "track",
      count: targets.length,
      name: call.name,
      color: call.color,
    }),
    liveSet,
    call,
    run,
    entryOf,
    // Read only when the call makes one: return tracks append, so this is where
    // the first lands.
    returnBase:
      spots.length === targets.length
        ? 0
        : liveSet.getChildIds("return_tracks").length,
    returnsMade: 0,
  };
}

// --- Helpers below main export ---

/**
 * Refuses a call that would grow the Set past the track cap, before any track
 * is made.
 * @param total - How many tracks the call creates
 * @param insertions - Where each regular track goes
 */
function validateTrackCap(total: number, insertions: Insertion[]): void {
  // The total must not exceed the cap in ANY mode: the reach check below sees
  // only inserts at a named index, so appends and returns would be unbounded.
  if (total > MAX_AUTO_CREATED_TRACKS) {
    throw new Error(
      `creating ${total} tracks exceeds the maximum allowed (${MAX_AUTO_CREATED_TRACKS})`,
    );
  }

  const indexes = insertions
    .map((insertion) => insertion.reachIndex)
    .filter((index): index is number => index !== "end");

  if (Math.max(-1, ...indexes) + 1 > MAX_AUTO_CREATED_TRACKS) {
    throw new Error(
      `creating ${total} tracks at index ${indexes[0]} would exceed the maximum allowed tracks (${MAX_AUTO_CREATED_TRACKS})`,
    );
  }
}
