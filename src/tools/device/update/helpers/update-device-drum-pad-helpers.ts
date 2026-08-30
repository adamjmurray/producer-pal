// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/max/v8-max-console.ts";
import { type DrumPadGroup } from "#src/tools/shared/device/helpers/path/device-drumpad-navigation.ts";
import { pathField } from "#src/tools/shared/validation/object-path-for-api.ts";
import {
  moveDrumChainToPath,
  stripReturnChainLetter,
} from "./update-device-helpers.ts";
import {
  type UpdateTargetOptions,
  updateNonDeviceProperties,
} from "./update-device-property-helpers.ts";

// Settings that belong to one layer. Writing one absolute value to every layer
// of a stacked pad flattens the balance between them, and `name` has no pad-wide
// meaning at all — Live just shows "Multi".
const PER_LAYER_PROPS = [
  "name",
  "gainDb",
  "pan",
  "sendGainDb",
  "sendReturn",
] as const;

// Anything that lands on a chain rather than on the DrumPad object.
const CHAIN_WRITE_PROPS = [
  "toPath",
  "mute",
  "solo",
  "color",
  "chokeGroup",
  "mappedPitch",
  ...PER_LAYER_PROPS,
] as const;

export interface DrumPadUpdateResult {
  /** The DrumPad's id, absent on a virtual pad that has no DrumPad object */
  id?: string;
  /** The pad's path, so a whole-pad write names its target the way every other
   * write result does. Absent on a virtual pad, which has nothing to name. */
  path?: string;
  /** The chains written to, absent when only the pad itself was touched */
  chainIds?: string[];
}

/**
 * Update a whole drum pad: the DrumPad object and every chain on it. Pad-wide
 * properties broadcast across the chains; the per-layer ones are skipped with a
 * warning once a pad holds more than one. A single-chain pad takes everything,
 * exactly as a chain path does.
 * @param group - The pad and its chains
 * @param padPath - The pad path as written, e.g. "t0/d0/pC1"
 * @param options - Update options
 * @returns The pad's id and path, and the ids of the chains written to
 */
export function updateDrumPadGroup(
  group: DrumPadGroup,
  padPath: string,
  options: UpdateTargetOptions,
): DrumPadUpdateResult {
  const { pad, chains } = group;
  const applicable =
    chains.length > 1 ? dropPerLayerProps(options, padPath, chains) : options;

  // mute/solo go to the DrumPad where there is one: Live broadcasts them to the
  // pad's chains itself, and reads them back aggregated.
  const muteSoloOnPad =
    pad != null && (applicable.mute != null || applicable.solo != null);

  if (muteSoloOnPad) {
    updateNonDeviceProperties(pad, "DrumPad", {
      mute: applicable.mute,
      solo: applicable.solo,
    });
  }

  const chainOptions = muteSoloOnPad
    ? { ...applicable, mute: undefined, solo: undefined }
    : applicable;

  applyToChains(chains, chainOptions);

  const result: DrumPadUpdateResult = {};

  if (pad != null) Object.assign(result, { id: pad.id }, pathField(pad));

  if (CHAIN_WRITE_PROPS.some((key) => chainOptions[key] != null)) {
    result.chainIds = chains.map((chain) => chain.id);
  }

  return result;
}

/**
 * Write the pad's properties to its chains.
 * @param chains - The pad's chains, in rack order
 * @param options - Update options, already filtered for this pad
 */
function applyToChains(chains: LiveAPI[], options: UpdateTargetOptions): void {
  const first = chains[0] as LiveAPI;

  // in_note is what puts a chain on a pad, and this already retargets every
  // chain sharing the note, so the whole pad lands together.
  if (options.toPath != null) {
    moveDrumChainToPath(first, options.toPath, true);
  }

  // Only reachable on a single-chain pad; a stacked pad drops `name` above.
  if (options.name != null) {
    first.set("name", stripReturnChainLetter(first, options.name));
  }

  for (const [index, chain] of chains.entries()) {
    // The first chain carries the full options so the "not applicable to
    // DrumChain" warnings are emitted once, not once per layer.
    updateNonDeviceProperties(
      chain,
      "DrumChain",
      index === 0 ? options : broadcastOnly(options),
    );
  }
}

/**
 * The subset every chain on a pad should receive.
 * @param options - Update options
 * @returns Options holding only the pad-wide properties
 */
function broadcastOnly(options: UpdateTargetOptions): UpdateTargetOptions {
  return {
    mute: options.mute,
    solo: options.solo,
    color: options.color,
    chokeGroup: options.chokeGroup,
    mappedPitch: options.mappedPitch,
  };
}

/**
 * Drop the per-layer properties from a stacked pad's update and say which chain
 * paths to use instead.
 * @param options - Update options
 * @param padPath - The pad path as written, e.g. "t0/d0/pC1"
 * @param chains - The pad's chains
 * @returns Options with the per-layer properties removed
 */
function dropPerLayerProps(
  options: UpdateTargetOptions,
  padPath: string,
  chains: LiveAPI[],
): UpdateTargetOptions {
  const skipped = PER_LAYER_PROPS.filter((key) => options[key] != null);

  if (skipped.length === 0) return options;

  const chainPaths = chains
    .map((_, index) => `${padPath}/c${index}`)
    .join(", ");

  console.warn(
    `updateDevice: "${padPath}" has ${chains.length} layers, so per-layer ` +
      `settings (${skipped.join(", ")}) were skipped. ` +
      `Set them on ${chainPaths}.`,
  );

  const remaining: UpdateTargetOptions = { ...options };

  for (const key of skipped) {
    delete remaining[key];
  }

  return remaining;
}
