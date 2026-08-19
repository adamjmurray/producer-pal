// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { noteNameToMidi } from "#src/shared/pitch.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { type ParamEntry } from "#src/tools/device/update/device-params-schema.ts";
import { applyChainMixer } from "#src/tools/shared/device/helpers/chain-mixer-helpers.ts";
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
 */
export function updateDeviceProperties(
  target: LiveAPI,
  type: string,
  options: UpdatePropertyOptions,
): void {
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
    chokeGroup,
    mappedPitch,
    force,
  } = options;

  if (params != null) {
    setParamValues(target, params, "updateDevice", force);
  }

  if (actions != null) {
    applySpecializedActions(target, actions, "updateDevice");
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
    warnIfSet("macroVariation", macroVariation, type);
    warnIfSet("macroVariationIndex", macroVariationIndex, type);
    warnIfSet("macroCount", macroCount, type);
  }

  warnIfSet("mute", mute, type);
  warnIfSet("solo", solo, type);
  warnIfSet("color", color, type);
  warnIfSet("gainDb", gainDb, type);
  warnIfSet("pan", pan, type);
  warnIfSet("sendGainDb", sendGainDb, type);
  warnIfSet("sendReturn", sendReturn, type);
  warnIfSet("chokeGroup", chokeGroup, type);
  warnIfSet("mappedPitch", mappedPitch, type);
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
  warnIfSet("params", options.params, type);
  warnIfSet("actions", options.actions, type);
  warnIfSet("macroVariation", options.macroVariation, type);
  warnIfSet("macroVariationIndex", options.macroVariationIndex, type);
  warnIfSet("macroCount", options.macroCount, type);
  warnIfSet("abCompare", options.abCompare, type);

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
    warnIfSet("color", options.color, type);
    warnIfSet("gainDb", options.gainDb, type);
    warnIfSet("pan", options.pan, type);
    warnIfSet("sendGainDb", options.sendGainDb, type);
    warnIfSet("sendReturn", options.sendReturn, type);
  }

  if (type === "DrumChain") {
    updateDrumChainProperties(target, options);
  } else {
    warnIfSet("chokeGroup", options.chokeGroup, type);
    warnIfSet("mappedPitch", options.mappedPitch, type);
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
    const midiNote = noteNameToMidi(options.mappedPitch);

    if (midiNote != null) {
      target.set("out_note", midiNote);
    } else {
      console.warn(`updateDevice: invalid note name "${options.mappedPitch}"`);
    }
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
    options.sendReturn != null
  );
}
