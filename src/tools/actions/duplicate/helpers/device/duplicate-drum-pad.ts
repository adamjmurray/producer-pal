// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A real pad copy, via the rack's own copy_pad. Everything that makes a pad
// sound the way it does lives on its chain — trim, sends, choke group, devices —
// and copy_pad brings all of it. A device-level duplicate can't: it moves the
// device out of its chain and leaves the chain (and its fader) behind.

import { midiToNoteName, noteNameToMidi } from "#src/shared/pitch.ts";
import {
  findDrumPadByNote,
  invalidateRackChains,
} from "#src/tools/shared/device/helpers/path/device-drumpad-navigation.ts";
import { nothingAtPath } from "#src/tools/shared/device/helpers/path/device-path-to-live-api.ts";
import {
  buildDrumPadPath,
  extractDevicePath,
  resolvePathToLiveApi,
} from "#src/tools/shared/device/helpers/path/insertion-path.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";

export interface DuplicateDrumPadResult {
  id: string;
  path: string;
  /** What the copy did that wasn't asked for, when it did. */
  reason?: string;
}

export interface PadTarget {
  /** Live API path to the drum rack holding the pad */
  rackPath: string;
  midi: number;
}

// A DrumPad's Live path is its rack's plus this. Trimming it walks back up.
const DRUM_PADS_SEGMENT = / drum_pads \d+$/;

/**
 * Reads the pad a copy starts from. A source named by path arrives as the id
 * that path resolved to, so this only ever reads an object.
 * @param pad - The source pad, already type-checked
 * @returns The pad target
 * @throws Error when the object isn't a pad
 */
export function resolveSourcePad(pad: LiveAPI): PadTarget {
  // A chain id passes the tool's drum-pad type check, but copy_pad copies the
  // whole pad — every chain layered on it — so it would copy more than the
  // caller named. Make them say which pad.
  if (pad.type !== "DrumPad") {
    throw new Error(
      `${targetLabel(pad)} is a ${pad.type}, not a drum pad; use the id ppal-read-device lists on the pad itself`,
    );
  }

  return {
    rackPath: pad.path.replace(DRUM_PADS_SEGMENT, ""),
    midi: pad.getProperty("note") as number,
  };
}

/**
 * Copies a drum pad onto another pad of the same rack, bringing its chains and
 * everything attached to them: trim, pan, sends, choke group, and devices.
 * @param source - The pad to copy from
 * @param toPath - Destination pad path in the same rack, e.g. "t0/d0/pD1"
 * @param name - Optional name for the chain(s) the copy creates
 * @returns The destination pad
 * @throws Error when nothing was copied
 */
export function duplicateDrumPad(
  source: PadTarget,
  toPath: string,
  name?: string,
): DuplicateDrumPadResult {
  const destination = resolvePadTarget(toPath, "toPath");

  if (source.rackPath !== destination.rackPath) {
    throw new Error(
      `a drum-pad copy stays within one rack, but the source pad and toPath "${toPath}" are in different racks`,
    );
  }

  // What Live does for copy_pad(n, n) isn't documented, and both answers are
  // bad: layering a pad onto itself doubles its chains, and a no-op reports a
  // copy that never happened. A repeated toPath entry is all it takes.
  if (source.midi === destination.midi) {
    throw new Error(
      `drum pad ${midiToNoteName(source.midi)} can't be copied onto itself`,
    );
  }

  const rack = LiveAPI.from(source.rackPath);

  refuseRackWithoutPads(rack);

  const sourcePad = findDrumPadByNote(rack, source.midi);

  if (sourcePad == null || sourcePad.getChildCount("chains") === 0) {
    throw new Error(
      `drum pad ${midiToNoteName(source.midi)} is empty, nothing to copy`,
    );
  }

  const chainsBefore =
    findDrumPadByNote(rack, destination.midi)?.getChildCount("chains") ?? 0;

  rack.call("copy_pad", source.midi, destination.midi);
  invalidateRackChains(rack);

  return finishPadCopy(rack, destination, toPath, chainsBefore, name);
}

