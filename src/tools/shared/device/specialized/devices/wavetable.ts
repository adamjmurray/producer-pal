// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/v8-max-console.ts";
import { toLiveApiId } from "#src/tools/shared/utils.ts";
import {
  readEnumByIndex,
  writeEnumByIndex,
  writeIntFromSet,
  writeIntInRange,
} from "../specialized-device-param-helpers.ts";
import {
  type PseudoParam,
  type SpecializedDeviceSpec,
} from "../specialized-device-types.ts";
import {
  addModulationTargetAction,
  clearModulationAction,
  readModulations,
  setModulationAction,
} from "./wavetable-modulation-helpers.ts";

// Wavetable (WavetableDevice, class_name "InstrumentVector"). AJM-373. See
// dev/Specialized-Devices.md.
//
// Imperative mod-matrix API (contrast with Drift's declarative _index/_list
// approach). Matrix keyed by DeviceParameter name (not display label). Source
// indices 0-12 are hard-coded integers; no LOM list exposes source names.

const FILTER_ROUTING = ["serial", "parallel", "split"] as const;

const MONO_POLY = ["mono", "poly"] as const;

const UNISON_MODES = [
  "none",
  "classic",
  "shimmer",
  "noise",
  "phase-sync",
  "position-spread",
  "random-note",
] as const;

// oscillator_N_effect_mode index → label (the per-oscillator effect engine).
// Verified vs Live 12.4 UI (2026-05-22). The FX 1 / FX 2 knobs change meaning
// per engine, but those are regular DeviceParameters and not remapped here.
const OSC_ENGINES = ["None", "Fm", "Classic", "Modern"] as const;

// poly_voices is an INDEX into this voice-count catalog (not the raw count),
// mirroring Drift's voice_count_index. Verified vs Live 12.4 UI (2026-05-23):
// index 0-7 → these counts; 8+ silently reverts. unison_voice_count, by
// contrast, IS a raw count (range 2-8).
const POLY_VOICES = [2, 3, 4, 5, 6, 7, 8, 16] as const;

/**
 * Read poly_voices and map its catalog index to the actual voice count.
 * (poly_voices stores an index into POLY_VOICES, not the count itself.)
 * @param device - LiveAPI device object
 * @returns The voice count (2,3,4,5,6,7,8,16), or undefined
 */
function readPolyVoices(device: LiveAPI): number | undefined {
  const index = device.getProperty("poly_voices") as number;

  return POLY_VOICES[index];
}

/**
 * Read unison_voice_count as a plain number (it stores the raw count).
 * @param device - LiveAPI device object
 * @returns The unison voice count, or undefined
 */
function readUnisonVoiceCount(device: LiveAPI): number | undefined {
  return device.getProperty("unison_voice_count") as number | undefined;
}

/**
 * Build a pair of category + wavetable pseudo-params for one oscillator.
 * The category is indexed into the shared `oscillator_wavetable_categories`
 * list; the wavetable is indexed into the per-oscillator `${oscListProp}` list.
 * DRY: osc1 and osc2 category/wavetable params are structurally identical.
 * @param paramPrefix - Pseudo-param name prefix ("osc1" or "osc2")
 * @param categoryProp - Live API property for the category index
 * @param wavetableIndexProp - Live API property for the wavetable index
 * @param oscListProp - Live API property for the per-osc wavetable list
 * @returns Tuple of [categoryParam, wavetableParam]
 */
function buildOscParams(
  paramPrefix: string,
  categoryProp: string,
  wavetableIndexProp: string,
  oscListProp: string,
): [PseudoParam, PseudoParam] {
  const categoryName = `${paramPrefix}Category`;
  const wavetableName = `${paramPrefix}Wavetable`;

  const categoryParam: PseudoParam = {
    name: categoryName,
    read: (device) => {
      const list = device.getPropertyList(
        "oscillator_wavetable_categories",
      ) as string[];
      const index = device.getProperty(categoryProp) as number;

      return list[index];
    },
    write: (device, value, toolName) => {
      const list = device.getPropertyList(
        "oscillator_wavetable_categories",
      ) as string[];
      const index = list.indexOf(String(value));

      if (index < 0) {
        console.warn(
          `${toolName}: "${String(value)}" is not a valid ${categoryName}. Available: ${list.join(", ")}`,
        );

        return;
      }

      device.set(categoryProp, index);
    },
  };

  const wavetableParam: PseudoParam = {
    name: wavetableName,
    read: (device) => {
      const list = device.getPropertyList(oscListProp) as string[];
      const index = device.getProperty(wavetableIndexProp) as number;

      return list[index];
    },
    write: (device, value, toolName) => {
      const list = device.getPropertyList(oscListProp) as string[];
      const index = list.indexOf(String(value));

      if (index < 0) {
        console.warn(
          `${toolName}: "${String(value)}" is not a valid ${wavetableName}. Available: ${list.join(", ")}`,
        );

        return;
      }

      device.set(wavetableIndexProp, index);
    },
  };

  return [categoryParam, wavetableParam];
}

