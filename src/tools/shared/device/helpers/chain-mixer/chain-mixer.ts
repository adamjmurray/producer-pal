// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { requestMemo } from "#src/live-api-adapter/live-api-release.ts";
import {
  type TargetNotes,
  isParamSent,
  newTargetNotes,
  noteTarget,
  refuseIfNoneLanded,
  refuseTargetWork,
} from "#src/tools/shared/helpers/target-notes.ts";
import {
  type IndexedSend,
  SEND_PARAMS,
  type SendResult,
  dedupeSendsByReturn,
  readSendBack,
  readSendGainDb,
  refusedSend,
  warnSendCollisions,
} from "#src/tools/shared/sends/send-list.ts";
import {
  asFiniteNumber,
  roundDisplayValue,
  roundGainDb,
  roundPan,
} from "#src/tools/shared/helpers/rounding.ts";
import { findReturnIndex } from "#src/tools/shared/helpers/send-validation.ts";
import {
  type MixerApplied,
  PARAM_DISABLED_REASON,
  isParamEnabled,
  setParamAndReadBack,
} from "../param-writing.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";

export interface ChainSend {
  /** Return chain id, exact name, or letter prefix */
  return: string;
  /** Send level in dB */
  gainDb: number;
}

export interface ChainMixerParams {
  gainDb?: number;
  pan?: number;
  sendGainDb?: number;
  sendReturn?: string;
  sends?: ChainSend[];
}

/** What a chain mixer write landed, read back off the chain. */
export interface ChainMixerApplied extends MixerApplied {
  sends?: SendResult[];
}

/** One send that was written, and the return chain it went to. */
interface WrittenChainSend extends IndexedSend {
  /** The return chain's id, for the result entry */
  returnId: string;
  /** The send parameter, ready to read back */
  param: LiveAPI;
}

/**
 * Read a chain's own mixer (the chain fader, not the devices inside it),
 * reporting only non-default settings: gainDb when not 0 dB, pan when not
 * centered, and sends that are turned up. Empty when everything is default.
 * @param chain - Chain or DrumChain LiveAPI object
 * @returns Object with any of gainDb, pan, sends
 */
export function readChainMixer(chain: LiveAPI): Record<string, unknown> {
  const info: Record<string, unknown> = {};
  const mixer = chain.child("mixer_device");

  if (!mixer.exists()) {
    return info;
  }

  const gainDb = mixer.child("volume").getProperty("display_value");

  // Round before the check, same as pan below.
  const roundedGainDb = roundDisplayValue(gainDb, roundGainDb);

  if (typeof roundedGainDb === "number" && roundedGainDb !== 0) {
    info.gainDb = roundedGainDb;
  }

  const pan = mixer.child("panning").getProperty("value");

  // Round before the check: sub-1% noise is centered as far as Live is
  // concerned, and reporting it as `pan: 0` would contradict "non-default only".
  const roundedPan = roundDisplayValue(pan, roundPan);

  if (typeof roundedPan === "number" && roundedPan !== 0) {
    info.pan = roundedPan;
  }

  const sends = readActiveSends(chain, mixer);

  if (sends.length > 0) {
    info.sends = sends;
  }

  return info;
}

/**
 * Set a chain's own gain, pan, and send levels. A gain or pan Live ignores (a
 * disabled parameter) is refused on the chain's entry; a send that landed
 * nowhere comes back as that send's own refused entry.
 *
 * Every reported value is read back off the chain, not echoed from the
 * argument: Live clamps and snaps what it is given. The sendGainDb/sendReturn
 * pair reports under `sends` alongside the list, so one send has one shape.
 * @param chain - Chain or DrumChain LiveAPI object
 * @param params - Mixer values to set
 * @param notes - What the chain's entry has to say, added to
 * @returns What landed, read back
 */
