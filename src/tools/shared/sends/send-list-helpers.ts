// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/max/v8-max-console.ts";
import { type SendEntry } from "#src/tools/shared/sends/sends-schema.ts";

/** A `sends` entry paired with the return it resolved to. */
export interface MatchedSend<T extends SendEntry> {
  index: number;
  send: T;
}

/**
 * Keep one entry per return, and say so when two named the same one.
 *
 * A send holds one value, so the last entry naming a return is the one that
 * survives the call. The warning is what the caller sees, so it names the level
 * that held rather than the one that lost — which is why collisions are
 * announced after the whole list, not as they happen.
 * @param matched - Every entry that resolved, in the order the caller sent them
 * @param scalarIndex - Return the sendGainDb/sendReturn pair used, or null
 * @param onScalarOverride - Run when the list overrode the scalar pair, so the
 *   caller can stop reporting a value the send no longer has
 * @returns One entry per return, holding the value that won
 */
export function dedupeSendsByReturn<T extends SendEntry>(
  matched: MatchedSend<T>[],
  scalarIndex: number | null,
  onScalarOverride: () => void,
): T[] {
  const byReturn = new Map<number, T>();
  const collided = new Set<number>();

  for (const { index, send } of matched) {
    if (byReturn.has(index) || index === scalarIndex) {
      collided.add(index);
    }

    byReturn.set(index, send);
  }

  for (const index of collided) {
    const winner = byReturn.get(index) as T;
    const held = `"${winner.return}" ended up at ${winner.gainDb} dB`;

    if (index === scalarIndex) {
      console.warn(`sends overrides sendGainDb/sendReturn: ${held}`);
      onScalarOverride();
    } else {
      console.warn(`sends names one return more than once: ${held}`);
    }
  }

  return [...byReturn.values()];
}
