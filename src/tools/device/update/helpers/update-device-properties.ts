// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { noteNameToMidi } from "#src/shared/pitch.ts";
import { type ParamEntry } from "#src/tools/device/update/device-params-schema.ts";
import {
  type ParamResult,
  refreshParamValues,
} from "#src/tools/shared/device/helpers/param-reading.ts";
import { applyChainSampleParams } from "./chain-sample-params.ts";
import {
  applyChainMixer,
  type ChainSend,
} from "#src/tools/shared/device/helpers/chain-mixer.ts";
import {
  chainMixerReport,
  type ChainMixerReport,
} from "./chain-mixer-report.ts";
import { applySpecializedActions } from "#src/tools/shared/device/specialized/specialized-device-registry.ts";
import { setParamValues } from "../update-device-param-setters.ts";
import {
  updateABCompare,
  updateMacroCount,
  updateMacroVariation,
} from "./rack-macro-updates.ts";
import { isChainType, isRackDevice, noteIfSet } from "./update-target-types.ts";

export interface UpdatePropertyOptions {
  params?: ParamEntry[];
  actions?: string[];
  macroVariation?: string;
  macroVariationIndex?: number;
  macroCount?: number;
  abCompare?: string;
  mute?: boolean;
  solo?: boolean;
  color?: string;
  gainDb?: number;
  pan?: number;
  sendGainDb?: number;
  sendReturn?: string;
  sends?: ChainSend[];
  chokeGroup?: number;
  mappedPitch?: string;
  force?: boolean;
}

export interface UpdateTargetOptions extends UpdatePropertyOptions {
  toPath?: string;
  name?: string;
}

/** What a device update wrote, and what a device has no use for. */
export interface DeviceApplied {
  /** One per param the call named: what it reads as, or why it named nothing */
  params: ParamResult[];
  ignored: string[];
}

/**
 * Update device-specific properties
 * @param target - Device to update
 * @param type - Device type
 * @param options - Update options
 * @returns What the call's params read as, and the ones a device can't take
 */
export function updateDeviceProperties(
  target: LiveAPI,
  type: string,
  options: UpdatePropertyOptions,
): DeviceApplied {
  const {
    params,
    actions,
    macroVariation,
    macroVariationIndex,
    macroCount,
    abCompare,
    mute,
    solo,
    color,
    gainDb,
    pan,
    sendGainDb,
    sendReturn,
    sends,
    chokeGroup,
    mappedPitch,
    force,
  } = options;

  const ignored: string[] = [];

  // Written first so a macroVariation "create" stores what was just set. The
  // values are read at the end instead: an A/B swap, a variation recall or a
  // specialized action below rewrites them.
  const paramResults =
    params != null ? setParamValues(target, params, force) : [];

  if (actions != null) {
    applySpecializedActions(target, actions);
  }

  if (abCompare != null) {
    updateABCompare(target, abCompare);
  }

  if (isRackDevice(type)) {
    if (macroVariation != null || macroVariationIndex != null) {
      updateMacroVariation(target, macroVariation, macroVariationIndex);
    }

    if (macroCount != null) {
      updateMacroCount(target, macroCount);
    }
  } else {
    noteIfSet(ignored, "macroVariation", macroVariation);
    noteIfSet(ignored, "macroVariationIndex", macroVariationIndex);
    noteIfSet(ignored, "macroCount", macroCount);
  }

  noteIfSet(ignored, "mute", mute);
  noteIfSet(ignored, "solo", solo);
  noteIfSet(ignored, "color", color);
  noteIfSet(ignored, "gainDb", gainDb);
  noteIfSet(ignored, "pan", pan);
  noteIfSet(ignored, "sendGainDb", sendGainDb);
  noteIfSet(ignored, "sendReturn", sendReturn);
  noteIfSet(ignored, "sends", sends);
  noteIfSet(ignored, "chokeGroup", chokeGroup);
  noteIfSet(ignored, "mappedPitch", mappedPitch);

  return { params: refreshParamValues(paramResults), ignored };
}

