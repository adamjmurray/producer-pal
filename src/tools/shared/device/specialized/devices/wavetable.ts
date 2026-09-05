// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/max/v8-max-console.ts";
import { toLiveApiId } from "#src/tools/shared/utils.ts";
import { exclusiveModes } from "../specialized-device-inactive.ts";
import {
  enumParam,
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
  MOD_SOURCES,
  readModulations,
  setModulationAction,
} from "./wavetable-modulation-helpers.ts";

// Wavetable (WavetableDevice, class_name "InstrumentVector"). See
// dev/specialized-devices/instruments.md.
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
 *
 * Order dependence: the wavetable list is category-scoped, so writing
 * `oscNCategory` first re-populates `${oscListProp}` and a same-call
 * `oscNWavetable` write reads from the NEW list. Staging both in one
 * `update-device` params batch will use whichever wavetable name happens to
 * exist in the new category — which may not be the wavetable the caller meant.
 * Apply category and wavetable in separate calls when the category is changing.
 * (docs-only mitigation; snapshot-validate left out of scope.)
 *
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
    write: (device, value) => {
      const list = device.getPropertyList(
        "oscillator_wavetable_categories",
      ) as string[];
      const index = list.indexOf(String(value));

      if (index < 0) {
        console.warn(
          `"${String(value)}" is not a valid ${categoryName}. Available: ${list.join(", ")}`,
        );

        return false;
      }

      device.set(categoryProp, index);

      return true;
    },
  };

  const wavetableParam: PseudoParam = {
    name: wavetableName,
    read: (device) => {
      const list = device.getPropertyList(oscListProp) as string[];
      const index = device.getProperty(wavetableIndexProp) as number;

      return list[index];
    },
    write: (device, value) => {
      const list = device.getPropertyList(oscListProp) as string[];
      const index = list.indexOf(String(value));

      if (index < 0) {
        console.warn(
          `"${String(value)}" is not a valid ${wavetableName}. Available: ${list.join(", ")}`,
        );

        return false;
      }

      device.set(wavetableIndexProp, index);

      return true;
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

  // Each LFO keeps a free-running Hz "Rate" and a tempo-synced note-value
  // "S. Rate"; only one applies per "Sync" mode, but Live reports both active.
  inactiveWhen: [
    exclusiveModes("LFO 1 Sync", {
      Free: "LFO 1 Rate",
      Tempo: "LFO 1 S. Rate",
    }),
    exclusiveModes("LFO 2 Sync", {
      Free: "LFO 2 Rate",
      Tempo: "LFO 2 S. Rate",
    }),
  ],

  params: [
    enumParam("filterRouting", "filter_routing", FILTER_ROUTING),
    enumParam("monoPoly", "mono_poly", MONO_POLY),
    {
      name: "polyVoices",
      options: POLY_VOICES,
      read: readPolyVoices,
      write: (device, value) =>
        writeIntFromSet(
          device,
          "poly_voices",
          value,
          POLY_VOICES,
          "polyVoices",
          true,
        ),
    },
    enumParam("unisonMode", "unison_mode", UNISON_MODES),
    {
      name: "unisonVoiceCount",
      options: "2-8",
      read: readUnisonVoiceCount,
      write: (device, value) =>
        writeIntInRange(
          device,
          "unison_voice_count",
          value,
          2,
          8,
          "unisonVoiceCount",
        ),
    },
    enumParam("osc1Engine", "oscillator_1_effect_mode", OSC_ENGINES),
    enumParam("osc2Engine", "oscillator_2_effect_mode", OSC_ENGINES),
    osc1CategoryParam,
    osc2CategoryParam,
    osc1WavetableParam,
    osc2WavetableParam,
  ],

  actions: {
    setModulation: {
      handler: setModulationAction,
      signature:
        "setModulation('<targetParamName>', '<source>', <amount -1..1>)",
      description:
        "Set a mod-matrix amount routing a source to a target parameter",
    },
    clearModulation: {
      handler: clearModulationAction,
      signature: "clearModulation('<targetParamName>', '<source>')",
      description: "Clear a mod-matrix routing from a source to a target",
    },
    addModulationTarget: {
      handler: addModulationTargetAction,
      signature: "addModulationTarget('<paramName>')",
      description: "Add a parameter as a modulation target so it can be routed",
    },
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
      modulationSources: MOD_SOURCES,
      modulatableParameters,
      oscWavetableCategories,
      osc1Wavetables,
      osc2Wavetables,
    };
  },
};
