// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Shared by the create tools that make several objects in one container:
// tracks and scenes. An entry inside the container names a place as the caller
// read it, so creating one moves the ones after it. Past the end of a container
// that fills gaps (scenes), there is nothing to read, so an entry names the
// index it ends up at.

/** Where one new object goes: an index in the container, or its end. */
export type InsertionSpot = number | "end";

/** Where one new object is created, and where it ends up. */
export interface Insertion<S extends InsertionSpot = InsertionSpot> {
  /** Index to create at, clamped to the container as it stands when this one
   * runs: Live refuses an index past the end instead of appending. */
  insertIndex: S;
  /** insertIndex with "end" read as the container's length when this one runs */
  atIndex: number;
  /** The index asked for before that clamp, so a cap sees the call's reach. */
  reachIndex: S;
  /** Empty objects to add on the end first, so that index exists. */
  padCount: number;
  /** Where it sits once every object the call named has been created. */
  finalIndex: number;
  /** Empty objects right below it at the end, made to fill a gap */
  emptyBelow: number;
}

// Tokens in a planned layout; entries are their own index (0 and up).
const EXISTING = -1;
const EMPTY = -2;

/**
 * Works out where each new object is created and where it ends up.
 *
 * Entries inside the container shift past earlier ones at or before them, so
 * "t2,t2" creates the second track after the first. An entry past the end lands
 * at the index it names: "s6,s5" on two scenes ends with s5 and s6 new and
 * s2-s4 empty. Where it can, an insert takes the place of an empty object
 * rather than pushing later entries off the index they named.
 * @param spots - Where each new object goes, in the order the call named them
 * @param existingCount - Objects in the container before the call
 * @param padsGaps - Add empty objects when a spot is past the end (scenes)
 * @returns One entry per spot, in the same order
 */
export function planInsertions<S extends InsertionSpot>(
  spots: S[],
  existingCount: number,
  padsGaps = false,
): Insertion<S>[] {
  const layout: number[] = Array.from(
    { length: existingCount },
    () => EXISTING,
  );
  const reaches = spots.map((spot, i) => {
    const reach = reachFor(
      spot,
      spots.slice(0, i),
      layout,
      padsGaps ? existingCount : Infinity,
    );

    placeEntry(layout, i, reach === "end" ? layout.length : reach, padsGaps);

    return reach;
  });

  // The layout is final only once every entry is in, and a later insert can
  // take an empty object an earlier one padded, so the Live calls are worked
  // out from the finished layout.
  let emptiesMade = 0;

  return spots.map((spot, i) => {
    const finalIndex = layout.indexOf(i);
    const below = layout.slice(0, finalIndex);
    const padCount = Math.max(
      0,
      below.filter((token) => token === EMPTY).length - emptiesMade,
    );

    emptiesMade += padCount;

    // Everything below it that exists by now: old objects, empties and the
    // entries created before it.
    const atIndex = below.filter((token) => token < i).length;

    return {
      insertIndex: (spot === "end" ? "end" : atIndex) as S,
      atIndex,
      reachIndex: reaches[i] as S,
      padCount,
      finalIndex,
      emptyBelow: countTrailingEmpties(below),
    };
  });
}

/**
 * Refuses `count` sent with a path list: both say how many to make, and a call
 * that says it twice has no reading that isn't a mistake.
 * @param count - The count param, or undefined when it wasn't sent
 * @param pathCount - How many entries the path param names
 * @param noun - What the tool creates, singular ("track", "scene")
 * @param example - A path list for this tool, shown in the error
 */
export function refuseCountWithPathList(
  count: number | undefined,
  pathCount: number,
  noun: string,
  example: string,
): void {
  if (count == null || pathCount < 2) {
    return;
  }

  throw new Error(
    `count repeats one path, but path names ${pathCount}. Drop count and let ` +
      `path name each ${noun} (e.g. path: "${example}").`,
  );
}

/**
 * Refuses a count that names nothing to create.
 * @param count - The count param, or undefined when it wasn't sent
 */
export function validateCount(count: number | undefined): void {
  if (count != null && count < 1) {
    throw new Error("count must be at least 1");
  }
}

/**
 * Repeats a lone target `count` times, which is all `count` ever meant: the
 * same place, several times over.
 * @param targets - The targets the path named
 * @param count - The count param, or undefined when it wasn't sent
 * @returns The targets to create, in order
 */
export function repeatForCount<T>(
  targets: T[],
  count: number | undefined,
): T[] {
  if (count == null || targets.length !== 1) {
    return targets;
  }

  return Array.from({ length: count }, () => targets[0] as T);
}

// --- Helpers below main exports ---

/**
 * The index an entry asks for in the container as it stands when it runs.
 * @param spot - Where this entry goes
 * @param earlier - The entries ahead of it, as the caller wrote them
 * @param layout - The container so far
 * @param gapStart - Where a gap past the end starts; Infinity when it can't
 * have one, so every spot reads as inside (tracks)
 * @returns The index to create at, before any clamp
 */
function reachFor(
  spot: InsertionSpot,
  earlier: InsertionSpot[],
  layout: number[],
  gapStart: number,
): InsertionSpot {
  if (spot === "end") {
    return "end";
  }

  if (spot < gapStart) {
    return (
      spot + earlier.filter((other) => other !== "end" && other <= spot).length
    );
  }

  // Past the end: it goes after earlier entries at or before its index,
  // wherever they sit now, and never among the objects already there.
  const lastEarlier = Math.max(
    -1,
    ...earlier.map((other, j) =>
      other !== "end" && other <= spot ? layout.indexOf(j) : -1,
    ),
  );

  return Math.max(spot, lastEarlier + 1, layout.lastIndexOf(EXISTING) + 1);
}

/**
 * Puts one entry into the planned layout.
 * @param layout - The container so far, changed in place
 * @param entry - The entry's position in the call
 * @param index - Where it goes
 * @param padsGaps - Fill a gap past the end with empty objects
 */
function placeEntry(
  layout: number[],
  entry: number,
  index: number,
  padsGaps: boolean,
): void {
  if (padsGaps) {
    while (layout.length < index) {
      layout.push(EMPTY);
    }
  }

  const at = Math.min(index, layout.length);

  layout.splice(at, 0, entry);

  // Taking the first empty object above it keeps the entries past that one at
  // the index they named.
  const empty = layout.indexOf(EMPTY, at + 1);

  if (empty !== -1) {
    layout.splice(empty, 1);
  }
}

/**
 * Counts the empty objects at the top of a stretch of the layout.
 * @param below - The layout under one entry
 * @returns How many empty objects sit right below it
 */
function countTrailingEmpties(below: number[]): number {
  let count = 0;

  while (below[below.length - 1 - count] === EMPTY) {
    count++;
  }

  return count;
}
