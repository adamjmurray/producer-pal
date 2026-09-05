// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { requestMemo } from "#src/live-api-adapter/live-api-release.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  type IndexedSend,
  type SendResult,
  dedupeSendsByReturn,
  readSendBack,
  warnSendCollisions,
} from "#src/tools/shared/sends/send-list-helpers.ts";
import {
  findReturnIndex,
  roundGainDb,
  roundPan,
} from "#src/tools/shared/utils.ts";
import {
  type MixerApplied,
  setParamAndReadBack,
  setParamIfEnabled,
} from "./param-write-helpers.ts";
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

export interface ChainMixerCarry {
  /** Mixer values read off the source chain */
  mixer: Record<string, unknown>;
  /** The source chain, named for the announcement */
  from: string;
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
  const roundedGainDb = typeof gainDb === "number" ? roundGainDb(gainDb) : null;

  if (roundedGainDb != null && roundedGainDb !== 0) {
    info.gainDb = roundedGainDb;
  }

  const pan = mixer.child("panning").getProperty("value");

  // Round before the check: sub-1% noise is centered as far as Live is
  // concerned, and reporting it as `pan: 0` would contradict "non-default only".
  if (typeof pan === "number" && roundPan(pan) !== 0) {
    info.pan = roundPan(pan);
  }

  const sends = readActiveSends(chain, mixer);

  if (sends.length > 0) {
    info.sends = sends;
  }

  return info;
}

/**
 * Set a chain's own gain, pan, and send levels. A write Live ignores (a disabled
 * parameter, an unmatched return) warns and is left out of the result.
 *
 * Every reported value is read back off the chain, not echoed from the
 * argument: Live clamps and snaps what it is given. The sendGainDb/sendReturn
 * pair reports under `sends` alongside the list, so one send has one shape.
 * @param chain - Chain or DrumChain LiveAPI object
 * @param params - Mixer values to set
 * @returns What landed, read back
 */
export function applyChainMixer(
  chain: LiveAPI,
  params: ChainMixerParams,
): ChainMixerApplied {
  const applied: ChainMixerApplied = {};
  const mixer = chain.child("mixer_device");

  if (!mixer.exists()) {
    console.warn(`${chainLabel(chain)} has no mixer device`);

    return applied;
  }

  const gainDb = setParamAndReadBack(
    mixer.child("volume"),
    "display_value",
    params.gainDb,
    `${chainLabel(chain)} gainDb`,
    roundGainDb,
  );

  if (gainDb != null) {
    applied.gainDb = gainDb;
  }

  const pan = setParamAndReadBack(
    mixer.child("panning"),
    "value",
    params.pan,
    `${chainLabel(chain)} pan`,
    roundPan,
  );

  if (pan != null) {
    applied.pan = pan;
  }

  const sends = applyChainSends(chain, mixer, params);

  if (sends.length > 0) {
    applied.sends = sends;
  }

  return applied;
}

/**
 * Warn when a device is moved or copied out of a chain whose mixer is
 * non-default. The chain fader belongs to the chain, so it doesn't follow the
 * device — a common surprise on device-based drum pad moves.
 * @param chain - The chain the device came out of, from {@link sourceChain}
 * @param destination - Container the device went into (chain or track)
 * @param isCopy - True when the device is being copied, not moved
 */
export function warnIfChainMixerLeftBehind(
  chain: LiveAPI | null,
  destination: LiveAPI,
  isCopy = false,
): void {
  if (chain == null || chain.id === destination.id) {
    return;
  }

  const mixer = readChainMixer(chain);

  if (Object.keys(mixer).length === 0) {
    return;
  }

  // A track destination has no chain fader to reapply onto, so it needs
  // update-track instead.
  const toChain = destination.type.endsWith("Chain");
  const tool = toChain ? "update-device" : "update-track";
  const where = toChain ? "destination chain" : "destination track";
  const hint = padHint(chain, destination, isCopy);

  const verb = isCopy ? "does not follow the copy" : "stays behind";

  console.warn(
    `${chainLabel(chain)} trim (${summarizeChainMixer(mixer)}) ${verb} — reapply on the ${where} with ${tool} gainDb/pan/sendGainDb+sendReturn${hint}`,
  );
}

/**
 * The chain a device currently sits in, or null when it sits directly on a
 * track. The chain fader belongs to the chain, so this is the thing a device
 * move leaves behind. Read it before the move: afterward a moved device answers
 * with the chain it landed in.
 * @param device - The device to look up from
 * @returns The chain, or null when there isn't one
 */
