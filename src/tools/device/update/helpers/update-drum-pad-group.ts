// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/max/v8-max-console.ts";
import { type ParamEntry } from "#src/tools/device/update/device-params-schema.ts";
import {
  type ParamResult,
  skippedParam,
} from "#src/tools/shared/device/helpers/param-reading.ts";
import {
  ambiguousLayerReason,
  isSampleParam,
} from "#src/tools/shared/device/pad-sample-messages.ts";
import { midiToNoteName } from "#src/shared/pitch.ts";
import { resolveOrCreateDrumPadChain } from "#src/tools/shared/device/helpers/chain-auto-creation.ts";
import {
  type DrumPadGroup,
  drumRackOfPad,
} from "#src/tools/shared/device/helpers/path/device-drumpad-navigation.ts";
import {
  pathField,
  pathTargetLabel,
} from "#src/tools/shared/validation/object-path-for-api.ts";
import { stripReturnChainLetter } from "./strip-return-chain-letter.ts";
import {
  type NonDeviceApplied,
  type UpdateTargetOptions,
  updateNonDeviceProperties,
} from "./update-device-properties.ts";
import { moveDrumChainToPath } from "./move-drum-chain.ts";

// Settings that belong to one layer. Writing one absolute value to every layer
// of a stacked pad flattens the balance between them, and `name` has no pad-wide
// meaning at all — Live just shows "Multi".
const PER_LAYER_PROPS = [
  "name",
  "gainDb",
  "pan",
  "sendGainDb",
  "sendReturn",
  "sends",
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

export interface DrumPadUpdateResult extends NonDeviceApplied {
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
 * @throws Error for a pad with no chains, which Live ignores every write to
 */
export function updateDrumPadGroup(
  group: DrumPadGroup,
  padPath: string,
  options: UpdateTargetOptions,
): DrumPadUpdateResult {
  const { pad } = group;
  const padLabel = pathTargetLabel(pad, padPath);
  // A sample write makes the pad's chain, exactly as the rack's `pC1/sample`
  // shortcut does — the pad is the address either way. The new chain then takes
  // the whole call: a one-layer pad is what the pad now is.
  const chains =
    group.chains.length === 0
      ? createChainForSample(pad, options)
      : group.chains;

  // Live drops every write to a pad with no chains — `set` returns 1 and the
  // read-back stays 0 — so there is nothing here to write, and saying the
  // write landed would be a lie.
  if (chains.length === 0) {
    throw new Error(
      `drum pad ${padLabel} has no chains, so there is nothing ` +
        `to update — Live ignores writes to an empty pad`,
    );
  }

  const layered =
    chains.length > 1
      ? dropPerLayerProps(options, padPath, padLabel, chains)
      : options;
  // A sample belongs to one layer, so a stacked pad has to say which — the
  // same ambiguity the rack's `pC1/sample` shortcut refuses. Left in place on a
  // single-layer pad, where naming the pad names the layer.
  const ambiguous =
    chains.length > 1 ? dropAmbiguousSamples(layered, padPath, chains) : null;
  const applicable = ambiguous?.options ?? layered;

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

  // Only a single-layer pad reaches the chain mixer — the per-layer settings
  // are dropped above once a pad is stacked — so this is one chain's read-back.
  const mixer = applyToChains(chains, chainOptions);

  const result: DrumPadUpdateResult = { ...mixer };
  const skipped = ambiguous?.skipped ?? [];

  if (skipped.length > 0) {
    result.params = inRequestOrder(options.params ?? [], [
      ...skipped,
      ...(mixer.params ?? []),
    ]);
  }

  if (pad != null) {
    Object.assign(result, { id: pad.id }, pathField(pad));
  }

  if (CHAIN_WRITE_PROPS.some((key) => chainOptions[key] != null)) {
    result.chainIds = chains.map((chain) => chain.id);
  }

  return result;
}

/**
 * The entries in the order the call sent its params. The ambiguous samples are
 * taken out of the list before the rest are written, so the two sets come back
 * separately; each entry is matched to its request by the name it was sent under.
 * @param sent - The params list as the caller sent it
 * @param entries - Every entry the write produced
 * @returns The entries, in request order
 */
function inRequestOrder(
  sent: ParamEntry[],
  entries: ParamResult[],
): ParamResult[] {
  const sentAt = new Map(
    sent.map((entry, index): [string, number] => [
      entry.name.trim().toLowerCase(),
      index,
    ]),
  );
  const position = (entry: ParamResult): number =>
    sentAt.get(entry.name.trim().toLowerCase()) ?? sent.length;

  return entries.toSorted((a, b) => position(a) - position(b));
}

/**
 * Make the chain a `sample` write needs on an empty pad. Only a sample creates
 * one — every other setting would land on a chain the caller never asked for.
 * @param pad - The DrumPad, or null on a virtual pad that has none
 * @param options - Update options
 * @returns The new chain as the pad's only layer, or none when nothing was made
 */
function createChainForSample(
  pad: LiveAPI | null,
  options: UpdateTargetOptions,
): LiveAPI[] {
  const wantsSample = (options.params ?? []).some((entry) =>
    isSampleParam(entry.name.trim()),
  );

  if (!wantsSample || pad == null) {
    return [];
  }

  const note = midiToNoteName(pad.getProperty("note") as number);

  if (note == null) {
    return [];
  }

  const chain = resolveOrCreateDrumPadChain(drumRackOfPad(pad), note, []);

  return chain?.exists() ? [chain] : [];
}

/**
 * Write the pad's properties to its chains.
 * @param chains - The pad's chains, in rack order
 * @param options - Update options, already filtered for this pad
 * @returns The first chain's mixer read-back; the rest only take pad-wide props
 */
function applyToChains(
  chains: LiveAPI[],
  options: UpdateTargetOptions,
): NonDeviceApplied {
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

  let mixer: NonDeviceApplied = {};

  for (const [index, chain] of chains.entries()) {
    // The first chain carries the full options so the "not applicable to
    // DrumChain" warnings are emitted once, not once per layer.
    const applied = updateNonDeviceProperties(
      chain,
      "DrumChain",
      index === 0 ? options : broadcastOnly(options),
    );

    if (index === 0) {
      mixer = applied;
    }
  }

  return mixer;
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
 * @param padLabel - How the warning names the pad
 * @param chains - The pad's chains
 * @returns Options with the per-layer properties removed
 */
function dropPerLayerProps(
  options: UpdateTargetOptions,
  padPath: string,
  padLabel: string,
  chains: LiveAPI[],
): UpdateTargetOptions {
  const skipped = PER_LAYER_PROPS.filter((key) => options[key] != null);

  if (skipped.length === 0) {
    return options;
  }

  const chainPaths = chains
    .map((_, index) => `${padPath}/c${index}`)
    .join(", ");

  console.warn(
    `${padLabel} has ${chains.length} layers, so per-layer ` +
      `settings (${skipped.join(", ")}) were skipped. ` +
      `Set them on ${chainPaths}.`,
  );

  const remaining: UpdateTargetOptions = { ...options };

  for (const key of skipped) {
    delete remaining[key];
  }

  return remaining;
}

/**
 * Drop the `sample` entries of a stacked pad's `params` write and say which
 * layer to address instead. Which layer to load is the caller's to settle:
 * writing "the pad" would load whichever layer happens to be first, and under
 * `force` replace an instrument nobody named.
 * @param options - Update options
 * @param padPath - The pad path as written, e.g. "t0/d0/pC1"
 * @param chains - The pad's chains
 * @returns The remaining options and the skipped entries, or null when the
 *   write named no sample
 */
function dropAmbiguousSamples(
  options: UpdateTargetOptions,
  padPath: string,
  chains: LiveAPI[],
): { options: UpdateTargetOptions; skipped: ParamResult[] } | null {
  const params = options.params ?? [];
  const samples = params.filter((entry) => isSampleParam(entry.name.trim()));

  if (samples.length === 0) {
    return null;
  }

  // The retries are paths, not param names: a path is what this caller sends.
  const reason = ambiguousLayerReason(
    padPath,
    chains.map((_, index) => `${padPath}/c${index}`),
  );

  return {
    options: {
      ...options,
      params: params.filter((entry) => !samples.includes(entry)),
    },
    skipped: samples.map((entry) => skippedParam(entry.name, reason)),
  };
}
