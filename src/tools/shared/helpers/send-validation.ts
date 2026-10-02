// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/max/v8-max-console.ts";

/**
 * Find the return (track or rack chain) a send refers to, by id or by name.
 *
 * An id wins: it is exact, and unlike a name it can't be shared by two returns
 * or shift when one is renamed. Only these returns' ids count, so a return
 * named after a number stays reachable by name.
 *
 * Otherwise the exact name, then its letter prefix — "A" matches "A-Reverb"
 * (return tracks) and "a Reverb" (rack return chains). Case-insensitive. An
 * exact name anywhere in the list beats a prefix match, so "Delay" finds
 * "Delay", not "Delay 2".
 * @param names - Return names in send order
 * @param sendReturn - Id, name, or letter to match
 * @param ids - Return ids in send order
 * @returns Index of the match, or -1
 */
export function findReturnIndex(
  names: string[],
  sendReturn: string,
  ids: string[] = [],
): number {
  const wanted = sendReturn.toLowerCase();

  // Every name "starts with" the empty string, so without this an empty
  // sendReturn would match the first return that has a separator up front.
  if (wanted === "") {
    return -1;
  }

  const byId = ids.indexOf(sendReturn);
  const exact = names.findIndex((name) => name.toLowerCase() === wanted);

  if (byId !== -1) {
    if (exact !== -1 && exact !== byId) {
      console.warn(
        `sendReturn "${sendReturn}" is the id of "${names[byId]}" and the name of another return; using the id`,
      );
    }

    return byId;
  }

  if (exact !== -1) {
    return exact;
  }

  return names.findIndex((name) => {
    const lower = name.toLowerCase();
    const next = lower[wanted.length];

    return lower.startsWith(wanted) && (next === "-" || next === " ");
  });
}

/**
 * Refuse a call that names only half of the sendGainDb/sendReturn pair.
 *
 * Half a pair names no send at all, so there is nothing to write — and it is
 * the same value for every target, so a per-target skip would repeat one
 * warning down the whole list. Refusing up front costs nothing: no target has
 * been touched yet.
 * @param sendGainDb - Send level in dB, if given
 * @param sendReturn - The return the level applies to, if given
 */
export function validateSendPair(
  sendGainDb: number | undefined,
  sendReturn: string | undefined,
): void {
  if ((sendGainDb != null) !== (sendReturn != null)) {
    throw new Error("sendGainDb and sendReturn must both be specified");
  }
}
