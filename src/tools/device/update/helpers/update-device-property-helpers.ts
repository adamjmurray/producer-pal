// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { noteNameToMidi } from "#src/shared/pitch.ts";
import { type ParamEntry } from "#src/tools/device/update/device-params-schema.ts";
import {
  type ParamValueResult,
  refreshParamValues,
} from "#src/tools/shared/device/helpers/device-display-helpers.ts";
import {
  applyChainMixer,
  type ChainSend,
} from "#src/tools/shared/device/helpers/chain-mixer-helpers.ts";
import { applySpecializedActions } from "#src/tools/shared/device/specialized/specialized-device-registry.ts";
import {
  setParamValues,
  updateABCompare,
  updateMacroCount,
  updateMacroVariation,
} from "./update-device-helpers.ts";
import {
  isChainType,
  isRackDevice,
  warnIfSet,
} from "./update-device-type-helpers.ts";

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

/**
 * Update device-specific properties
 * @param target - Device to update
 * @param type - Device type
 * @param options - Update options
 * @returns What each written param reads as after the write
 */
export function updateDeviceProperties(
  target: LiveAPI,
  type: string,
  options: UpdatePropertyOptions,
): ParamValueResult[] {
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
    warnIfSet("macroVariation", macroVariation, type, target);
    warnIfSet("macroVariationIndex", macroVariationIndex, type, target);
    warnIfSet("macroCount", macroCount, type, target);
  }

  warnIfSet("mute", mute, type, target);
  warnIfSet("solo", solo, type, target);
  warnIfSet("color", color, type, target);
  warnIfSet("gainDb", gainDb, type, target);
  warnIfSet("pan", pan, type, target);
  warnIfSet("sendGainDb", sendGainDb, type, target);
  warnIfSet("sendReturn", sendReturn, type, target);
  warnIfSet("sends", sends, type, target);
  warnIfSet("chokeGroup", chokeGroup, type, target);
  warnIfSet("mappedPitch", mappedPitch, type, target);

  return refreshParamValues(paramResults);
}

/**
 * Update chain/drum pad properties
 * @param target - Chain or drum pad to update
 * @param type - Target type
 * @param options - Update options
 */
export function updateNonDeviceProperties(
  target: LiveAPI,
  type: string,
  options: UpdatePropertyOptions,
): void {
  warnIfSet("params", options.params, type, target);
  warnIfSet("actions", options.actions, type, target);
  warnIfSet("macroVariation", options.macroVariation, type, target);
  warnIfSet("macroVariationIndex", options.macroVariationIndex, type, target);
  warnIfSet("macroCount", options.macroCount, type, target);
  warnIfSet("abCompare", options.abCompare, type, target);

  if (options.mute != null) {
    target.set("mute", options.mute ? 1 : 0);
  }

  if (options.solo != null) {
    target.set("solo", options.solo ? 1 : 0);
  }

  if (isChainType(type)) {
    if (options.color != null) {
      target.setColor(options.color);
    }

    if (hasChainMixerParams(options)) {
      applyChainMixer(target, options);
    }
  } else {
    warnIfSet("color", options.color, type, target);
    warnIfSet("gainDb", options.gainDb, type, target);
    warnIfSet("pan", options.pan, type, target);
    warnIfSet("sendGainDb", options.sendGainDb, type, target);
    warnIfSet("sendReturn", options.sendReturn, type, target);
    warnIfSet("sends", options.sends, type, target);
  }

  if (type === "DrumChain") {
    updateDrumChainProperties(target, options);
  } else {
    warnIfSet("chokeGroup", options.chokeGroup, type, target);
    warnIfSet("mappedPitch", options.mappedPitch, type, target);
  }
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