/**
 * Refuses a rack that can't copy pads.
 *
 * Live hard-crashes on copy_pad when has_drum_pads is 0 — a Drum Rack nested
 * inside another Drum Rack's pad is padless and reports 0. Never call copy_pad
 * without this check.
 * @param rack - The rack the pads belong to
 * @throws Error when copy_pad isn't safe to call
 */
function refuseRackWithoutPads(rack: LiveAPI): void {
  if (rack.getProperty("can_have_drum_pads") !== 1) {
    throw new Error(
      `the source pad's device ${targetLabel(rack)} is not a Drum Rack`,
    );
  }

  if (rack.getProperty("has_drum_pads") !== 1) {
    throw new Error(
      `Drum Rack ${targetLabel(rack)} has no pads (a Drum Rack nested in a drum pad never does), so there is nothing to copy between`,
    );
  }
}

/**
 * Resolves a pad path to the rack that holds it and the pad's MIDI note.
 * @param path - The path to resolve
 * @param label - Param name the path came from, for the reason
 * @returns The pad target
 * @throws Error when the path doesn't name one pad
 */
function resolvePadTarget(path: string, label: string): PadTarget {
  const resolved = resolvePathToLiveApi(path, label);

  if (resolved.namesNothing != null) {
    throw new Error(nothingAtPath(path, resolved.namesNothing, label));
  }

  // A trailing chain or device segment names something inside the pad, and
  // copy_pad only ever copies a whole pad. Resolution stops at the first pad,
  // so a further pad segment is a pad of a nested rack — unreachable, and worth
  // saying so rather than claiming the path names no pad at all.
  if (resolved.targetType !== "drum-pad") {
    throw new Error(
      `${label} "${path}" does not name a drum pad (expected something like "t0/d0/pC1")`,
    );
  }

  if (resolved.remainingSegments.length > 0) {
    throw new Error(
      resolved.remainingSegments.some((segment) => segment.startsWith("p"))
        ? `${label} "${path}" names a pad of a nested Drum Rack, which can't be copied`
        : `${label} "${path}" names something inside a drum pad, not the pad itself (expected something like "t0/d0/pC1")`,
    );
  }

  const midi = noteNameToMidi(resolved.drumPadNote as string);

  if (midi == null) {
    throw new Error(
      `${label} "${path}" names the catch-all pad, which has no pad to copy`,
    );
  }

  // A path parses fine against a track or device index that holds nothing. An
  // id can't: the pad proves its own rack.
  if (!LiveAPI.from(resolved.liveApiPath).exists()) {
    throw new Error(`no device at "${path}"`);
  }

  return { rackPath: resolved.liveApiPath, midi };
}

/**
 * Confirms the copy landed, names the new chains, and describes the result.
 * @param rack - The rack the copy happened in
 * @param destination - The destination pad
 * @param toPath - Destination path as written, for the reason
 * @param chainsBefore - Chain count on the destination pad before the copy
 * @param name - Optional name for the chain(s) the copy created
 * @returns The destination pad
 * @throws Error when nothing was copied
 */
function finishPadCopy(
  rack: LiveAPI,
  destination: PadTarget,
  toPath: string,
  chainsBefore: number,
  name?: string,
): DuplicateDrumPadResult {
  const pad = findDrumPadByNote(rack, destination.midi);
  const chainIds = pad?.getChildIds("chains") ?? [];

  if (pad == null || chainIds.length <= chainsBefore) {
    throw new Error(`copying onto drum pad "${toPath}" had no effect`);
  }

  if (name != null) {
    // Only the chains the copy added, and only when there's a name to set —
    // the rest never need building.
    for (const chainId of chainIds.slice(chainsBefore)) {
      LiveAPI.from(chainId).set("name", name);
    }
  }

  const devicePath = extractDevicePath(rack.path);
  const noteName = midiToNoteName(destination.midi) as string;

  return {
    id: pad.id,
    path: devicePath == null ? toPath : buildDrumPadPath(devicePath, noteName),
    // Live layers rather than replaces, matching a device-based pad move onto
    // an occupied pad. Say so, because the pad now plays both.
    ...(chainsBefore > 0 && {
      reason: `the pad already had ${chainsBefore} chain(s), so the copy layers on top of them rather than replacing them`,
    }),
  };
}
