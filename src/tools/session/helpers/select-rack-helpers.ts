// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Selecting inside a rack: a drum pad, one of its layers, or any rack chain.
// Live keeps this on the rack's own view rather than the song view, so it takes
// different writes from every other selection select makes.

import {
  chainsOnDrumPad,
  drumPadPath,
  findDrumPad,
  findDrumPadByNote,
  resolveDrumPadFromPath,
  resolveDrumPadGroup,
} from "#src/tools/shared/device/helpers/path/device-drumpad-navigation.ts";
import { extractDevicePath } from "#src/tools/shared/device/helpers/path/device-path-builders.ts";
import {
  resolvePathToLiveApi,
  type ResolvedPath,
} from "#src/tools/shared/device/helpers/path/device-path-to-live-api.ts";
import { toLiveApiId } from "#src/tools/shared/utils.ts";

/** Live shows 4 pad rows at a time out of 32, so the last row it can top is 28. */
const MAX_PAD_SCROLL = 28;
const PADS_PER_ROW = 4;

/** Where a chain sits: `chains N` under its rack, `return_chains N` for a return chain. */
const CHAIN_TAIL = / (?:chains|return_chains) \d+$/;
const PAD_TAIL = / drum_pads \d+$/;
const DEVICE_TAIL = / devices \d+$/;

export interface RackSelection {
  selectedDrumPad?: { id: string; path: string };
  selectedChain?: { id: string; path: string };
}

/**
 * Resolve what a rack-internal select names. A bare pad path names the pad
 * itself; anything else names a chain.
 * @param id - A DrumPad, DrumChain, or Chain id
 * @param path - A pad path ("t0/d0/pC1"), a layer ("t0/d0/pC1/c1"), or a chain
 * @returns The object to select, or undefined when neither was given
 */
export function resolveRackTarget(
  id?: string,
  path?: string,
): LiveAPI | undefined {
  if (id != null) return LiveAPI.from(id);
  if (path == null) return undefined;

  const resolved = resolvePathToLiveApi(path);

  if (resolved.targetType === "drum-pad") {
    return drumPadTarget(resolved, path);
  }

  const chain = LiveAPI.from(resolved.liveApiPath);

  if (!chain.exists()) {
    throw new Error(`select failed: no chain at "${path}"`);
  }

  return chain;
}

/**
 * Select a drum pad or rack chain and make it visible.
 * @param songView - LiveAPI instance for live_set view
 * @param target - The DrumPad or Chain to select
 * @returns What was selected, for the response
 */
export function selectRackTarget(
  songView: LiveAPI,
  target: LiveAPI,
): RackSelection {
  const isPad = target.type === "DrumPad";
  const rack = LiveAPI.from(
    target.path.replace(isPad ? PAD_TAIL : CHAIN_TAIL, ""),
  );

  // Selecting the rack also selects its track, and puts the pad grid on screen.
  songView.call("select_device", toLiveApiId(rack.id));

  // Read the pad's layers off the rack, not off the pad: measured on 12.4.3
  // the two lists disagree once a pad holds more than one, and c0 is the
  // rack's first. Revealing the pad's would show a layer the path doesn't name.
  const chain = isPad ? (chainsOnDrumPad(target)[0] ?? null) : target;
  const pad = isPad ? target : drumPadOfChain(rack, target);

  if (pad != null) revealDrumPad(rack, pad);

  revealChain(rack, chain);

  return isPad
    ? { selectedDrumPad: { id: target.id, path: drumPadPath(target) } }
    : { selectedChain: { id: target.id, path: chainPath(target) } };
}

// --- Helpers below main exports ---

/**
 * The object a pad path names: the DrumPad itself, or — on the catch-all and in
 * a Drum Rack nested inside a pad, neither of which has a DrumPad object — the
 * chain the note routes to.
 * @param resolved - The parsed path, stopped at the pad segment
 * @param path - The path as written, for error messages
 * @returns The DrumPad or chain to select
 */
function drumPadTarget(resolved: ResolvedPath, path: string): LiveAPI {
  const note = resolved.drumPadNote as string;

  if (resolved.remainingSegments.length > 0) {
    const { target } = resolveDrumPadFromPath(
      resolved.liveApiPath,
      note,
      resolved.remainingSegments,
    );

    if (target == null) {
      throw new Error(`select failed: nothing at "${path}"`);
    }

    return target;
  }

  const pad = findDrumPad(resolved.liveApiPath, note);

  if (pad != null) return pad;

  const group = resolveDrumPadGroup(resolved.liveApiPath, note);
  const chain = group?.chains[0];

  if (chain == null) {
    throw new Error(`select failed: no drum pad at "${path}"`);
  }

  return chain;
}

/**
 * The pad a chain sounds on, when it sounds on one.
 * @param rack - The rack holding the chain
 * @param chain - The chain
 * @returns The DrumPad, or null for a rack chain or return chain
 */
function drumPadOfChain(rack: LiveAPI, chain: LiveAPI): LiveAPI | null {
  if (chain.type !== "DrumChain") return null;

  return findDrumPadByNote(rack, chain.getProperty("in_note") as number);
}

/**
 * Select a pad and scroll it into view. Live does not scroll to the pad it is
 * told to select, so a pad off the visible four rows stays off them.
 * @param rack - The drum rack
 * @param pad - The DrumPad to select
 */
function revealDrumPad(rack: LiveAPI, pad: LiveAPI): void {
  const view = rack.child("view");

  view.set("selected_drum_pad", toLiveApiId(pad.id));

  const row = Math.floor((pad.getProperty("note") as number) / PADS_PER_ROW);

  // One row above the pad, so it isn't pinned to the top edge.
  view.set(
    "drum_pads_scroll_position",
    Math.min(Math.max(row - 1, 0), MAX_PAD_SCROLL),
  );
}

/**
 * Show a chain on its rack, and open every rack above it. Live doesn't cascade
 * this: a chain inside a collapsed rack stays hidden even once it is the
 * selected one.
 * @param rack - The rack holding the chain
 * @param chain - The chain to show, or null for a pad with nothing on it
 */
function revealChain(rack: LiveAPI, chain: LiveAPI | null): void {
  let currentRack: LiveAPI | null = rack;
  let currentChain = chain;

  while (currentRack != null) {
    const view = currentRack.child("view");

    if (currentChain != null) {
      view.set("selected_chain", toLiveApiId(currentChain.id));
    }

    view.set("is_showing_chain_devices", 1);

    currentChain = enclosingChain(currentRack);
    currentRack =
      currentChain == null
        ? null
        : LiveAPI.from(currentChain.path.replace(CHAIN_TAIL, ""));
  }
}

/**
 * The chain a device sits in, when it sits in one rather than on a track.
 * @param device - The device
 * @returns The enclosing chain, or null when the device is on a track
 */
function enclosingChain(device: LiveAPI): LiveAPI | null {
  const parentPath = device.path.replace(DEVICE_TAIL, "");

  return CHAIN_TAIL.test(parentPath) ? LiveAPI.from(parentPath) : null;
}

/**
 * The path spelling of a selected chain.
 * @param chain - The chain
 * @returns The chain path, e.g. "t0/d0/c1"
 */
function chainPath(chain: LiveAPI): string {
  return extractDevicePath(chain.path) as string;
}