export function sourceChain(device: LiveAPI): LiveAPI | null {
  const chainPath = device.path.replace(/ devices \d+$/, "");

  if (!/ (?:return_)?chains \d+$/.test(chainPath)) {
    return null;
  }

  const chain = LiveAPI.from(chainPath);

  return chain.exists() ? chain : null;
}

/**
 * The source chain's mixer, when carrying it onto the destination can't disturb
 * anything — the destination is a chain holding no devices of its own, with a
 * mixer still at defaults. That is what an auto-created pad chain looks like,
 * so the trim follows the sound instead of stranding on the chain it left.
 *
 * Anything else keeps its own fader: a chain already holding devices would have
 * them re-levelled by a write the caller never asked for, and a non-default trim
 * is someone's deliberate setting. Those cases warn instead.
 *
 * So does a destination in a different rack. Sends are matched by return-chain
 * name, which only lines up within one rack, so a cross-rack carry writes the
 * gain and pan and drops the sends — a partial trim nobody asked for.
 *
 * Must be called BEFORE the move — afterward the destination holds the device
 * and no longer reads as untouched.
 * @param chain - The chain the device is coming out of, from {@link sourceChain}
 * @param destination - Container the device is going into (chain or track)
 * @returns The mixer to carry and where it came from, or null to leave the
 *   destination alone
 */
export function chainMixerToCarry(
  chain: LiveAPI | null,
  destination: LiveAPI,
): ChainMixerCarry | null {
  if (chain == null || chain.id === destination.id) {
    return null;
  }

  const mixer = readChainMixer(chain);

  // Nothing to carry, or a track destination with no chain fader to carry onto.
  if (
    Object.keys(mixer).length === 0 ||
    !destination.type.endsWith("Chain") ||
    rackPath(chain) !== rackPath(destination) ||
    destination.getChildCount("devices") > 0 ||
    Object.keys(readChainMixer(destination)).length > 0
  ) {
    return null;
  }

  return { mixer, from: chainLabel(chain) };
}

/**
 * Apply a mixer read off one chain onto another, and say so: the caller asked
 * to move a device, not to touch a fader. Sends go one at a time so they match
 * by return-chain name rather than by index.
 *
 * Announce afterward, naming what landed. A disabled parameter warns and is
 * skipped, so announcing the intent up front contradicts the very next warning.
 * @param carry - Mixer values from {@link chainMixerToCarry}
 * @param destination - Chain to write them onto
 */
export function carryChainMixer(
  carry: ChainMixerCarry,
  destination: LiveAPI,
): void {
  const { mixer } = carry;
  const applied = applyChainMixer(destination, {
    gainDb: mixer.gainDb as number | undefined,
    pan: mixer.pan as number | undefined,
  });
  const sends = (mixer.sends ?? []) as { return: string; gainDb: number }[];
  const landedSends = sends.flatMap(
    (send) =>
      applyChainMixer(destination, {
        sendGainDb: send.gainDb,
        sendReturn: send.return,
      }).sends ?? [],
  );

  // applied holds only gainDb and pan — the sends went through their own calls.
  const landed: Record<string, unknown> = { ...applied };

  if (landedSends.length > 0) {
    landed.sends = landedSends;
  }

  if (Object.keys(landed).length === 0) {
    console.warn(
      `${carry.from} trim could not be carried onto the destination chain — it stays on the chain the device left`,
    );

    return;
  }

  console.warn(
    `${carry.from} trim (${summarizeChainMixer(landed)}) carried onto the destination chain, which was empty and at defaults`,
  );
}

/**
 * The whole-pad alternative to offer, when there is one. Both operations keep
 * the chain — and so the trim — intact, instead of moving a device out of it.
 * Both also stay within one rack, so only offer them when the destination is
 * another pad of the same rack — otherwise the suggestion is refused.
 * @param chain - The chain being left behind
 * @param destination - Container the device is going into
 * @param isCopy - True when the device is being copied, not moved
 * @returns Text to append to the warning, or "" when nothing applies
 */
function padHint(
  chain: LiveAPI,
  destination: LiveAPI,
  isCopy: boolean,
): string {
  if (
    chain.type !== "DrumChain" ||
    destination.type !== "DrumChain" ||
    rackPath(chain) !== rackPath(destination)
  ) {
    return "";
  }

  return isCopy
    ? " or copy the whole pad instead (duplicate type 'drum-pad' with the pad path and toPath), which brings the trim with it"
    : " or move the whole pad instead (update-device with the pad path and toPath)";
}

/**
 * Live API path of the rack a chain belongs to
 * @param chain - Chain or DrumChain LiveAPI object
 * @returns The rack's path
 */
function rackPath(chain: LiveAPI): string {
  return chain.path.replace(/ (?:return_)?chains \d+$/, "");
}

