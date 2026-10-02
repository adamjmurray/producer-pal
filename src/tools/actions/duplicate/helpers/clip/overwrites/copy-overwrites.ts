// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// What an arrangement copy did to the clips already on its lane: Live
// overwrites, trims and splits them without a word, so the copy's own entry
// says it (ADR-0047). One ledger serves the whole call; it reads a lane once
// and after each copy re-reads only what the copy could have changed.
//
// The ledger is valid only while every arrangement change since its scan went
// through it. A copy edits clips in other ways (clearing, tiling, lengthening)
// inside its own write, so each copy is wrapped whole: the lane is scanned
// before the first copy to it, and read back after the copy is finished. No
// copy in the call touches a lane between those two points.
//
// A copy that waits on update-clip (lengthening one) may let another request
// edit lanes meanwhile, so the ledger forgets every lane once it resumes and the
// next copy scans again. Update-clip scans the lane there anyway. A copy that
// doesn't wait on it keeps the ledger.

import {
  LaneLedger,
  type Reach,
} from "#src/tools/shared/arrangement/helpers/arrangement-lane-ledger.ts";
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

/** An entry that names a clip, or a group of clips. */
interface CopyEntry {
  id?: string;
  detail?: string;
  clips?: CopyEntry[];
}

/**
 * The ledger for one call's copies. A copy a later copy buries says so on its
 * own entry, so the later copy doesn't report it again.
 * @returns A new ledger
 */
export function copyLedger(): LaneLedger {
  return new LaneLedger({ skipOwn: true });
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
 * unseen.
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

  try {
    return readClearing(ledger, where, reach, write(), idsOf);
  } catch (error) {
    ledger.forget(where.lane);
    throw error;
  }
}

/**
 * {@link copyClearing} for a copy that awaits.
 * @param ledger - The call's ledger
 * @param where - The lane the copy writes to
 * @param reach - Everything the copy may have cleared, whether or not it landed
 * @param write - Makes the copy, in its final shape
 * @param idsOf - The ids of the clips the copy made
 * @param waits - Whether the copy waits on update-clip, so the ledger can't be
 *   trusted for the next copy
 * @returns What the copy made, and what it did to the clips that were there
 */
export async function copyClearingAsync<T>(
  ledger: LaneLedger,
  where: CopyLane,
  reach: Reach,
  write: () => T | Promise<T>,
  idsOf: (made: T) => string[],
  waits: boolean,
): Promise<CopiedClearing<T>> {
  ledger.scan(where.lane, where.api);

  try {
    const read = readClearing(ledger, where, reach, await write(), idsOf);

    if (waits) {
      ledger.forgetAll();
    }

    return read;
  } catch (error) {
    ledger.forget(where.lane);
    throw error;
  }
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
  return {
    made,
    cleared: ledger.afterWrite(where.lane, idsOf(made), {
      api: where.api,
      reach,
    }),
  };
}
