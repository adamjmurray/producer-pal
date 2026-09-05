// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Removing one chain from a drum rack. Live exposes no chain delete, so this
// borrows a pad's: park the chain on a pad nothing else uses, then clear that
// pad. Only a Drum Rack with pads of its own has one to borrow.

import * as console from "#src/shared/max/v8-max-console.ts";
import { drumPadIdsByNote } from "#src/tools/shared/device/helpers/path/device-drumpad-navigation.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";

/** Where a pad's chain sits under its rack. */
const CHAIN_TAIL = / chains \d+$/;

/**
 * Delete one drum rack chain by parking it on an unused pad and clearing that
 * pad. Never throws: anything the technique can't reach warns and skips.
 * @param id - The chain's object ID
 * @param chain - The chain to delete
 * @returns true if the chain is gone, false if skipped or Live refused
 */
export function deleteDrumChain(id: string, chain: LiveAPI): boolean {
  if (chain.type !== "DrumChain" || !CHAIN_TAIL.test(chain.path)) {
    console.warn(
      `chain ${targetLabel(chain)} is not on a drum pad. Live has no way to delete ` +
        `a rack chain, and only a drum pad's chains can be removed.`,
    );

    return false;
  }

  const rack = LiveAPI.from(chain.path.replace(CHAIN_TAIL, ""));
  const scratchPad = findUnusedPad(rack);

  if (scratchPad == null) {
    console.warn(
      `chain ${targetLabel(chain)} needs a free drum pad to move to, and its ` +
        `Drum Rack has none — a rack nested in a drum pad has no pads at all. ` +
        `Live offers no other way to remove it; delete its devices to empty ` +
        `the pad, or move it with update-device's toPath.`,
    );

    return false;
  }

  const originalInNote = chain.getProperty("in_note") as number;

  chain.set("in_note", scratchPad.getProperty("note"));
  scratchPad.call("delete_all_chains");

  // Look the id up again: a dead one lands nowhere, while the object the clear
  // ran through still reports its old id and path.
  const survivor = LiveAPI.from(id);

  if (!survivor.exists()) return true;

  // Leaving it parked would silently move the chain to a pad the user never
  // named, so put it back where it was.
  survivor.set("in_note", originalInNote);

  console.warn(
    `Live did not remove chain ${targetLabel(survivor)}, so it was left as is`,
  );

  return false;
}

/**
 * A pad of this rack with no chains on it. Only a Drum Rack has pads, and one
 * nested inside a drum pad has none even so.
 * @param rack - The rack holding the chain
 * @returns An unused DrumPad, or null when the rack has none to spare
 */
function findUnusedPad(rack: LiveAPI): LiveAPI | null {
  const occupied = new Set(
    rack.getChildren("chains").map((c) => c.getProperty("in_note") as number),
  );

  for (const [note, padId] of drumPadIdsByNote(rack)) {
    if (!occupied.has(note)) return LiveAPI.from(padId);
  }

  return null;
}
