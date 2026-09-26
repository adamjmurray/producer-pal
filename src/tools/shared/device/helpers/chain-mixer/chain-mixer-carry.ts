// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A chain's own mixer when a device leaves the chain: carried onto an empty
// destination chain, or left behind with a note saying so.

import {
  type TargetNotes,
  noteTarget,
} from "#src/tools/shared/helpers/target-notes.ts";
import {
  applyChainMixerAside,
  chainLabel,
  rackPath,
  readChainMixer,
} from "./chain-mixer.ts";

export interface ChainMixerCarry {
  /** Mixer values read off the source chain */
  mixer: Record<string, unknown>;
  /** The source chain, named for the announcement */
  from: string;
}

/**
 * Apply a mixer read off one chain onto another, and say so: the caller asked
 * to move a device, not to touch a fader. Sends go one at a time so they match
 * by return-chain name rather than by index.
 *
 * Announce afterward, naming what landed: a disabled parameter is skipped, so
 * announcing the intent up front would claim it.
 * @param carry - Mixer values from {@link chainMixerToCarry}
 * @param destination - Chain to write them onto
 * @param notes - What the device's entry has to say, added to; left out where
 *   the caller keeps no entry for this move
 */
export function carryChainMixer(
  carry: ChainMixerCarry,
  destination: LiveAPI,
  notes?: TargetNotes,
): void {
  const { mixer } = carry;
  const applied = applyChainMixerAside(
    destination,
    {
      gainDb: mixer.gainDb as number | undefined,
      pan: mixer.pan as number | undefined,
    },
    notes,
  );
  const sends = (mixer.sends ?? []) as { return: string; gainDb: number }[];
  // Only the sends that landed; a refused one is already noted.
  const landedSends = sends
    .flatMap(
      (send) =>
        applyChainMixerAside(
          destination,
          { sendGainDb: send.gainDb, sendReturn: send.return },
          notes,
        ).sends ?? [],
    )
    .filter((send) => send.ok !== false);

  // applied holds only gainDb and pan — the sends went through their own calls.
  const landed: Record<string, unknown> = { ...applied };

  if (landedSends.length > 0) {
    landed.sends = landedSends;
  }

  if (Object.keys(landed).length === 0) {
    noteTarget(
      notes,
      `${carry.from} trim could not be carried onto the destination chain — it stays on the chain the device left`,
    );

    return;
  }

  noteTarget(
    notes,
    `${carry.from} trim (${summarizeChainMixer(landed)}) carried onto the destination chain, which was empty and at defaults`,
  );
}

/**
 * Say when a device is moved or copied out of a chain whose mixer is
 * non-default. The chain fader belongs to the chain, so it doesn't follow the
 * device — a common surprise on device-based drum pad moves.
 * @param chain - The chain the device came out of, from {@link sourceChain}
 * @param destination - Container the device went into (chain or track)
 * @param isCopy - True when the device is being copied, not moved
 * @param notes - What the device's entry has to say, added to; left out where
 *   the caller keeps no entry for this move
 */
export function noteChainMixerLeftBehind(
  chain: LiveAPI | null,
  destination: LiveAPI,
  isCopy = false,
  notes?: TargetNotes,
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

  noteTarget(
    notes,
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
 * Anything else keeps its own fader and says so instead: a chain already
 * holding devices would have them re-levelled by a write nobody asked for, and
 * a non-default trim is someone's deliberate setting. So does a destination in
 * another rack — sends match by return-chain name, which only lines up within
 * one rack, so a cross-rack carry would drop them and leave a partial trim.
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
 * The whole-pad alternative to offer, when there is one. Both operations keep
 * the chain — and so the trim — intact, instead of moving a device out of it.
 * Both also stay within one rack, so only offer them when the destination is
 * another pad of the same rack — otherwise the suggestion is refused.
 * @param chain - The chain being left behind
 * @param destination - Container the device is going into
 * @param isCopy - True when the device is being copied, not moved
 * @returns Text to append to the note, or "" when nothing applies
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
 * Summarize a chain mixer for the left-behind note. Sends are counted, not
 * listed: a factory kit routes most pads to several returns, and the full list
 * buries the note in text the reader can get from read-device.
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
