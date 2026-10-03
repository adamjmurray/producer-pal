// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The inserts of one create call, kept true while they run. The plan assumes
// every insert lands, and a failed one moves the ones after it, so the rest are
// planned again from what the container holds. Entries are named the same way:
// from the plan while every insert landed, from the container otherwise.

import {
  type Insertion,
  type InsertionSpot,
  layoutFromIds,
  placeInLayout,
  planInsertions,
} from "./insertion-plan.ts";

/** Where an entry's object ended up, and the empty objects made right below it. */
export interface Placed {
  finalIndex: number;
  emptyBelow: number;
}

/** One create call's inserts, as they stand. */
export interface InsertionRun {
  /** Where each entry goes, as the call named it */
  spots: InsertionSpot[];
  /** Whether a spot past the end is filled with empty objects (scenes) */
  padsGaps: boolean;
  /** The ids the container held before the call */
  before: ReadonlySet<string>;
  /** What each entry will do: the plan, or the replan once an insert failed */
  plan: Insertion[];
  /** The id each entry made, once it did; null until then, and for good if it failed */
  made: Array<string | null>;
  /** An insert failed, so the entries after it aren't where the plan has them */
  stale: boolean;
}

/**
 * Plan a call's inserts.
 * @param spots - Where each entry goes, in the order named
 * @param before - The ids in the container now
 * @param padsGaps - Fill a spot past the end with empty objects (scenes)
 * @returns The run, planned
 */
export function startInsertionRun(
  spots: InsertionSpot[],
  before: string[],
  padsGaps = false,
): InsertionRun {
  return {
    spots,
    padsGaps,
    before: new Set(before),
    plan: planInsertions(spots, before.length, padsGaps),
    made: spots.map(() => null),
    stale: false,
  };
}

/**
 * What one entry's insert does now. After a failed insert the rest are planned
 * again from the container as it stands, since they were planned on the
 * assumption it landed.
 * @param run - The call's inserts
 * @param entry - The entry about to insert
 * @param readIds - Reads the ids in the container, in order
 * @returns Where to create it, and what to pad first
 */
export function insertionFor(
  run: InsertionRun,
  entry: number,
  readIds: () => string[],
): Insertion {
  if (run.stale) {
    // A failed entry made nothing, so it shifts nothing: "end" does exactly that.
    const spots = run.spots.map((spot, i) =>
      i < entry && run.made[i] == null ? "end" : spot,
    );
    const layout = layoutFromIds(readIds(), run.before, run.made, run.padsGaps);

    run.plan.splice(
      entry,
      run.plan.length - entry,
      ...planInsertions(spots, run.before.size, run.padsGaps, {
        layout,
        from: entry,
      }),
    );
    run.stale = false;
  }

  return run.plan[entry] as Insertion;
}

/**
 * Record the object an entry made.
 * @param run - The call's inserts
 * @param entry - The entry
 * @param id - The new object's id
 */
export function insertMade(run: InsertionRun, entry: number, id: string): void {
  run.made[entry] = id;
}

/**
 * Record that an entry's insert failed, so the rest are planned again.
 * @param run - The call's inserts
 */
export function insertFailed(run: InsertionRun): void {
  run.stale = true;
}

/**
 * Where each entry's object is now. The plan is exact while every insert
 * landed; once one didn't, the container is read.
 * @param run - The call's inserts
 * @param readIds - Reads the ids in the container, in order
 * @returns One place per entry, null for one that made nothing
 */
export function placesAfter(
  run: InsertionRun,
  readIds: () => string[],
): Array<Placed | null> {
  if (run.made.every((id) => id != null)) {
    return run.plan.map(({ finalIndex, emptyBelow }) => ({
      finalIndex,
      emptyBelow,
    }));
  }

  const layout = layoutFromIds(readIds(), run.before, run.made, run.padsGaps);

  return run.made.map((_, entry) => placeInLayout(layout, entry));
}
