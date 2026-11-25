// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic), Claude Code (Anthropic)
// SPDX-License-Identifier: MIT

import { refuseNamedTwice } from "#src/tools/shared/helpers/param-presence.ts";
import { parseObjectPath } from "#src/tools/shared/validation/object-path.ts";

/**
 * The index a return track path ("rt0") names, or -1 when `value` isn't one.
 * Says nothing about whether that return exists.
 * @param value - What the caller wrote for the return
 * @returns The return track index, or -1
 */
export function returnTrackPathIndex(value: string): number {
  // Every other way a send names its return ignores case, so the path does too.
  const wanted = value.trim().toLowerCase();

  if (!wanted.startsWith("rt")) {
    return -1;
  }

  try {
    const path = parseObjectPath(wanted);

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

/** The send params of a track or chain update, as the caller sent them. */
export interface SendParams {
  sendGainDb?: number;
  sendReturn?: string;
  sends?: unknown[];
}

/**
 * Refuse a call whose send params can't go together, before any target is
 * touched.
 *
 * `sends` can't be sent beside the deprecated sendGainDb/sendReturn pair,
 * whatever the values: no caller has a reason to send both. Half the pair names
 * no send at all, so there is nothing to write — and it is the same value for
 * every target, so a per-target skip would repeat one warning down the whole
 * list.
 * @param params - The call's send params
 * @throws Error when `sends` comes with either of the pair, or the pair is
 *   missing one half
 */
export function validateSendParams(params: SendParams): void {
  const { sendGainDb, sendReturn, sends } = params;

  refuseNamedTwice({
    param: "sends",
    value: sends,
    noun: "send",
    also: { sendGainDb, sendReturn },
    hint: "sendGainDb and sendReturn are deprecated",
  });

  if ((sendGainDb != null) !== (sendReturn != null)) {
    throw new Error("sendGainDb and sendReturn must both be specified");
  }
}
