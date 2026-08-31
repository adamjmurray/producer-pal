// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A real pad copy, via the rack's own copy_pad. Everything that makes a pad
// sound the way it does lives on its chain — trim, sends, choke group, devices —
// and copy_pad brings all of it. A device-level duplicate can't: it moves the
// device out of its chain and leaves the chain (and its fader) behind.

import { errorMessage } from "#src/shared/error-utils.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { midiToNoteName, noteNameToMidi } from "#src/shared/pitch.ts";
import { findDrumPadByNote } from "#src/tools/shared/device/helpers/path/device-drumpad-navigation.ts";
import {
  buildDrumPadPath,
  extractDevicePath,
  resolvePathToLiveApi,
} from "#src/tools/shared/device/helpers/path/device-path-helpers.ts";

export interface DuplicateDrumPadResult {
  id: string;
  path: string;
}

export interface PadTarget {
  /** Live API path to the drum rack holding the pad */
  rackPath: string;
  midi: number;
}

// A DrumPad's Live path is its rack's plus this. Trimming it walks back up.
const DRUM_PADS_SEGMENT = / drum_pads \d+$/;

/**
 * Resolves the pad a copy starts from, named either by id or by path.
 * @param pad - The pad named by id, already type-checked, or null
 * @param path - Pad path, when the call named the source that way instead
 * @returns The source pad, or null when neither names one
 */
export function resolveSourcePad(
  pad: LiveAPI | null,
  path: string | undefined,
): PadTarget | null {
  return pad == null
    ? resolvePadTarget(path as string, "path")
    : padTargetFromPad(pad);
}

/**
 * Copies a drum pad onto another pad of the same rack, bringing its chains and
 * everything attached to them: trim, pan, sends, choke group, and devices.
 * @param source - The pad to copy from
 * @param toPath - Destination pad path in the same rack, e.g. "t0/d0/pD1"
 * @param name - Optional name for the chain(s) the copy creates
 * @returns The destination pad, or null when the copy was skipped
 */
export function duplicateDrumPad(
  source: PadTarget,
  toPath: string,
  name?: string,
): DuplicateDrumPadResult | null {
  const destination = resolvePadTarget(toPath, "toPath");

  if (destination == null) {
    return null;
  }

  if (source.rackPath !== destination.rackPath) {
    console.warn(
      `duplicate: a drum-pad copy stays within one rack, but the source pad and toPath "${toPath}" are in different racks`,
    );

    return null;
  }

  // What Live does for copy_pad(n, n) isn't documented, and both answers are
  // bad: layering a pad onto itself doubles its chains, and a no-op reports a
  // copy that never happened. A repeated toPath entry is all it takes.
  if (source.midi === destination.midi) {
    console.warn(
      `duplicate: drum pad ${midiToNoteName(source.midi)} can't be copied onto itself, so toPath "${toPath}" was skipped`,
    );

    return null;
  }

  const rack = LiveAPI.from(source.rackPath);

  if (!canCopyPads(rack)) {
    return null;
  }

  const sourcePad = findDrumPadByNote(rack, source.midi);

  if (sourcePad == null || sourcePad.getChildCount("chains") === 0) {
    console.warn(
      `duplicate: drum pad ${midiToNoteName(source.midi)} is empty, nothing to copy`,
    );

    return null;
  }

  const chainsBefore =
    findDrumPadByNote(rack, destination.midi)?.getChildCount("chains") ?? 0;

  rack.call("copy_pad", source.midi, destination.midi);

  return finishPadCopy(rack, destination, toPath, chainsBefore, name);
}

/**
 * Reports whether a rack can copy pads, warning when it can't.
 *
 * Live hard-crashes on copy_pad when has_drum_pads is 0 — a Drum Rack nested
 * inside another Drum Rack's pad is padless and reports 0. Never call copy_pad
 * without this check.
 * @param rack - The rack the pads belong to
 * @returns True when copy_pad is safe to call
 */
