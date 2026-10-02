// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Carrying a chain's own mixer onto its copy. Gain and pan travel as-is; sends
// are the interesting case, because a send is an index into the rack's return
// chains and two racks don't share those.

import {
  applyChainMixerAside,
  type ChainSend,
} from "#src/tools/shared/device/helpers/chain-mixer/chain-mixer.ts";
import {
  noteTarget,
  type TargetNotes,
} from "#src/tools/shared/helpers/target-notes.ts";

interface ReadSend {
  return: string;
  gainDb: number;
}

/**
 * Write a chain's mixer onto its copy, carrying the sends it can.
 * @param created - The new chain
 * @param mixer - readChainMixer output from the source chain
 * @param sourceRack - The rack the source chain belongs to
 * @param destinationRack - The rack the copy landed in
 * @param notes - What the copy's entry should say
 */
export function copyChainMixerTo(
  created: LiveAPI,
  mixer: Record<string, unknown>,
  sourceRack: LiveAPI,
  destinationRack: LiveAPI,
  notes: TargetNotes,
): void {
  const sends = carriedSends(
    (mixer.sends ?? []) as ReadSend[],
    sourceRack,
    destinationRack,
    notes,
  );

  applyChainMixerAside(
    created,
    {
      gainDb: mixer.gainDb as number | undefined,
      pan: mixer.pan as number | undefined,
      ...(sends.length > 0 ? { sends } : {}),
    },
    notes,
  );
}

/**
 * The sends that have somewhere to land, saying which ones didn't.
 *
 * Within one rack every send carries over. Across racks a send is matched by
 * its return chain's name, because that is the only thing the two racks can
 * share — the destination's returns are different objects, so ids are no help
 * here. A name that isn't in the destination has no equivalent to write to.
 * @param sends - The source chain's active sends
 * @param sourceRack - The rack the source chain belongs to
 * @param destinationRack - The rack the copy landed in
 * @param notes - What the copy's entry should say
 * @returns The sends to write on the copy
 */
function carriedSends(
  sends: ReadSend[],
  sourceRack: LiveAPI,
  destinationRack: LiveAPI,
  notes: TargetNotes,
): ChainSend[] {
  if (sends.length === 0) {
    return [];
  }

  if (sourceRack.path === destinationRack.path) {
    return sends.map((send) => ({ return: send.return, gainDb: send.gainDb }));
  }

  const available = new Set(
    destinationRack
      .getChildren("return_chains")
      .map((rc) => rc.getName().toLowerCase()),
  );

  const carried: ChainSend[] = [];
  const dropped: string[] = [];

  for (const send of sends) {
    if (available.has(send.return.toLowerCase())) {
      carried.push({ return: send.return, gainDb: send.gainDb });
    } else {
      dropped.push(send.return);
    }
  }

  if (dropped.length > 0) {
    const named = dropped.map((name) => `"${name}"`).join(", ");
    const tail = dropped.length === 1 ? "that send was" : "those sends were";

    noteTarget(
      notes,
      `the destination rack has no return chain named ${named}, ` +
        `so ${tail} not copied`,
    );
  }

  return carried;
}