/**
 * Summarize a chain mixer for a warning. Sends are counted, not listed: a
 * factory kit routes most pads to several returns, and the full list buries the
 * warning in text the reader can get from read-device.
 * @param mixer - Result of readChainMixer
 * @returns Compact description, e.g. "gainDb -15, 5 sends"
 */
function summarizeChainMixer(mixer: Record<string, unknown>): string {
  const parts: string[] = [];

  if (typeof mixer.gainDb === "number") {
    parts.push(`gainDb ${mixer.gainDb}`);
  }

  if (typeof mixer.pan === "number") {
    parts.push(`pan ${mixer.pan}`);
  }

  const sends = mixer.sends as unknown[] | undefined;

  if (sends != null && sends.length > 0) {
    parts.push(`${sends.length} send${sends.length === 1 ? "" : "s"}`);
  }

  return parts.join(", ");
}

/**
 * Write one send on a chain's mixer, matched to the rack's return chains by
 * name or id
 * @param chain - Chain the mixer belongs to
 * @param mixer - The chain's mixer device
 * @param send - The send to write, with the return spelled as the caller wrote it
 * @returns The send and the return it went to, or null when nothing was written
 */
function applyChainSend(
  chain: LiveAPI,
  mixer: LiveAPI,
  send: ChainSend,
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

    console.warn(
      `${chainLabel(chain)}: no return chain matching "${send.return}"${available}`,
    );

    return null;
  }

  const param = mixer.getChildAt("sends", index);

  if (param == null) {
    console.warn(
      `${chainLabel(chain)} has no send for return "${send.return}"`,
    );

    return null;
  }

  const info = returns[index] as { name: string; id: string };

  if (
    !setParamIfEnabled(
      param,
      "display_value",
      send.gainDb,
      `${chainLabel(chain)} send "${info.name}"`,
    )
  ) {
    return null;
  }

  return { ...send, index, name: info.name, returnId: info.id, param };
}

/**
 * Write the sendGainDb/sendReturn pair and the `sends` list, and report one
 * entry per return, read back off the chain
 * @param chain - Chain or DrumChain LiveAPI object
 * @param mixer - The chain's mixer device
 * @param params - Mixer values to set
 * @returns One entry per return that landed
 */
function applyChainSends(
  chain: LiveAPI,
  mixer: LiveAPI,
  params: ChainMixerParams,
): SendResult[] {
  const { sendGainDb, sendReturn } = params;

  // A half pair was refused up front, so either both are set or neither is.
  const scalar =
    sendGainDb != null && sendReturn != null
      ? applyChainSend(chain, mixer, { return: sendReturn, gainDb: sendGainDb })
      : null;

  // After the scalar pair, so a call using both honors both. They only collide
  // when they name the same return, and then the list is the later word.
  const list: WrittenChainSend[] = [];

  for (const send of params.sends ?? []) {
    const written = applyChainSend(chain, mixer, send);

    if (written != null) list.push(written);
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

  return [...landed.values()];
}

/**
 * Name a chain for a warning, adding its Live name when it has one
 * @param chain - Chain or DrumChain LiveAPI object
 * @returns Label like `chain "Kick" t0/d0/c1 (id 7)`
 */
function chainLabel(chain: LiveAPI): string {
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
      const value = send.getProperty("value");

      return typeof value === "number" && value > 0;
    });

  if (active.length === 0) {
    return [];
  }

  const returns = returnChainInfo(chain);

  return active.map(({ send, index }) => {
    const info = returns[index];

    return readSendBack(send, info?.name ?? `Return ${index + 1}`, info?.id);
  });
}

/**
 * Name and id of each return chain of the rack that owns a chain, in send
 * order. The chain list itself is memoized per request — every chain of a
 * rack asks for the same list, and a 64-pad kit resolving it per pad doubled
 * the cost of reading the kit. Nothing creates or deletes a return chain
 * mid-request, so the list and its ids can't go stale under us — but `name`
 * can: a multi-id update-device call can rename one return chain and then
 * send to it by the new name in the same request, so it's read fresh off the
 * memoized objects on every call instead of cached alongside them.
 * @param chain - Chain or DrumChain LiveAPI object
 * @returns Return chain names and ids, index-aligned with the chain's sends
 */
function returnChainInfo(chain: LiveAPI): { name: string; id: string }[] {
  const path = rackPath(chain);

  const chains = requestMemo(`return-chain-info ${path}`, () =>
    LiveAPI.from(path).getChildren("return_chains"),
  );

  return chains.map((rc) => ({
    name: rc.getProperty("name") as string,
    id: rc.id,
  }));
}