function canCopyPads(rack: LiveAPI): boolean {
  if (rack.getProperty("can_have_drum_pads") !== 1) {
    console.warn(`duplicate: the source pad is not in a Drum Rack`);

    return false;
  }

  if (rack.getProperty("has_drum_pads") !== 1) {
    console.warn(
      `duplicate: this Drum Rack has no pads (a Drum Rack nested in a drum pad never does), so there is nothing to copy between`,
    );

    return false;
  }

  return true;
}

/**
 * Reads a validated pad id back as a copy source.
 * @param pad - The object the id named
 * @returns The pad target, or null when the id doesn't name a pad
 */
function padTargetFromPad(pad: LiveAPI): PadTarget | null {
  // A chain id passes the tool's drum-pad type check, but copy_pad copies the
  // whole pad — every chain layered on it — so it would copy more than the
  // caller named. Make them say which pad.
  if (pad.type !== "DrumPad") {
    console.warn(
      `duplicate: id "${pad.id}" is a ${pad.type}, not a drum pad; use the id ppal-read-device lists on the pad itself`,
    );

    return null;
  }

  return {
    rackPath: pad.path.replace(DRUM_PADS_SEGMENT, ""),
    midi: pad.getProperty("note") as number,
  };
}

/**
 * Resolves a pad path to the rack that holds it and the pad's MIDI note.
 * @param path - The path to resolve
 * @param label - Param name the path came from, for warnings
 * @returns The pad target, or null when the path doesn't name one pad
 */
function resolvePadTarget(path: string, label: string): PadTarget | null {
  let resolved;

  try {
    resolved = resolvePathToLiveApi(path, label);
  } catch (e) {
    console.warn(`duplicate: ${errorMessage(e)}`);

    return null;
  }

  // A trailing chain or device segment names something inside the pad, and
  // copy_pad only ever copies a whole pad. Resolution stops at the first pad,
  // so a further pad segment is a pad of a nested rack — unreachable, and worth
  // saying so rather than claiming the path names no pad at all.
  if (resolved.targetType !== "drum-pad") {
    console.warn(
      `duplicate: ${label} "${path}" does not name a drum pad (expected something like "t0/d0/pC1")`,
    );

    return null;
  }

  if (resolved.remainingSegments.length > 0) {
    console.warn(
      resolved.remainingSegments.some((segment) => segment.startsWith("p"))
        ? `duplicate: ${label} "${path}" names a pad of a nested Drum Rack, which can't be copied`
        : `duplicate: ${label} "${path}" names something inside a drum pad, not the pad itself (expected something like "t0/d0/pC1")`,
    );

    return null;
  }

  const midi = noteNameToMidi(resolved.drumPadNote as string);

  if (midi == null) {
    console.warn(
      `duplicate: ${label} "${path}" names the catch-all pad, which has no pad to copy`,
    );

    return null;
  }

  // A path parses fine against a track or device index that holds nothing. An
  // id can't: the pad proves its own rack.
  if (!LiveAPI.from(resolved.liveApiPath).exists()) {
    console.warn(`duplicate: no device at "${path}"`);

    return null;
  }

  return { rackPath: resolved.liveApiPath, midi };
}

/**
 * Confirms the copy landed, names the new chains, and describes the result.
 * @param rack - The rack the copy happened in
 * @param destination - The destination pad
 * @param toPath - Destination path as written, for warnings
 * @param chainsBefore - Chain count on the destination pad before the copy
 * @param name - Optional name for the chain(s) the copy created
 * @returns The destination pad, or null when nothing was copied
 */
function finishPadCopy(
  rack: LiveAPI,
  destination: PadTarget,
  toPath: string,
  chainsBefore: number,
  name?: string,
): DuplicateDrumPadResult | null {
  const pad = findDrumPadByNote(rack, destination.midi);
  const chainIds = pad?.getChildIds("chains") ?? [];

  if (pad == null || chainIds.length <= chainsBefore) {
    console.warn(`duplicate: copying onto drum pad "${toPath}" had no effect`);

    return null;
  }

  // Live layers rather than replaces, matching a device-based pad move onto an
  // occupied pad. Say so, because the pad now plays both.
  if (chainsBefore > 0) {
    console.warn(
      `duplicate: drum pad "${toPath}" already had ${chainsBefore} chain(s), so the copy layers on top of them rather than replacing them`,
    );
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
  };
}
