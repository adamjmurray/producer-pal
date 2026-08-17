// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/max/v8-max-console.ts";
import { findReturnIndex, roundPan } from "#src/tools/shared/utils.ts";
import { setParamIfEnabled } from "./param-write-helpers.ts";

export interface ChainMixerParams {
  gainDb?: number;
  pan?: number;
  sendGainDb?: number;
  sendReturn?: string;
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

  if (typeof gainDb === "number" && gainDb !== 0) {
    info.gainDb = gainDb;
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
 * Set a chain's own gain, pan, and send level
 * @param chain - Chain or DrumChain LiveAPI object
 * @param params - Mixer values to set
 */
export function applyChainMixer(
  chain: LiveAPI,
  params: ChainMixerParams,
): void {
  const { gainDb, pan, sendGainDb, sendReturn } = params;
  const mixer = chain.child("mixer_device");

  if (!mixer.exists()) {
    console.warn(`chain ${chain.id} has no mixer device`);

    return;
  }

  if (gainDb != null) {
    setParamIfEnabled(
      mixer.child("volume"),
      "display_value",
      gainDb,
      `${chainLabel(chain)} gainDb`,
    );
  }

  if (pan != null) {
    setParamIfEnabled(
      mixer.child("panning"),
      "value",
      pan,
      `${chainLabel(chain)} pan`,
    );
  }

  if (sendGainDb != null || sendReturn != null) {
    applyChainSend(chain, mixer, sendGainDb, sendReturn);
  }
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

  const name = chain.getProperty("name") as string;
  const verb = isCopy ? "does not follow the copy" : "stays behind";

  console.warn(
    `chain "${name}" trim (${summarizeChainMixer(mixer)}) ${verb} — reapply on the ${where} with ${tool} gainDb/pan/sendGainDb+sendReturn${hint}`,
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
    destination.getChildren("devices").length > 0 ||
    Object.keys(readChainMixer(destination)).length > 0
  ) {
    return null;
  }

  return { mixer, from: chainLabel(chain) };
}

/**
 * Apply a mixer read off one chain onto another, and say so: the caller asked
 * to move a device, not to touch a fader. Sends go one at a time so they match
 * by return-chain name rather than by index, which only line up when both
 * chains live in the same rack.
 * @param carry - Mixer values from {@link chainMixerToCarry}
 * @param destination - Chain to write them onto
 */
export function carryChainMixer(
  carry: ChainMixerCarry,
  destination: LiveAPI,
): void {
  const { mixer } = carry;

  console.warn(
    `${carry.from} trim (${summarizeChainMixer(mixer)}) carried onto the destination chain, which was empty and at defaults`,
  );

  applyChainMixer(destination, {
    gainDb: mixer.gainDb as number | undefined,
    pan: mixer.pan as number | undefined,
  });

  const sends = (mixer.sends ?? []) as { return: string; gainDb: number }[];

  for (const send of sends) {
    applyChainMixer(destination, {
      sendGainDb: send.gainDb,
      sendReturn: send.return,
    });
  }
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
 * Set one send on a chain's mixer, matched to the rack's return chains by name
 * @param chain - Chain the mixer belongs to
 * @param mixer - The chain's mixer device
 * @param sendGainDb - Send level in dB
 * @param sendReturn - Return chain name or letter
 */
function applyChainSend(
  chain: LiveAPI,
  mixer: LiveAPI,
  sendGainDb: number | undefined,
  sendReturn: string | undefined,
): void {
  if (sendGainDb == null || sendReturn == null) {
    console.warn("sendGainDb and sendReturn must both be specified");

    return;
  }

  const names = returnChainNames(chain);
  const index = findReturnIndex(names, sendReturn);

  if (index === -1) {
    // The "none" case is where a model would otherwise try to add one, so say
    // it can't be done here — racks expose no way to create a return chain.
    const available =
      names.length > 0
        ? ` (returns: ${names.join(", ")})`
        : " (rack has no return chains; they can only be added in Live)";

    console.warn(`no return chain matching "${sendReturn}"${available}`);

    return;
  }

  const send = mixer.getChildren("sends")[index];

  if (send == null) {
    console.warn(`chain ${chain.id} has no send ${index}`);

    return;
  }

  setParamIfEnabled(
    send,
    "display_value",
    sendGainDb,
    `${chainLabel(chain)} send "${names[index]}"`,
  );
}

/**
 * Name a chain for a warning, falling back to its id when it has no name
 * @param chain - Chain or DrumChain LiveAPI object
 * @returns Label like `chain "Kick"`
 */
function chainLabel(chain: LiveAPI): string {
  const name = chain.getProperty("name") as string | undefined;

  return name ? `chain "${name}"` : `chain ${chain.id}`;
}

/**
 * Read the sends that are turned up, named after the rack's return chains
 * @param chain - Chain the mixer belongs to
 * @param mixer - The chain's mixer device
 * @returns Active sends as {return, gainDb}
 */
function readActiveSends(
  chain: LiveAPI,
  mixer: LiveAPI,
): Record<string, unknown>[] {
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

  const names = returnChainNames(chain);

  return active.map(({ send, index }) => ({
    return: names[index] ?? `Return ${index + 1}`,
    gainDb: send.getProperty("display_value"),
  }));
}

/**
 * Names of the return chains in the rack that owns a chain, in send order
 * @param chain - Chain or DrumChain LiveAPI object
 * @returns Return chain names
 */
function returnChainNames(chain: LiveAPI): string[] {
  const rack = LiveAPI.from(rackPath(chain));

  return rack
    .getChildren("return_chains")
    .map((rc) => rc.getProperty("name") as string);
}