export function applyChainMixer(
  chain: LiveAPI,
  params: ChainMixerParams,
  notes: TargetNotes,
): ChainMixerApplied {
  const applied: ChainMixerApplied = {};
  const mixer = chain.child("mixer_device");

  if (!mixer.exists()) {
    const sent = Object.entries(params)
      .filter(([, value]) => isParamSent(value))
      .map(([key]) => key);

    // A carry or copy with nothing to write asked for nothing.
    if (sent.length > 0) {
      refuseTargetWork(notes, sent, "the chain has no mixer device");
    }

    return applied;
  }

  const gainDb = setParamAndReadBack(
    mixer.child("volume"),
    "display_value",
    params.gainDb,
    "gainDb",
    roundGainDb,
    notes,
  );

  if (gainDb != null) {
    applied.gainDb = gainDb;
  }

  const pan = setParamAndReadBack(
    mixer.child("panning"),
    "value",
    params.pan,
    "pan",
    roundPan,
    notes,
  );

  if (pan != null) {
    applied.pan = pan;
  }

  const sends = applyChainSends(chain, mixer, params);

  refuseIfNoneLanded(notes, SEND_PARAMS, "send", sends, (send) => send.return);

  if (sends.length > 0) {
    applied.sends = sends;
  }

  return applied;
}

/**
 * Write a mixer onto a chain the call didn't name — a carry or a copy. What
 * didn't land is a detail on the entry that did, naming the chain.
 * @param chain - The chain to write onto
 * @param params - Mixer values to set
 * @param notes - What the named target's entry has to say, added to
 * @returns What landed, read back
 */
export function applyChainMixerAside(
  chain: LiveAPI,
  params: ChainMixerParams,
  notes?: TargetNotes,
): ChainMixerApplied {
  const own = newTargetNotes();
  const applied = applyChainMixer(chain, params, own);
  const refusedSends = (applied.sends ?? [])
    .filter((send) => send.ok === false)
    .map((send) => `send "${send.return}" ${send.detail}`);

  for (const said of [...own.said, ...refusedSends]) {
    noteTarget(notes, `${chainLabel(chain)}: ${said}`);
  }

  return applied;
}

/**
 * Live API path of the rack a chain belongs to
 * @param chain - Chain or DrumChain LiveAPI object
 * @returns The rack's path
 */
export function rackPath(chain: LiveAPI): string {
  return chain.path.replace(/ (?:return_)?chains \d+$/, "");
}

/**
 * Write one send on a chain's mixer, matched to the rack's return chains by
 * name or id
 * @param chain - Chain the mixer belongs to
 * @param mixer - The chain's mixer device
 * @param send - The send to write, with the return spelled as the caller wrote it
 * @param refused - Entries for the sends nothing was written to, added to
 * @returns The send and the return it went to, or null when nothing was written
 */
function applyChainSend(
  chain: LiveAPI,
  mixer: LiveAPI,
  send: ChainSend,
  refused: SendResult[],
): WrittenChainSend | null {
  const returns = returnChainInfo(chain);
  const names = returns.map((rc) => rc.name);
  const index = findReturnIndex(
    names,
    send.return,
    returns.map((rc) => rc.id),
  );

  if (index === -1) {
    // The "none" case is where a model would otherwise try to add one, so say
    // it can't be done here — racks expose no way to create a return chain.
    const available =
      names.length > 0
        ? ` (returns: ${names.join(", ")})`
        : " (rack has no return chains; they can only be added in Live)";

    // A fact about the chain the call named, so it rides back on that chain's
    // own entry (ADR-0042).
    refused.push(
      refusedSend(
        send.return,
        undefined,
        `no return chain matching "${send.return}"${available}`,
      ),
    );

    return null;
  }

  const param = mixer.getChildAt("sends", index);

  if (param == null) {
    refused.push(
      refusedSend(
        send.return,
        returns[index]?.id,
        "the chain has no send for this return",
      ),
    );

    return null;
  }

  const info = returns[index] as { name: string; id: string };

  if (!isParamEnabled(param)) {
    refused.push(
      refusedSend(info.name, info.id, `gainDb ${PARAM_DISABLED_REASON}`),
    );

    return null;
  }

  param.set("display_value", send.gainDb);

  return { ...send, index, name: info.name, returnId: info.id, param };
}

/**
 * Write the sendGainDb/sendReturn pair and the `sends` list, and report one
 * entry per return, read back off the chain
 * @param chain - Chain or DrumChain LiveAPI object
 * @param mixer - The chain's mixer device
 * @param params - Mixer values to set
 * @returns One entry per return that landed, plus one per send that didn't
 */
