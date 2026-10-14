// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  differsAtPublishedResolution,
  publishedReadBack,
  readBackDetail,
} from "#src/tools/shared/helpers/read-back-comparison.ts";
import {
  joinDetails,
  markSuperseded,
} from "#src/tools/shared/helpers/entry-details.ts";
import {
  namedAgain,
  replacementFailedDetail,
} from "#src/tools/shared/validation/lists/named-targets.ts";
import { type SendEntry } from "#src/tools/shared/sends/sends-schema.ts";
import { roundGainDb } from "#src/tools/shared/helpers/rounding.ts";

/** The params that ask for a send write, on a track or a chain. */
export const SEND_PARAMS = ["sends", "sendGainDb", "sendReturn"] as const;

/** A `sends` entry paired with the return it resolved to. */
export interface IndexedSend extends SendEntry {
  /** Position in the sends list of the object being written */
  index: number;
  /** The resolved return's own name, as a result names the return */
  name: string;
  /** The return's id, for the result entry */
  returnId: string;
  /** Set when the return was spelled as two returns; goes on the entry */
  clash?: string;
}

/** One send as a result reports it, keyed by the return that resolved. */
export interface SendResult {
  return: string;
  /** Omitted when no return lines up with this send */
  returnId?: string;
  /** A number, or the label Live shows when the level isn't one ("-inf").
   * Absent only when nothing was written. */
  gainDb?: unknown;
  /** Only on a send nothing was written to */
  ok?: false;
  /** Why the level isn't the one asked for, or why nothing was written */
  detail?: string;
}

/**
 * Read a send's level back off Live, so a write result says what landed rather
 * than what was asked for — Live clamps the level and hands back a 32-bit float.
 *
 * The `detail` marks a level Live didn't keep, which is the only one a result
 * reports: a send that took the level asked for has nothing to say. The entry
 * is built either way, because a collision names the level the send ended up at.
 * @param send - The send DeviceParameter
 * @param name - The resolved return's name
 * @param id - The resolved return's id, when there is one
 * @param written - The level just written
 * @returns The entry to report for this send
 */
export function readSendBack(
  send: LiveAPI,
  name: string,
  id: string | undefined,
  written: number,
): SendResult {
  // Published the way a read publishes it. The level written stands in only
  // when nothing reads back at all, so a level that landed can't vanish from
  // the result — an omission reads as "no write".
  const landed =
    publishedReadBack(send.getProperty("display_value"), roundGainDb) ??
    written;
  const detail = readBackDetail(
    differsAtPublishedResolution(written, landed, roundGainDb)
      ? ["gainDb"]
      : [],
  );

  return {
    return: name,
    // The id is what a write should quote back: names collide and get renamed,
    // and `sends` accepts either.
    ...(id == null ? {} : { returnId: id }),
    gainDb: landed,
    ...(detail == null ? {} : { detail }),
  };
}

/**
 * Add to what a send's entry says, keeping any detail already on it.
 * @param entry - The send's entry
 * @param detail - What to add, if anything
 * @returns The entry, with the detail joined on
 */
export function withDetail(
  entry: SendResult,
  detail: string | undefined,
): SendResult {
  return detail == null
    ? entry
    : { ...entry, detail: joinDetails([entry.detail, detail]) };
}

/**
 * Add what a send's return spelling had to say to its entry, keeping any detail
 * already on it.
 * @param entry - The send's entry
 * @param clash - The clash `findReturnIndex` found, if any
 * @returns The entry, with the clash in its detail
 */
export function withClash(
  entry: SendResult,
  clash: string | undefined,
): SendResult {
  return withDetail(entry, clash);
}

/**
 * The entry for a send nothing was written to. It has no level the call put
 * there, so it carries the detail in place of one.
 * @param name - The resolved return's name
 * @param id - The resolved return's id, when there is one
 * @param detail - Why nothing was written
 * @returns The entry to report for this send
 */
export function refusedSend(
  name: string,
  id: string | undefined,
  detail: string,
): SendResult {
  return {
    return: name,
    ...(id == null ? {} : { returnId: id }),
    ok: false,
    detail,
  };
}

