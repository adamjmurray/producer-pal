// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/max/v8-max-console.ts";
import { type Notation } from "#src/shared/notation.ts";
import {
  DEFAULT_MAX_DEPTH,
  findDrumRack,
  getDrumMap,
  type DeviceWithDrumPads,
} from "#src/tools/shared/device/device-reader.ts";

export interface DrumMapPostProcessOptions {
  /** Whether a drum map was asked for, including via `include: ["*"]` */
  includeDrumMap: boolean;
  /** Whether "drum-map" was named outright, so its absence is worth a warning */
  drumMapExplicit: boolean;
  /** Whether chains were fetched only to build the map */
  chainsForDrumMap: boolean;
  /** Whether the caller asked for the pads in their own right */
  includeDrumPads: boolean;
  /** Active notation; controls whether drum-map keys are drum names */
  notation?: Notation;
}

/**
 * Add the drum map to a result and strip chain data fetched only to build it.
 * @param result - Device, chain, or drum pad result to post-process
 * @param options - What was requested (see DrumMapPostProcessOptions)
 * @returns Post-processed result
 */
export function postProcessDrumMap(
  result: Record<string, unknown>,
  options: DrumMapPostProcessOptions,
): Record<string, unknown> {
  const { includeDrumMap, drumMapExplicit, chainsForDrumMap, notation } =
    options;
  const { includeDrumPads } = options;

  if (includeDrumMap) {
    const devices = drumMapSource(result);

    if (devices == null) {
      warnNoDrumMap(result, drumMapExplicit);
    } else {
      const drumRack = findDrumRack(devices);

      if (drumRack != null) {
        result.drumMap = getDrumMap(devices, notation);
        result.drumRackPath = drumRack.path;
      }
    }
  }

  if (chainsForDrumMap) {
    stripInternalChains(result, includeDrumPads);
  }

  return result;
}

/**
 * Depth to walk the device tree at.
 *
 * A kit can sit several racks down, and read-track finds it there because it
 * reads at the shared default depth. Match that when the tree is being walked
 * only to build the map — it gets stripped from the response afterwards, so the
 * extra depth costs nothing visible. When the caller asked for chains too,
 * their maxDepth governs what's rendered; the floor of 1 is what reaches a rack
 * one level in.
 * @param maxDepth - Depth the caller asked for
 * @param includeDrumMap - Whether the drum map was requested
 * @param chainsForDrumMap - Whether chains are being read only for the map
 * @returns Depth to read at
 */
export function drumMapReadDepth(
  maxDepth: number,
  includeDrumMap: boolean,
  chainsForDrumMap: boolean,
): number {
  if (chainsForDrumMap) {
    return Math.max(DEFAULT_MAX_DEPTH, maxDepth);
  }

  return includeDrumMap ? Math.max(1, maxDepth) : maxDepth;
}

/**
 * Devices a drum map can be built from, or null when the target can't have one.
 *
 * Notes reach a device or a plain chain directly, so a kit inside either plays
 * by its own pitches. A drum pad and its drum chains sit behind the pad's note
 * remap, where only the pad's note plays — so a kit in there gets no map. That
 * is the same rule that stops getDrumMap's search at the outer kit.
 * @param result - Device, chain, or drum pad result
 * @returns Devices to search, or null if a drum map doesn't apply here
 */
function drumMapSource(
  result: Record<string, unknown>,
): DeviceWithDrumPads[] | null {
  // A drum pad result carries no `type`; feeding one to getDrumMap crashed it.
  if (result.type == null || result.type === "DrumChain") {
    return null;
  }

  if (result.type === "Chain") {
    return (result.devices ?? []) as DeviceWithDrumPads[];
  }

  return [result as unknown as DeviceWithDrumPads];
}

/**
 * Say why a drum map is missing, but only when the caller named it. With
 * `include: ["*"]` nothing was singled out, so silence matches how a device
 * with no kit in it already answers.
 * @param result - Result that has no drum map
 * @param drumMapExplicit - Whether "drum-map" was named outright
 */
function warnNoDrumMap(
  result: Record<string, unknown>,
  drumMapExplicit: boolean,
): void {
  if (!drumMapExplicit) return;

  const kind = result.type == null ? "drum pad" : "drum chain";

  console.warn(
    `readDevice: a ${kind} has no drum map of its own — read its drum rack for the kit's map`,
  );
}

/**
 * Drop chain data fetched only to build the map. A chain result keeps its own
 * devices, so their chains go too — otherwise a drum-map read of a chain path
 * answers with the whole rack tree below it.
 * @param result - Result to strip in place
 * @param keepDrumPads - Whether the caller asked for the pads themselves, so
 *   they survive the strip (without the chains hanging off them)
 */
function stripInternalChains(
  result: Record<string, unknown>,
  keepDrumPads: boolean,
): void {
  delete result.chains;
  delete result.hasSoloedChain;

  if (keepDrumPads && Array.isArray(result.drumPads)) {
    // The pads stay, but not their chains: chains are forced on to build the
    // map, and a pad read without the map never carries them. The count takes
    // the array's place, which is what such a read reports.
    for (const pad of result.drumPads) {
      const padFields = pad as Record<string, unknown>;

      if (Array.isArray(padFields.chains)) {
        padFields.chainCount = padFields.chains.length;
      }

      delete padFields.chains;
    }
  } else {
    delete result.drumPads;
  }

  if (Array.isArray(result.devices)) {
    for (const device of result.devices) {
      stripInternalChains(device as Record<string, unknown>, keepDrumPads);
    }
  }
}