/** What a chain or pad update wrote: its mixer, plus any params it took. */
export interface NonDeviceWrites extends ChainMixerReport {
  params?: ParamResult[];
}

/** ...plus the params it had no use for, which the caller turns into the
 * target's reason rather than leaving in the entry. */
export interface NonDeviceApplied extends NonDeviceWrites {
  ignored: string[];
}

/**
 * Update chain/drum pad properties
 * @param target - Chain or drum pad to update
 * @param type - Target type
 * @param options - Update options
 * @returns What the chain's mixer and sample writes didn't land as asked, and
 *   the params a chain or pad can't take
 */
export function updateNonDeviceProperties(
  target: LiveAPI,
  type: string,
  options: UpdatePropertyOptions,
): NonDeviceApplied {
  // A drum pad owns its sample, so a `sample` param addressed to the pad takes
  // the same route the rack's `pC1/sample` shortcut does. Everything else in
  // `params` is still not applicable, and says so in its own entry.
  const params = applyChainSampleParams(target, type, options);
  const ignored: string[] = [];

  noteIfSet(ignored, "actions", options.actions);
  noteIfSet(ignored, "macroVariation", options.macroVariation);
  noteIfSet(ignored, "macroVariationIndex", options.macroVariationIndex);
  noteIfSet(ignored, "macroCount", options.macroCount);
  noteIfSet(ignored, "abCompare", options.abCompare);

  if (options.mute != null) {
    target.set("mute", options.mute ? 1 : 0);
  }

  if (options.solo != null) {
    target.set("solo", options.solo ? 1 : 0);
  }

  let mixer: ChainMixerReport = {};

  if (isChainType(type)) {
    if (options.color != null) {
      target.setColor(options.color);
    }

    if (hasChainMixerParams(options)) {
      mixer = chainMixerReport(applyChainMixer(target, options), options);
    }
  } else {
    noteIfSet(ignored, "color", options.color);
    noteIfSet(ignored, "gainDb", options.gainDb);
    noteIfSet(ignored, "pan", options.pan);
    noteIfSet(ignored, "sendGainDb", options.sendGainDb);
    noteIfSet(ignored, "sendReturn", options.sendReturn);
    noteIfSet(ignored, "sends", options.sends);
  }

  if (type === "DrumChain") {
    updateDrumChainProperties(target, options);
  } else {
    noteIfSet(ignored, "chokeGroup", options.chokeGroup);
    noteIfSet(ignored, "mappedPitch", options.mappedPitch);
  }

  return params.length > 0
    ? { ...mixer, params, ignored }
    : { ...mixer, ignored };
}

/**
 * Apply DrumChain-only properties (chokeGroup, mappedPitch)
 * @param target - DrumChain LiveAPI object
 * @param options - Update options
 */
function updateDrumChainProperties(
  target: LiveAPI,
  options: UpdatePropertyOptions,
): void {
  if (options.chokeGroup != null) {
    target.set("choke_group", options.chokeGroup);
  }

  if (options.mappedPitch != null) {
    // Refused up front by updateDevice, so this reads back a known-good name.
    target.set("out_note", noteNameToMidi(options.mappedPitch));
  }
}

/**
 * Whether any chain mixer param (gain, pan, send) was given
 * @param options - Update options
 * @returns True when applyChainMixer has something to do
 */
function hasChainMixerParams(options: UpdatePropertyOptions): boolean {
  return (
    options.gainDb != null ||
    options.pan != null ||
    options.sendGainDb != null ||
    options.sendReturn != null ||
    options.sends != null
  );
}

// ============================================================================
// Collapsed state — kept for potential future use
// ============================================================================

// export function updateCollapsedState(
//   device: LiveAPI,
//   collapsed: boolean,
// ): void {
//   const deviceView = LiveAPI.from(`${device.path} view`);
//   if (deviceView.exists()) {
//     deviceView.set("is_collapsed", collapsed ? 1 : 0);
//   }
// }
