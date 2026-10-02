// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  PARAM_DISABLED_REASON,
  isParamEnabled,
} from "#src/tools/shared/device/helpers/param-writing.ts";
import {
  type ReturnTrackInfo,
  readReturnTrackInfo,
} from "#src/tools/shared/sends/return-track-info.ts";
import {
  type DedupedSends,
  type IndexedSend,
  type SendResult,
  dedupeSendsByReturn,
  readSendBack,
  refusedSend,
} from "#src/tools/shared/sends/send-list.ts";
import { type SendEntry } from "#src/tools/shared/sends/sends-schema.ts";
import { findReturnIndex } from "#src/tools/shared/helpers/send-validation.ts";
import { pairParams } from "#src/tools/shared/validation/lists/paired-values.ts";

/** A send level matched to a return track, ready to write on any track. */
export interface ResolvedSend extends IndexedSend {
  /** The return track's id, for the result entry */
  returnId: string;
}

/** What a call's sends resolved to, for every track it names to report. */
export interface TrackSends extends DedupedSends<ResolvedSend> {
  /** Entries for the sends that named no return track, in the order named */
  unresolved: SendResult[];
}

/**
 * The sends each track takes. sendReturn pairs per track, so the tracks naming
 * the same return share one resolution.
 * @param sendGainDb - Send level in dB, if given
 * @param sendReturn - Return track(s), one for all or one per track, if given
 * @param sends - The `sends` list, as the caller sent it
 * @param count - How many targets the call named
 * @returns The resolved sends for the target at an index
 */
export function trackSendsAt(
  sendGainDb: number | undefined,
  sendReturn: string | undefined,
  sends: SendEntry[] | undefined,
  count: number,
): (index: number) => TrackSends {
  const returnAt = pairParams(
    { sendReturn },
    {
      sendReturn: {
        param: "sendReturn",
        noun: "return",
        item: "track",
        shortfall: "kept their sends",
      },
    },
    count,
  );
  const resolved = new Map<string | undefined, TrackSends>();

  return (index) => {
    const own = returnAt(index).sendReturn;
    let found = resolved.get(own);

    if (found == null) {
      found = resolveTrackSends(sendGainDb, own, sends);
      resolved.set(own, found);
    }

    return found;
  };
}

/**
 * Match every send the call asked for to a return track.
 *
 * The return tracks belong to the Live Set, not to any track being updated, so
 * only the sendReturn a track was given decides this. What matched nothing is
 * reported on that track's entry, so no track is left without an answer
 * (ADR-0042).
 *
 * The scalar pair is resolved first, so a call using both honors both. They
 * only collide when they name the same return, and then the list is the later
 * word.
 * @param sendGainDb - Send level in dB, if given
 * @param sendReturn - Return track id, name, or letter prefix, if given
 * @param sends - The `sends` list, as the caller sent it
 * @returns The sends to write, one per return, in the order they were named,
 *   the returns more than one of them named, and the ones that matched nothing
 */
export function resolveTrackSends(
  sendGainDb: number | undefined,
  sendReturn: string | undefined,
  sends: SendEntry[] | undefined,
): TrackSends {
  // Nothing to resolve, so nothing to read: every update-track call would
  // otherwise pay for the Live Set's return tracks.
  if (sendReturn == null && (sends ?? []).length === 0) {
    return { winners: [], collisions: [], unresolved: [] };
  }

  const returns = readReturnTrackInfo();
  const unresolved: SendResult[] = [];

  // A half pair was refused up front, so either both are set or neither is.
  const scalar =
    sendGainDb != null && sendReturn != null
      ? matchReturn(
          returns,
          { return: sendReturn, gainDb: sendGainDb },
          unresolved,
        )
      : null;

  const list: ResolvedSend[] = [];

  for (const send of sends ?? []) {
    const resolved = matchReturn(returns, send, unresolved);

    if (resolved != null) {
      list.push(resolved);
    }
  }

  return { ...dedupeSendsByReturn(scalar, list), unresolved };
}

/**
 * Write every resolved send on one track and read them back.
 * @param track - Track object
 * @param sends - The winners from {@link resolveTrackSends}
 * @returns What each send now reads, or why it was refused, by its position
 */
export function applyTrackSends(
  track: LiveAPI,
  sends: ResolvedSend[],
): Map<number, SendResult> {
  const landed = new Map<number, SendResult>();

  for (const send of sends) {
    landed.set(send.index, applyTrackSend(track, send));
  }

  return landed;
}

/**
 * Write one resolved send on one track. Whether the track has that send is a
 * fact about the track, so it is checked here rather than once for the call.
 *
 * The level is read back rather than echoed: Live clamps it and hands back a
 * 32-bit float, so the argument is not what the send holds. A send something
 * else owns says so on its own entry — silence means the level landed.
 * @param track - Track object
 * @param send - One send from {@link resolveTrackSends}
 * @returns What the send now reads, or why nothing was written
 */
function applyTrackSend(track: LiveAPI, send: ResolvedSend): SendResult {
  const mixer = track.child("mixer_device");

  if (!mixer.exists()) {
    return refusedSend(send.name, send.returnId, "the track has no mixer");
  }

  const sends = mixer.getChildren("sends");

  if (sends.length === 0) {
    return refusedSend(send.name, send.returnId, "the track has no sends");
  }

  const target = sends[send.index];

  if (target == null) {
    return refusedSend(
      send.name,
      send.returnId,
      "the track has no send for this return",
    );
  }

  if (!isParamEnabled(target)) {
    return refusedSend(
      send.name,
      send.returnId,
      `gainDb ${PARAM_DISABLED_REASON}`,
    );
  }

  target.set("display_value", send.gainDb);

  return readSendBack(target, send.name, send.returnId, send.gainDb);
}

/**
 * Match one send's return, naming the returns it could have named instead
 * @param returns - The Live Set's return tracks
 * @param send - The send, with the return spelled as the caller wrote it
 * @param unresolved - Entries for the sends that matched nothing, added to
 * @returns The resolved send, or null when nothing matched
 */
function matchReturn(
  returns: ReturnTrackInfo[],
  send: SendEntry,
  unresolved: SendResult[],
): ResolvedSend | null {
  const names = returns.map((rt) => rt.name);
  const index = findReturnIndex(
    names,
    send.return,
    returns.map((rt) => rt.id),
  );
  const match = returns[index];

  if (match == null) {
    const available =
      names.length > 0
        ? `Available: ${names.join(", ")}`
        : "the Live Set has no return tracks";

    // Nothing resolved, so there is no id to quote and nothing to write. Every
    // track the call named reports it on its own entry (ADR-0042).
    unresolved.push(
      refusedSend(
        send.return,
        undefined,
        `no return track matching "${send.return}" (${available})`,
      ),
    );

    return null;
  }

  return {
    ...send,
    index,
    name: match.name,
    returnId: match.id,
  };
}
