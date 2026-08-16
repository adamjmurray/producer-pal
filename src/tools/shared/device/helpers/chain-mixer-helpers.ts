// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/max/v8-max-console.ts";
import { findReturnIndex, roundPan } from "#src/tools/shared/utils.ts";

export interface ChainMixerParams {
  gainDb?: number;
  pan?: number;
  sendGainDb?: number;
  sendReturn?: string;
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
    mixer.child("volume").set("display_value", gainDb);
  }

  if (pan != null) {
    mixer.child("panning").set("value", pan);
  }

  if (sendGainDb != null || sendReturn != null) {
    applyChainSend(chain, mixer, sendGainDb, sendReturn);
  }
}

/**
 * Warn when a device is moved or copied out of a chain whose mixer is
 * non-default. The chain fader belongs to the chain, so it doesn't follow the
 * device — a common surprise on device-based drum pad moves.
 * @param device - The source device (before it moves)
 * @param destination - Container the device is going into (chain or track)
 * @param isCopy - True when the device is being copied, not moved
 */
export function warnIfChainMixerLeftBehind(
  device: LiveAPI,
  destination: LiveAPI,
  isCopy = false,
): void {
  const chainPath = device.path.replace(/ devices \d+$/, "");

  if (!/ (?:return_)?chains \d+$/.test(chainPath)) {
    return;
  }

  const chain = LiveAPI.from(chainPath);

  if (!chain.exists() || chain.id === destination.id) {
    return;
  }

  const mixer = readChainMixer(chain);

  if (Object.keys(mixer).length === 0) {
    return;
  }

  // A track destination has no chain fader to reapply onto, so it needs
  // update-track instead. Moving the whole pad only makes sense chain-to-chain,
  // and never for a copy — the point of a copy is to leave the pad in place.
  const toChain = destination.type.endsWith("Chain");
  const tool = toChain ? "update-device" : "update-track";
  const where = toChain ? "destination chain" : "destination track";
  const hint =
    !isCopy && toChain && chain.type === "DrumChain"
      ? " or move the whole pad instead (update-device with the pad path and toPath)"
      : "";

  const name = chain.getProperty("name") as string;
  const verb = isCopy ? "does not follow the copy" : "stays behind";

  console.warn(
    `chain "${name}" trim (${summarizeChainMixer(mixer)}) ${verb} — reapply on the ${where} with ${tool} gainDb/pan/sendGainDb+sendReturn${hint}`,
  );
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

  send.set("display_value", sendGainDb);
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
  const rack = LiveAPI.from(chain.path.replace(/ (?:return_)?chains \d+$/, ""));

  return rack
    .getChildren("return_chains")
    .map((rc) => rc.getProperty("name") as string);
}
