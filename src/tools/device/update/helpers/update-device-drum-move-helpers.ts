// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Moving a drum chain onto another pad. Live has no move for this — a pad is
// just an in_note, so the "move" is a re-map — which is why it resolves the
// destination by path rather than by object.

import { noteNameToMidi } from "#src/shared/pitch.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { findDrumPadByNote } from "#src/tools/shared/device/helpers/path/device-drumpad-navigation.ts";
import {
  resolveDrumPadFromPath,
  resolvePathToLiveApi,
} from "#src/tools/shared/device/helpers/path/device-path-helpers.ts";
import { pathTargetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";

/**
 * Move a drum chain to a different pad by updating in_note
 * @param chain - LiveAPI drum chain object
 * @param toPath - Target drum pad path
 * @param moveEntirePad - If true, move all chains with same in_note
 */
export function moveDrumChainToPath(
  chain: LiveAPI,
  toPath: string,
  moveEntirePad: boolean,
): void {
  const drumRackPath = chain.path.replace(/ chains \d+$/, "");
  const targetNote = targetPadNote(toPath, drumRackPath);

  if (targetNote == null) {
    return;
  }

  // The path grammar refuses a note name with no MIDI value, so the only pad
  // that isn't a note is the catch-all. Live 12.4.3 clamps a drum chain's
  // in_note to 0-127, so the move can't happen and Live would refuse it
  // silently — say so instead of reporting a no-op as a move.
  if (targetNote === "*") {
    console.warn(
      `updateDevice: cannot move a drum chain to the catch-all pad "${toPath}" — ` +
        `Live has no way to set a chain to "all notes"`,
    );

    return;
  }

  const targetInNote = noteNameToMidi(targetNote) as number;

  const sourceInNote = chain.getProperty("in_note") as number;
  const rack = LiveAPI.from(drumRackPath);
  const rackChains = rack.getChildren("chains");
  const inNotes = rackChains.map((c) => c.getProperty("in_note") as number);

  warnIfDestinationOccupied(rack, toPath, inNotes, sourceInNote, targetInNote);

  if (moveEntirePad) {
    for (const [index, c] of rackChains.entries()) {
      if (inNotes[index] === sourceInNote) {
        c.set("in_note", targetInNote);
      }
    }
  } else {
    chain.set("in_note", targetInNote);
  }
}

/**
 * Live layers a moved chain onto whatever the destination pad already holds
 * rather than replacing it, so the pad ends up playing both. Say so — the
 * caller asked for a move and would otherwise read the result as a swap.
 * @param rack - The Drum Rack both pads live on
 * @param toPath - Destination pad path as written, for the warning
 * @param inNotes - Every rack chain's in_note, in rack order
 * @param sourceInNote - The moving chain's in_note
 * @param targetInNote - The destination pad's in_note
 */
function warnIfDestinationOccupied(
  rack: LiveAPI,
  toPath: string,
  inNotes: number[],
  sourceInNote: number,
  targetInNote: number,
): void {
  if (targetInNote === sourceInNote) return;

  const occupants = inNotes.filter((note) => note === targetInNote).length;

  if (occupants === 0) return;

  const label = pathTargetLabel(findDrumPadByNote(rack, targetInNote), toPath);

  console.warn(
    `updateDevice: drum pad ${label} already had ${occupants} chain(s), ` +
      `so the move layers on top of them rather than replacing them`,
  );
}

// --- Helpers below main exports ---

/**
 * The pad a toPath names, when it names one in this rack. Resolution is by path
 * rather than by object so a toPath pointing at nothing (a track that doesn't
 * exist) is refused rather than read as "same rack".
 *
 * A chain or device below the pad ("t0/d0/pD1/c0", the spelling read-device
 * prints for a layered pad) still names that pad: the move is an in_note
 * re-map, so the pad is the only destination there is.
 *
 * A later pad segment ("t0/d0/pC1/c0/d0/pE1") names a nested rack's pad, and
 * that's the destination — it's a legal move whenever the nested rack is the
 * source's own.
 * @param toPath - Target drum pad path
 * @param drumRackPath - Live API path of the rack holding the source chain
 * @returns The pad's note name, "*" for the catch-all pad, or null once the
 *   reason it can't be the destination has been warned
 */
function targetPadNote(toPath: string, drumRackPath: string): string | null {
  const resolved = resolvePadPath(toPath);

  if (resolved?.drumPadNote == null) {
    console.warn(`toPath "${toPath}" is not a drum pad path`);

    return null;
  }

  const { liveApiPath, drumPadNote, remainingSegments } = resolved;
  const nested = lastPadIndex(remainingSegments);
  const pad =
    nested < 0
      ? { rackPath: liveApiPath, note: drumPadNote }
      : nestedPad(liveApiPath, drumPadNote, remainingSegments, nested);

  // The move is an in_note re-map within one rack, so a toPath naming a pad
  // elsewhere can't be honored. Without this it lands on that note in the
  // SOURCE rack instead — the wrong pad, reported as a success.
  if (pad?.rackPath !== drumRackPath) {
    console.warn(
      `toPath "${toPath}" does not name a pad in this rack, and a pad move stays within one rack; ` +
        `move the pad's device instead (update-device on the device path)`,
    );

    return null;
  }

  return pad.note;
}

/**
 * Where the last pad segment sits, so a nested rack's pad is read as the
 * destination rather than the outer pad the path opens with.
 * @param segments - Segments after the first pad
 * @returns Its index, or -1 when no pad follows
 */
function lastPadIndex(segments: string[]): number {
  for (let index = segments.length - 1; index >= 0; index--) {
    if (segments[index]?.startsWith("p")) return index;
  }

  return -1;
}

/**
 * The pad a nested rack's pad segment names. Path resolution stops at the first
 * pad, so the rack holding a later one is only findable by walking the live
 * objects between them.
 * @param liveApiPath - Live API path of the outermost rack
 * @param drumPadNote - Its pad the path opens with
 * @param segments - Segments after that pad
 * @param padIndex - Index of the last pad segment
 * @returns The nested rack's path and the pad's note, or null when the path
 *   reaches no rack
 */
function nestedPad(
  liveApiPath: string,
  drumPadNote: string,
  segments: string[],
  padIndex: number,
): { rackPath: string; note: string } | null {
  const { target, targetType } = resolveDrumPadFromPath(
    liveApiPath,
    drumPadNote,
    segments.slice(0, padIndex),
  );

  return target == null || targetType !== "device"
    ? null
    : { rackPath: target.path, note: (segments[padIndex] as string).slice(1) };
}

/**
 * Resolve a pad toPath, treating a path that doesn't parse as naming no pad.
 * @param toPath - Target drum pad path
 * @returns The resolved path, or null when it doesn't resolve
 */
function resolvePadPath(toPath: string) {
  try {
    return resolvePathToLiveApi(toPath, "toPath");
  } catch {
    return null;
  }
}
