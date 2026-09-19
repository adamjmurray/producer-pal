// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Shared by the create tools that make several objects in one container:
// tracks and scenes. Each path entry names a position in the container as the
// caller read it, and creating one moves the ones after it, so where an entry
// is created and where it ends up are two different numbers.

/** Where one new object goes: an index in the container, or its end. */
export type InsertionSpot = number | "end";

/** Where one new object is created, and where it ends up. */
export interface Insertion<S extends InsertionSpot = InsertionSpot> {
  /** Index to create at, clamped to the container as it stands when this one
   * runs: Live refuses an index past the end instead of appending. */
  insertIndex: S;
  /** The index asked for before that clamp, so a cap sees the call's reach. */
  reachIndex: S;
  /** Empty objects to add on the end first, so that index exists. */
  padCount: number;
  /** Where it sits once every object the call named has been created. */
  finalIndex: number;
}

/**
 * Works out where each new object is created and where it ends up.
 *
 * An entry is pushed along by every earlier entry that landed at or before it,
 * so "t2,t2" creates the second track after the first rather than in front of
 * it. A later entry can move an earlier one, which is why the reported index
 * comes from the finished order rather than from the index Live was asked for.
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
  const shifted: InsertionSpot[] = spots.map((spot, i) =>
    shiftPastEarlier(spot, spots.slice(0, i)),
  );
  const layout: number[] = Array.from({ length: existingCount }, () => -1);
  const padCounts: number[] = [];
  const insertIndexes: InsertionSpot[] = [];

  for (const [i, spot] of shifted.entries()) {
    const pad =
      padsGaps && spot !== "end" ? Math.max(0, spot - layout.length) : 0;

    padCounts.push(pad);

    for (let n = 0; n < pad; n++) {
      layout.push(-1);
    }

    const at = spot === "end" ? layout.length : Math.min(spot, layout.length);

    insertIndexes.push(spot === "end" ? "end" : at);
    layout.splice(at, 0, i);
  }

  // A numeric spot stays a number and "end" stays "end", so the entries come
  // back in the shape the caller passed in.
  return insertIndexes.map((insertIndex, i) => ({
    insertIndex: insertIndex as S,
    reachIndex: shifted[i] as S,
    padCount: padCounts[i] as number,
    finalIndex: layout.indexOf(i),
  }));
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
 * An entry's index in the container as it will stand when it runs.
 * @param spot - Where this entry goes
 * @param earlier - The entries ahead of it, as the caller wrote them
 * @returns The index to create at
 */
function shiftPastEarlier(
  spot: InsertionSpot,
  earlier: InsertionSpot[],
): InsertionSpot {
  if (spot === "end") {
    return "end";
  }

  return (
    spot + earlier.filter((other) => other !== "end" && other <= spot).length
  );
}