/**
 * Read a send's level for a pure read (no write behind it, so there is no
 * written value to fall back on). Unlike {@link readSendBack}, this rounds a
 * value Max serialized as a numeric string instead of passing the raw text
 * through — a read has nothing else to report.
 * @param send - The send DeviceParameter
 * @param name - The resolved return's name
 * @param id - The resolved return's id, when there is one
 * @returns The entry to report for this send
 */
export function readSendGainDb(
  send: LiveAPI,
  name: string,
  id?: string,
): SendResult {
  return {
    return: name,
    ...(id == null ? {} : { returnId: id }),
    gainDb: publishedReadBack(send.getProperty("display_value"), roundGainDb),
  };
}

/** What a dedupe decided: the entries that hold, and the ones they replaced. */
export interface DedupedSends<T extends IndexedSend> {
  winners: T[];
  collisions: SendCollision<T>[];
}

/** One return that more than one entry named. */
export interface SendCollision<T extends IndexedSend> {
  /** Position in the sends list, matching the winner's `index` */
  index: number;
  /** The earlier entries the winner replaced, in the order they were named */
  superseded: T[];
  /** The winner's return, as the caller spelled it */
  by: string;
}

/**
 * Keep one entry per return across the sendGainDb/sendReturn pair and the
 * `sends` list.
 *
 * A send holds one value, so the last entry naming a return is the one that
 * survives the call. The entries it replaced come back in `collisions`, for the
 * result to say so (see {@link withSupersededSends}).
 * @param scalar - The sendGainDb/sendReturn pair once resolved, or null
 * @param list - Every `sends` entry that resolved, in the order it was sent
 * @returns One entry per return, and the entries each one replaced
 */
export function dedupeSendsByReturn<T extends IndexedSend>(
  scalar: T | null,
  list: T[],
): DedupedSends<T> {
  const byReturn = new Map<number, T>();
  const superseded = new Map<number, T[]>();
  const scalarIndex = scalar?.index ?? null;

  for (const send of list) {
    const earlier = byReturn.get(send.index);
    // The pair wrote first, so the list overwrites it.
    const replaced =
      earlier ?? (send.index === scalarIndex ? scalar : undefined);

    if (replaced != null) {
      const held = superseded.get(send.index) ?? [];

      held.push(replaced);
      superseded.set(send.index, held);
    }

    byReturn.set(send.index, send);
  }

  // The pair no longer describes a send the list overwrote — stop reporting a
  // value it doesn't have.
  const scalarHeld = scalar != null && !superseded.has(scalar.index);
  const winners = [...byReturn.values()];

  return {
    winners: scalarHeld ? [scalar, ...winners] : winners,
    collisions: [...superseded].map(([index, replaced]) => ({
      index,
      superseded: replaced,
      by: (byReturn.get(index) as T).return,
    })),
  };
}

/**
 * Every send's entry, each preceded by the entries it replaced. A send named
 * again later wasn't written, and says so in its `detail` with no `ok`, since
 * the later send did the work. If the later send's own write was refused,
 * nothing replaced it after all: the earlier ones are `ok: false` and say so.
 * @param landed - What each send that was written now reads, by its position
 * @param collisions - From {@link dedupeSendsByReturn}
 * @returns The entries in the order the sends were named
 */
export function withSupersededSends<T extends IndexedSend>(
  landed: Map<number, SendResult>,
  collisions: SendCollision<T>[],
): SendResult[] {
  const entries: SendResult[] = [];

  for (const [index, entry] of landed) {
    const collision = collisions.find((c) => c.index === index);

    for (const send of collision?.superseded ?? []) {
      const base = { return: send.name, returnId: send.returnId };

      entries.push(
        entry.ok === false
          ? {
              ...base,
              ok: false,
              detail: joinDetails([
                replacementFailedDetail(`"${collision?.by}"`),
                send.clash,
              ]),
            }
          : markSuperseded({
              ...base,
              detail: joinDetails([namedAgain(), send.clash]),
            }),
      );
    }

    entries.push(entry);
  }

  return entries;
}