function applyChainSends(
  chain: LiveAPI,
  mixer: LiveAPI,
  params: ChainMixerParams,
): SendResult[] {
  const { sendGainDb, sendReturn } = params;
  const refused: SendResult[] = [];

  // A half pair was refused up front, so either both are set or neither is.
  const scalar =
    sendGainDb != null && sendReturn != null
      ? applyChainSend(
          chain,
          mixer,
          { return: sendReturn, gainDb: sendGainDb },
          refused,
        )
      : null;

  // After the scalar pair, so a call using both honors both. They only collide
  // when they name the same return, and then the list is the later word.
  const list: WrittenChainSend[] = [];

  for (const send of params.sends ?? []) {
    const written = applyChainSend(chain, mixer, send, refused);

    if (written != null) {
      list.push(written);
    }
  }

  const { winners, collisions } = dedupeSendsByReturn(scalar, list);
  const landed = new Map(
    winners.map((send) => [
      send.index,
      readSendBack(send.param, send.name, send.returnId, send.gainDb),
    ]),
  );

  // After the read-back, so a collision names the level the send ended up at
  // rather than the one that won the argument list.
  warnSendCollisions(collisions, landed);

  return [...landed.values(), ...lastPerReturn(refused)];
}

/**
 * Keep one refused send per return chain, the last one named: a send holds one
 * value, so a return named twice is one write that didn't land. A send that
 * matched no return has no id and keeps its own entry.
 * @param refused - The refused sends, in the order they were named
 * @returns The same entries, one per return chain
 */
function lastPerReturn(refused: SendResult[]): SendResult[] {
  return refused.filter(
    (send, index) =>
      send.returnId == null ||
      !refused
        .slice(index + 1)
        .some((later) => later.returnId === send.returnId),
  );
}

/**
 * Name a chain for a note, adding its Live name when it has one
 * @param chain - Chain or DrumChain LiveAPI object
 * @returns Label like `chain "Kick" t0/d0/c1 (id 7)`
 */
export function chainLabel(chain: LiveAPI): string {
  const name = chain.getProperty("name") as string | undefined;
  const label = targetLabel(chain);

  return name ? `chain "${name}" ${label}` : `chain ${label}`;
}

/**
 * Read the sends that are turned up, named after the rack's return chains
 * @param chain - Chain the mixer belongs to
 * @param mixer - The chain's mixer device
 * @returns Active sends as {return, returnId, gainDb}
 */
function readActiveSends(chain: LiveAPI, mixer: LiveAPI): SendResult[] {
  const active = mixer
    .getChildren("sends")
    .map((send, index) => ({ send, index }))
    .filter(({ send }) => {
      const value = asFiniteNumber(send.getProperty("value"));

      return value != null && value > 0;
    });

  if (active.length === 0) {
    return [];
  }

  const returns = returnChainInfo(chain);

  return active.map(({ send, index }) => {
    const info = returns[index];
    const rawName = info?.name;
    // getName() reports "" (not null/undefined) for a nameless return chain,
    // so an empty name needs the fallback too, not just a missing one.
    const name =
      rawName == null || rawName === "" ? `Return ${index + 1}` : rawName;

    return readSendGainDb(send, name, info?.id);
  });
}

/**
 * Name and id of each return chain of the rack that owns a chain, in send
 * order. Memoized per request, since every chain of a rack asks for it; nothing
 * adds or removes a return chain mid-request. Keyed by the rack's id, not its
 * path: a device moved or deleted mid-request can put a different rack at the
 * old path. Names are read fresh, since one call can rename a return chain and
 * then send to it.
 * @param chain - Chain or DrumChain LiveAPI object
 * @returns Return chain names and ids, index-aligned with the chain's sends
 */
function returnChainInfo(chain: LiveAPI): { name: string; id: string }[] {
  const rack = LiveAPI.from(rackPath(chain));

  const chains = requestMemo(`return-chain-info ${rack.id}`, () =>
    rack.getChildren("return_chains"),
  );

  return chains.map((rc) => ({
    name: rc.getName(),
    id: rc.id,
  }));
}
