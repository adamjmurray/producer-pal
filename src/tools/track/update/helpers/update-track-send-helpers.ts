// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { setParamIfEnabled } from "#src/tools/shared/device/helpers/param-write-helpers.ts";
import {
  type DedupedSends,
  type IndexedSend,
  type SendResult,
  dedupeSendsByReturn,
  readSendBack,
} from "#src/tools/shared/sends/send-list-helpers.ts";
import { type SendEntry } from "#src/tools/shared/sends/sends-schema.ts";
import { findReturnIndex } from "#src/tools/shared/utils.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";

/** A send level matched to a return track, ready to write on any track. */
export interface ResolvedSend extends IndexedSend {
  /** The return track's id, for the result entry */
  returnId: string;
}

/**
 * Match every send the call asked for to a return track, once for the whole
 * call.
 *
 * The return tracks belong to the Live Set, not to any track being updated, so
 * nothing about a track decides this. Resolving it per track would repeat one
 * warning down the list (ADR-0009).
 *
 * The scalar pair is resolved first, so a call using both honors both. They
 * only collide when they name the same return, and then the list is the later
 * word.
 * @param sendGainDb - Send level in dB, if given
 * @param sendReturn - Return track id, name, or letter prefix, if given
 * @param sends - The `sends` list, as the caller sent it
 * @returns The sends to write, one per return, in the order they were named,
 *   and the returns more than one of them named
 */
export function resolveTrackSends(
  sendGainDb: number | undefined,
  sendReturn: string | undefined,
  sends: SendEntry[] | undefined,
): DedupedSends<ResolvedSend> {
  // Nothing to resolve, so nothing to read: every update-track call would
  // otherwise pay for the Live Set's return tracks.
  if (sendReturn == null && (sends ?? []).length === 0) {
    return { winners: [], collisions: [] };
  }

  const returns = returnTrackInfo();

  // A half pair was refused up front, so either both are set or neither is.
  const scalar =
    sendGainDb != null && sendReturn != null
      ? matchReturn(
          returns,
          { return: sendReturn, gainDb: sendGainDb },
          `sendReturn "${sendReturn}" names no return track, so sendGainDb was not written`,
        )
      : null;

  const list: ResolvedSend[] = [];

  for (const send of sends ?? []) {
    const resolved = matchReturn(
      returns,
      send,
      `sends entry "${send.return}" names no return track, so its gainDb was not written`,
    );

    if (resolved != null) list.push(resolved);
  }

  return dedupeSendsByReturn(scalar, list);
}

/**
 * Write every resolved send on one track and read them back.
 * @param track - Track object
 * @param sends - The winners from {@link resolveTrackSends}
 * @returns What each send that landed now reads, by its position in the list
 */
export function applyTrackSends(
  track: LiveAPI,
  sends: ResolvedSend[],
): Map<number, SendResult> {
  const landed = new Map<number, SendResult>();

  for (const send of sends) {
    const result = applyTrackSend(track, send);

    if (result != null) landed.set(send.index, result);
  }

  return landed;
}

/**
 * Write one resolved send on one track. Whether the track has that send is a
 * fact about the track, so it is checked here rather than once for the call.
 *
 * The level is read back rather than echoed: Live clamps it and hands back a
 * 32-bit float, so the argument is not what the send holds.
 * @param track - Track object
 * @param send - One send from {@link resolveTrackSends}
 * @returns What the send now reads, or null when nothing was written
 */
function applyTrackSend(track: LiveAPI, send: ResolvedSend): SendResult | null {
  const mixer = track.child("mixer_device");

  if (!mixer.exists()) {
    console.warn(`track ${targetLabel(track)} has no mixer device`);

    return null;
  }

  const sends = mixer.getChildren("sends");

  if (sends.length === 0) {
    console.warn(`track ${targetLabel(track)} has no sends`);

    return null;
  }

  const target = sends[send.index];

  if (target == null) {
    console.warn(
      `track ${targetLabel(track)} has no send for return "${send.return}"`,
    );

    return null;
  }

  const written = setParamIfEnabled(
    target,
    "display_value",
    send.gainDb,
    `track ${targetLabel(track)} send "${send.name}"`,
  );

  return written
    ? readSendBack(target, send.name, send.returnId, send.gainDb)
    : null;
}

/** Name and id of each of the Live Set's return tracks, in send order. */
interface ReturnInfo {
  names: string[];
  ids: string[];
}

/**
 * Read the Live Set's return tracks, in send order
 * @returns Their names and ids
 */
function returnTrackInfo(): ReturnInfo {
  const returnTracks = LiveAPI.from(livePath.liveSet).getChildren(
    "return_tracks",
  );

  return {
    names: returnTracks.map((rt) => rt.getProperty("name") as string),
    ids: returnTracks.map((rt) => rt.id),
  };
}

/**
 * Match one send's return, naming the returns it could have named instead
 * @param returns - The Live Set's return tracks
 * @param send - The send, with the return spelled as the caller wrote it
 * @param problem - What went wrong, in the caller's own param names
 * @returns The resolved send, or null when nothing matched
 */
function matchReturn(
  returns: ReturnInfo,
  send: SendEntry,
  problem: string,
): ResolvedSend | null {
  const index = findReturnIndex(returns.names, send.return, returns.ids);

  if (index === -1) {
    const available =
      returns.names.length > 0
        ? `Available: ${returns.names.join(", ")}`
        : "the Live Set has no return tracks";

    console.warn(`${problem} (${available})`);

    return null;
  }

  return {
    ...send,
    index,
    name: returns.names[index] as string,
    returnId: returns.ids[index] as string,
  };
}
