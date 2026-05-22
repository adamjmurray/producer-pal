// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/v8-max-console.ts";
import {
  coerceInt,
  readEnumByIndex,
  writeEnumByIndex,
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
// dev/plans/Specialized-Device-Classes.md.
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

/**
 * Read an integer property as a plain number (undefined on non-number).
 * @param device - LiveAPI device object
 * @param property - Live API property name
 * @returns The integer value, or undefined
 */
function readIntProp(device: LiveAPI, property: string): number | undefined {
  return device.getProperty(property) as number | undefined;
}

/**
 * Write an integer property, coercing and warning on non-integer input.
 * Live silently reverts out-of-range values; the caller pre-validates range
 * where needed (e.g. engine mode). Used for polyVoices and unisonVoiceCount
 * where Live accepts any int but silently rejects out-of-range values.
 * @param device - LiveAPI device object
 * @param property - Live API property name
 * @param value - Incoming value
 * @param paramName - Pseudo-param name for warning text
 * @param toolName - Calling tool name for warning prefix
 */
function writeIntProp(
  device: LiveAPI,
  property: string,
  value: string | number,
  paramName: string,
  toolName: string,
): void {
  const n = coerceInt(value);

  if (n == null) {
    console.warn(
      `${toolName}: ${paramName} must be an integer (got "${String(value)}")`,
    );

    return;
  }

  device.set(property, n);
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
      const list = device.getProperty(
        "oscillator_wavetable_categories",
      ) as string[];
      const index = device.getProperty(categoryProp) as number;

      return list[index];
    },
    write: (device, value, toolName) => {
      const list = device.getProperty(
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
      const list = device.getProperty(oscListProp) as string[];
      const index = device.getProperty(wavetableIndexProp) as number;

      return list[index];
    },
    write: (device, value, toolName) => {
      const list = device.getProperty(oscListProp) as string[];
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
      read: (device) => readIntProp(device, "poly_voices"),
      write: (device, value, toolName) =>
        writeIntProp(device, "poly_voices", value, "polyVoices", toolName),
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
      read: (device) => readIntProp(device, "unison_voice_count"),
      write: (device, value, toolName) =>
        writeIntProp(
          device,
          "unison_voice_count",
          value,
          "unisonVoiceCount",
          toolName,
        ),
    },
    {
      // TODO(AJM-373): map to a string enum (likely none/FM/classic/modern)
      // once verified vs Live UI.
      name: "osc1Engine",
      read: (device) => readIntProp(device, "oscillator_1_effect_mode"),
      write: (device, value, toolName) =>
        writeIntInRange(
          device,
          "oscillator_1_effect_mode",
          value,
          0,
          3,
          toolName,
          "osc1Engine",
        ),
    },
    {
      // TODO(AJM-373): map to a string enum (likely none/FM/classic/modern)
      // once verified vs Live UI.
      name: "osc2Engine",
      read: (device) => readIntProp(device, "oscillator_2_effect_mode"),
      write: (device, value, toolName) =>
        writeIntInRange(
          device,
          "oscillator_2_effect_mode",
          value,
          0,
          3,
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
    const osc1Wavetables = device.getProperty(
      "oscillator_1_wavetables",
    ) as string[];
    const osc2Wavetables = device.getProperty(
      "oscillator_2_wavetables",
    ) as string[];

    const modulatableParameters: string[] = [];
    const children = device.getChildren("parameters");

    for (const param of children) {
      const isModulatable = device.call("is_parameter_modulatable", param);

      if (isModulatable === 1) {
        modulatableParameters.push(String(param.getProperty("name")));
      }
    }

    return { modulatableParameters, osc1Wavetables, osc2Wavetables };
  },
};
