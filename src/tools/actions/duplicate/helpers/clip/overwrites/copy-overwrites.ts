// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// What an arrangement copy did to the clips already on its lane: Live
// overwrites, trims and splits them without a word, so the copy's own entry
// says it. One ledger serves the whole call, over the call's lane
// view: a lane is read once, and after each copy only what the copy could have
// changed is read again.
//
// A copy edits clips in other ways (clearing, tiling, lengthening) inside its
// own write, so each copy is wrapped whole: the lane is noted before the first
// copy to it, and read back after the copy is finished. Those edits report to
// the same view as they go.
//
// A copy that really parks on a wait (code exec, a Node round trip) may let
// another request edit lanes meanwhile. The view drops every lane itself then,
// and the next copy reads again.

import { errorMessage } from "#src/shared/error-message.ts";
import { LaneLedger } from "#src/tools/shared/arrangement/helpers/arrangement-lane-ledger.ts";
import {
  type LaneView,
  type Reach,
} from "#src/tools/shared/arrangement/helpers/arrangement-lane-view.ts";
import { type ArrangementLane } from "#src/tools/shared/validation/helpers/object-path-position.ts";
import { noteCopyEffects } from "../../minimal-clip-info.ts";

/** The lane a copy writes to, and the object holding its clips. */
export interface CopyLane {
  lane: ArrangementLane;
  /** The Track for a main lane, the TakeLane otherwise. */
  api: LiveAPI;
}

/** What a copy made, and what it did to the clips that were already there. */
export interface CopiedClearing<T> {
  made: T;
  cleared: string | undefined;
}

/**
 * A copy that threw after it may have cleared clips. The message is the
 * original's, so a lone failure still throws the same words; `cleared` says
 * what the write destroyed before it failed.
 */
export class ClearedThenFailedError extends Error {
  readonly cleared: string;

  constructor(original: unknown, cleared: string) {
    super(errorMessage(original), { cause: original });
    this.cleared = cleared;
  }
}

/**
 * What a failed copy cleared before it threw, if anything.
 * @param error - What the copy threw
 * @returns What it overwrote, shortened or split, or undefined when nothing
 */
export function clearedBefore(error: unknown): string | undefined {
  return error instanceof ClearedThenFailedError ? error.cleared : undefined;
}

/** An entry that names a clip, or a group of clips. */
interface CopyEntry {
  id?: string;
  detail?: string;
  clips?: CopyEntry[];
}

/**
 * The ledger for one call's copies. A copy a later copy buries says so on its
 * own entry, so the later copy doesn't report it again.
 * @param lanes - The call's lanes, shared with whatever else writes to them
 * @returns A new ledger
 */
export function copyLedger(lanes?: LaneView): LaneLedger {
  return new LaneLedger({ skipOwn: true, lanes });
}

/**
 * Where a copy on a track's main lane lands.
 * @param trackIndex - The track
 * @param track - The track object
 * @returns The lane
 */
export function mainLaneOf(trackIndex: number, track: LiveAPI): CopyLane {
  return { lane: { kind: "track", trackIndex }, api: track };
}

/**
 * Where a copy on a take lane lands.
 * @param trackIndex - The track
 * @param laneIndex - The take lane's index on it
 * @param lane - The take lane object
 * @returns The lane
 */
export function takeLaneOf(
  trackIndex: number,
  laneIndex: number,
  lane: LiveAPI,
): CopyLane {
  return { lane: { kind: "take-lane", trackIndex, laneIndex }, api: lane };
}

/**
 * Everything a copy might have cleared.
 * @param startBeats - Where the copy begins
 * @param spans - The lengths it may write: the source's, and the one asked for
 * @returns The stretch from the start to the longest of them
 */
export function copyReach(startBeats: number, ...spans: number[]): Reach {
  // A span read off a clip the API couldn't answer for is no span at all.
  const known = spans.filter(Number.isFinite);

  return { start: startBeats, end: startBeats + Math.max(0, ...known) };
}