const [osc1CategoryParam, osc1WavetableParam] = buildOscParams(
  "osc1",
  "oscillator_1_wavetable_category",
  "oscillator_1_wavetable_index",
  "oscillator_1_wavetables",
);

const [osc2CategoryParam, osc2WavetableParam] = buildOscParams(
  "osc2",
  "oscillator_2_wavetable_category",
  "oscillator_2_wavetable_index",
  "oscillator_2_wavetables",
);

export const wavetableSpec: SpecializedDeviceSpec = {
  displayNames: ["Wavetable"],

  params: [
    {
      name: "filterRouting",
      read: (device) =>
        readEnumByIndex(device, "filter_routing", FILTER_ROUTING),
      write: (device, value, toolName) =>
        writeEnumByIndex(
          device,
          "filter_routing",
          value,
          FILTER_ROUTING,
          toolName,
          "filterRouting",
        ),
    },
    {
      name: "monoPoly",
      read: (device) => readEnumByIndex(device, "mono_poly", MONO_POLY),
      write: (device, value, toolName) =>
        writeEnumByIndex(
          device,
          "mono_poly",
          value,
          MONO_POLY,
          toolName,
          "monoPoly",
        ),
    },
    {
      name: "polyVoices",
      read: readPolyVoices,
      write: (device, value, toolName) =>
        writeIntFromSet(
          device,
          "poly_voices",
          value,
          POLY_VOICES,
          toolName,
          "polyVoices",
          true,
        ),
    },
    {
      name: "unisonMode",
      read: (device) => readEnumByIndex(device, "unison_mode", UNISON_MODES),
      write: (device, value, toolName) =>
        writeEnumByIndex(
          device,
          "unison_mode",
          value,
          UNISON_MODES,
          toolName,
          "unisonMode",
        ),
    },
    {
      name: "unisonVoiceCount",
      read: readUnisonVoiceCount,
      write: (device, value, toolName) =>
        writeIntInRange(
          device,
          "unison_voice_count",
          value,
          2,
          8,
          toolName,
          "unisonVoiceCount",
        ),
    },
    {
      name: "osc1Engine",
      read: (device) =>
        readEnumByIndex(device, "oscillator_1_effect_mode", OSC_ENGINES),
      write: (device, value, toolName) =>
        writeEnumByIndex(
          device,
          "oscillator_1_effect_mode",
          value,
          OSC_ENGINES,
          toolName,
          "osc1Engine",
        ),
    },
    {
      name: "osc2Engine",
      read: (device) =>
        readEnumByIndex(device, "oscillator_2_effect_mode", OSC_ENGINES),
      write: (device, value, toolName) =>
        writeEnumByIndex(
          device,
          "oscillator_2_effect_mode",
          value,
          OSC_ENGINES,
          toolName,
          "osc2Engine",
        ),
    },
    osc1CategoryParam,
    osc2CategoryParam,
    osc1WavetableParam,
    osc2WavetableParam,
  ],

  actions: {
    setModulation: setModulationAction,
    clearModulation: clearModulationAction,
    addModulationTarget: addModulationTargetAction,
  },

  readModulations,

  readOptions(device) {
    // Shared category catalog (both oscillators index into it). Surface it so
    // the LLM can switch categories — each osc's wavetable list below is scoped
    // to its currently-selected category.
    const oscWavetableCategories = device.getPropertyList(
      "oscillator_wavetable_categories",
    ) as string[];
    const osc1Wavetables = device.getPropertyList(
      "oscillator_1_wavetables",
    ) as string[];
    const osc2Wavetables = device.getPropertyList(
      "oscillator_2_wavetables",
    ) as string[];

    const modulatableParameters: string[] = [];
    const children = device.getChildren("parameters");

    for (const param of children) {
      const isModulatable = device.call(
        "is_parameter_modulatable",
        toLiveApiId(param.id),
      );

      if (isModulatable === 1) {
        modulatableParameters.push(String(param.getProperty("name")));
      }
    }

    return {
      modulatableParameters,
      oscWavetableCategories,
      osc1Wavetables,
      osc2Wavetables,
    };
  },
};
