// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { parseObjectPath } from "#src/tools/shared/validation/object-path.ts";

/**
 * The index a return track path ("rt0") names, or -1 when `value` isn't one.
 * Says nothing about whether that return exists.
 * @param value - What the caller wrote for the return
 * @returns The return track index, or -1
 */
export function returnTrackPathIndex(value: string): number {
  if (!value.trim().startsWith("rt")) {
    return -1;
  }

  try {
    const path = parseObjectPath(value);

    return path.kind === "return-track" ? path.returnIndex : -1;
  } catch {
    return -1;
  }
}

/** The return a send named, and what its spelling had to say. */
export interface ReturnMatch {
  /** Index of the match, or -1 */
  index: number;
  /** Set when the value also named another return. For the send's own entry. */
  clash?: string;
}

/**
 * Find the return (track or rack chain) a send names. Order: id, exact name,
 * path (`pathIndex`, e.g. "rt0"), then letter prefix ("A" finds "A-Reverb" or
 * "a Reverb"); case-insensitive. An exact name beats a prefix, so
 * "Delay" finds "Delay", not "Delay 2". Only these returns' ids count.
 * @param names - Return names in send order
 * @param sendReturn - Id, name, path, or letter to match
 * @param ids - Return ids in send order
 * @param pathIndex - Index `sendReturn` names as a path, if it is one
 * @returns The match, with a clash when the value also fit another return
 */
export function findReturnIndex(
  names: string[],
  sendReturn: string,
  ids: string[] = [],
  pathIndex = -1,
): ReturnMatch {
  const wanted = sendReturn.toLowerCase();

  // Every name "starts with" the empty string, so without this an empty
  // sendReturn would match the first return that has a separator up front.
  if (wanted === "") {
    return { index: -1 };
  }

  const byId = ids.indexOf(sendReturn);
  const exact = names.findIndex((name) => name.toLowerCase() === wanted);

  if (byId !== -1) {
    return exact !== -1 && exact !== byId
      ? {
          index: byId,
          clash: `matched by id; "${sendReturn}" is also the name of "${names[exact]}"`,
        }
      : { index: byId };
  }

  const pathHit = pathIndex >= 0 && pathIndex < names.length;

  if (exact !== -1) {
    return pathHit && exact !== pathIndex
      ? {
          index: exact,
          clash: `matched by name; "${sendReturn}" is also a path to "${names[pathIndex]}"`,
        }
      : { index: exact };
  }

  if (pathHit) {
    return { index: pathIndex };
  }

  return {
    index: names.findIndex((name) => {
      const lower = name.toLowerCase();
      const next = lower[wanted.length];

      return lower.startsWith(wanted) && (next === "-" || next === " ");
    }),
  };
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