/**
 * Run one copy and read what it did to the clips already on its lane. The lane
 * is dropped if the copy or the read-back throws, since it may have changed
 * unseen. A copy that throws after clearing clips throws a
 * {@link ClearedThenFailedError}, so the failure still says what was destroyed.
 * @param ledger - The call's ledger
 * @param where - The lane the copy writes to
 * @param reach - Everything the copy may have cleared, whether or not it landed
 * @param write - Makes the copy, in its final shape
 * @param idsOf - The ids of the clips the copy made
 * @returns What the copy made, and what it did to the clips that were there
 */
export function copyClearing<T>(
  ledger: LaneLedger,
  where: CopyLane,
  reach: Reach,
  write: () => T,
  idsOf: (made: T) => string[],
): CopiedClearing<T> {
  ledger.scan(where.lane, where.api);

  let made: T;

  try {
    made = write();
  } catch (error) {
    throw failedClearing(ledger, where, reach, error);
  }

  return readClearing(ledger, where, reach, made, idsOf);
}

/**
 * {@link copyClearing} for a copy that awaits.
 * @param ledger - The call's ledger
 * @param where - The lane the copy writes to
 * @param reach - Everything the copy may have cleared, whether or not it landed
 * @param write - Makes the copy, in its final shape
 * @param idsOf - The ids of the clips the copy made
 * @returns What the copy made, and what it did to the clips that were there
 */
export async function copyClearingAsync<T>(
  ledger: LaneLedger,
  where: CopyLane,
  reach: Reach,
  write: () => T | Promise<T>,
  idsOf: (made: T) => string[],
): Promise<CopiedClearing<T>> {
  ledger.scan(where.lane, where.api);

  let made: T;

  try {
    made = await write();
  } catch (error) {
    throw failedClearing(ledger, where, reach, error);
  }

  return readClearing(ledger, where, reach, made, idsOf);
}

/**
 * The ids of the clips in a copy's entry, looking under a group's `clips`.
 * @param copy - A copy's entry: a clip, or the track path with its tiled clips
 * @returns Every clip id
 */
export function copiedIds(copy: object): string[] {
  const { id, clips } = copy as CopyEntry;

  if (clips != null) {
    return clips.flatMap(copiedIds);
  }

  return id == null ? [] : [id];
}

/**
 * Say on a copy's entry what it cleared. A group of tiled clips says it once,
 * on its first clip.
 * @param copy - A copy's entry
 * @param cleared - What the copy overwrote, shortened or split
 */
export function noteCleared(copy: object, cleared: string): void {
  const entry = copy as CopyEntry;

  noteCopyEffects(entry.clips?.[0] ?? entry, cleared);
}

// --- Helpers below main exports ---

/**
 * Reads what a copy that threw had already cleared, then drops the lane: the
 * copy may have changed more than the read-back sees.
 * @param ledger - The call's ledger
 * @param where - The lane the copy wrote to
 * @param reach - Everything the copy may have cleared
 * @param error - What the copy threw
 * @returns The error to throw: the original, or one that says what was cleared
 */
function failedClearing(
  ledger: LaneLedger,
  where: CopyLane,
  reach: Reach,
  error: unknown,
): unknown {
  let cleared: string | undefined;

  try {
    cleared = ledger.afterWrite(where.lane, [], { api: where.api, reach });
  } catch {
    // Nothing is known about what it did, so the failure stands as it was.
  }

  ledger.forget(where.lane);

  return cleared == null ? error : new ClearedThenFailedError(error, cleared);
}

/**
 * @param ledger - The call's ledger
 * @param where - The lane the copy wrote to
 * @param reach - Everything the copy may have cleared
 * @param made - What the copy made
 * @param idsOf - The ids of the clips it made
 * @returns What it made, and what it did to the clips that were there
 */
function readClearing<T>(
  ledger: LaneLedger,
  where: CopyLane,
  reach: Reach,
  made: T,
  idsOf: (made: T) => string[],
): CopiedClearing<T> {
  // A failed read-back can't unmake the copy, and can't promise nothing was
  // cleared either: the entry says what it couldn't tell, even for a copy Live
  // declined, which then reads as changed rather than refused. The lane is
  // dropped from the ledger.
  try {
    return {
      made,
      cleared: ledger.afterWrite(where.lane, idsOf(made), {
        api: where.api,
        reach,
      }),
    };
  } catch (error) {
    ledger.forget(where.lane);

    return {
      made,
      cleared: `couldn't tell what it overwrote: ${errorMessage(error)}`,
    };
  }
}
