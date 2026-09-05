// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/max/v8-max-console.ts";
import { type SendEntry } from "#src/tools/shared/sends/sends-schema.ts";
import { roundGainDb } from "#src/tools/shared/utils.ts";

/** A `sends` entry paired with the return it resolved to. */
export interface IndexedSend extends SendEntry {
  /** Position in the sends list of the object being written */
  index: number;
  /** The resolved return's own name. Warnings and results both name the return
   * this way, so a warning can't point at a spelling the result never uses. */
  name: string;
}

/** One send as a result reports it, keyed by the return that resolved. */
export interface SendResult {
  return: string;
  /** Omitted when no return lines up with this send */
  returnId?: string;
  gainDb: unknown;
}

/**
 * Read a send's level back off Live, so a write result says what landed rather
 * than what was asked for — Live clamps the level and hands back a 32-bit float.
 * @param send - The send DeviceParameter
 * @param name - The resolved return's name
 * @param id - The resolved return's id, when there is one
 * @param written - The level just written, for a write to fall back on
 * @returns The entry to report for this send
 */
export function readSendBack(
  send: LiveAPI,
  name: string,
  id?: string,
  written?: number,
): SendResult {
  const gainDb = send.getProperty("display_value");

  return {
    return: name,
    // The id is what a write should quote back: names collide and get renamed,
    // and `sends` accepts either.
    ...(id == null ? {} : { returnId: id }),
    // Max hands some floats back as strings, and a level that landed must not
    // vanish from the result over that — an omission reads as "no write".
    gainDb:
      typeof gainDb === "number" ? roundGainDb(gainDb) : (written ?? gainDb),
  };
}

/** What a dedupe decided: the entries that hold, and the clashes to announce. */
export interface DedupedSends<T extends IndexedSend> {
  winners: T[];
  collisions: SendCollision[];
}

/** One return that more than one entry named. */
export interface SendCollision {
  /** Position in the sends list, matching the winner's `index` */
  index: number;
  /** True when the sendGainDb/sendReturn pair was the one overridden */
  overrodeScalar: boolean;
}

/**
 * Keep one entry per return across the sendGainDb/sendReturn pair and the
 * `sends` list.
 *
 * A send holds one value, so the last entry naming a return is the one that
 * survives the call. Which returns clashed comes back rather than being
 * announced here: the warning names the level the send ended up at, and that
 * isn't known until the write has been read back.
 * @param scalar - The sendGainDb/sendReturn pair once resolved, or null
 * @param list - Every `sends` entry that resolved, in the order it was sent
 * @returns One entry per return, and the returns that were named more than once
 */
export function dedupeSendsByReturn<T extends IndexedSend>(
  scalar: T | null,
  list: T[],
): DedupedSends<T> {
  const byReturn = new Map<number, T>();
  const collided = new Set<number>();
  const scalarIndex = scalar?.index ?? null;

  for (const send of list) {
    if (byReturn.has(send.index) || send.index === scalarIndex) {
      collided.add(send.index);
    }

    byReturn.set(send.index, send);
  }

  // The pair wrote first and the list overwrote it, so the pair no longer
  // describes the send — stop reporting a value it doesn't have.
  const scalarHeld = scalarIndex != null && !collided.has(scalarIndex);
  const winners = [...byReturn.values()];

  return {
    winners: scalarHeld && scalar != null ? [scalar, ...winners] : winners,
    collisions: [...collided].map((index) => ({
      index,
      overrodeScalar: index === scalarIndex,
    })),
  };
}

/**
 * Announce the returns that were named more than once, after the writes have
 * been read back so each names the level the send ended up at.
 *
 * Collisions are announced once for the whole call, and after the whole list
 * rather than as they happen: warning per write would name each level that lost
 * to the next one.
 * @param collisions - From {@link dedupeSendsByReturn}
 * @param landed - What each send that was written now reads, by its position.
 *   A collision missing from it is skipped — the write didn't land, so there is
 *   no final level to name, and the failure warned for itself.
 */
export function warnSendCollisions(
  collisions: SendCollision[],
  landed: Map<number, SendResult>,
): void {
  for (const { index, overrodeScalar } of collisions) {
    const entry = landed.get(index);

    if (entry == null) continue;

    const held = `"${entry.return}" ended up at ${String(entry.gainDb)} dB`;

    console.warn(
      overrodeScalar
        ? `sends overrides sendGainDb/sendReturn: ${held}`
        : `sends names one return more than once: ${held}`,
    );
  }
}
