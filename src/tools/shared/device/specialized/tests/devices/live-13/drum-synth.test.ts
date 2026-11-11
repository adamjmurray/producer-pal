// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import "#src/live-api-adapter/live-api-extensions.ts";

import { describe, expect, it } from "vitest";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { drumSynthSpec } from "../../../devices/live-13/drum-synth.ts";
import {
  applySpecializedInactiveStates,
  getSpecForDevice,
  isParamInactiveBySpecialized,
} from "../../../specialized-device-registry.ts";

// The 57 params as Live 13.0b25 lists them, with the model each one belongs to.

const SHARED = [
  "Device On",
  "Sound Type",
  "Transpose",
  "Tune",
  "Decay",
  "Color",
  "Volume",
  "Vol Mod Src",
  "Vol Mod Amt",
  "Timbre Mod Src",
  "Timbre Mod Amt",
];

/** Type → its model param and each model's params. */
const TYPES: Record<string, [string, Record<string, string[]>]> = {
  Kick: [
    "Kick Model",
    {
      "Kick 80x": ["Kick 80x Click"],
      "Kick 78": ["Kick 78 Click", "Kick 78 Bend"],
      "Kick 90x": ["Kick 90x Attack", "Kick 90x Bend"],
    },
  ],
  Snare: [
    "Snare Model",
    {
      "Snare TR": ["Snare TR Snap"],
      "Snare Modal": ["Snare Modal Body", "Snare Modal Hiss"],
      "Snare Acoustic": ["Snare Acoustic Tone"],
    },
  ],
  "Rim Shot": ["Rim Model", { "Rim TR": [], Zapp: ["Zapp Snap"] }],
  HiHat: [
    "HiHat Model",
    {
      "HiHat TR": ["HiHat TR Attack", "HiHat TR Noise", "HiHat TR Type"],
      "HiHat Digi": [
        "HiHat Digi Attack",
        "HiHat Digi Stereo",
        "HiHat Digi Lock",
      ],
      Spark: ["Spark Stereo"],
    },
  ],
  Clap: [
    "Clap Model",
    {
      "Clap TR": ["Clap TR Tail", "Clap TR Stereo"],
      Marbles: ["Marbles Start", "Marbles End"],
      Guiro: ["Guiro Stroke"],
    },
  ],
  Percussion: [
    "Perc Model",
    {
      "Simple Drum": ["Simple Noise"],
      Bongo: ["Bongo Drive"],
      Timpani: ["Timpani Attack", "Timpani Bend", "Timpani Time"],
    },
  ],
  Tom: [
    "Tom Model",
    {
      "Tom 80x": ["Tom 80x Bend", "Tom 80x Click"],
      "Tom 90x": ["Tom 90x Bend"],
    },
  ],
  Cymbal: ["Cymbal Model", { "Cymbal TR": [], "Cymbal RH": [] }],
  FX: [
    "FX Model",
    {
      "Cow TR": ["Cow TR Reverb"],
      FM: ["FM Mod Amt", "FM Mod Rate"],
      Metallic: ["Metallic Smooth", "Metallic Tone"],
      Liquid: ["Liquid Glide"],
    },
  ],
};

/**
 * A Drum Synth, matched by its class_name alone.
 * @returns The device
 */
function drumSynth(): LiveAPI {
  registerMockObject("dev-1", {
    type: "Device",
    properties: { class_display_name: "Drum Synth", class_name: "DrumSynth" },
  });

  return LiveAPI.from("id dev-1");
}

/**
 * Read the device with a Sound Type and a model chosen on every type.
 * @param type - The Sound Type
 * @param models - Model param name → the model it reads
 * @returns The names left active
 */
function activeAt(type: string, models: Record<string, string>): string[] {
  const names = [
    ...SHARED,
    ...Object.entries(TYPES).flatMap(([, [modelParam, byModel]]) => [
      modelParam,
      ...Object.values(byModel).flat(),
    ]),
    "Material",
  ];
  const params: Record<string, unknown>[] = names.map((name) => ({
    name,
    value: name === "Sound Type" ? type : (models[name] ?? 0),
  }));

  expect(params).toHaveLength(57);
  applySpecializedInactiveStates(drumSynth(), params);

  return params.filter((p) => p.state == null).map((p) => p.name as string);
}

/**
 * Every type's first model, with one model swapped.
 * @param modelParam - The model param to change
 * @param model - The model to select
 * @returns Model param name → its model
 */
function firstModels(
  modelParam?: string,
  model?: string,
): Record<string, string> {
  const chosen = Object.fromEntries(
    Object.values(TYPES).map(([param, byModel]) => [
      param,
      Object.keys(byModel)[0] as string,
    ]),
  );

  return modelParam == null ? chosen : { ...chosen, [modelParam]: model! };
}

/**
 * What should be active: the shared params, the type's model param and the
 * chosen model's params.
 * @param type - The Sound Type
 * @param model - The model selected on it
 * @param extra - More params that apply at that type
 * @returns The names, sorted
 */
function expected(type: string, model: string, extra: string[] = []): string[] {
  const [modelParam, byModel] = TYPES[type]!;

  return [
    ...SHARED,
    modelParam,
    ...(byModel[model] ?? []),
    ...extra,
  ].toSorted();
}

describe("Drum Synth", () => {
  it("is found by class_name", () => {
    expect(getSpecForDevice(drumSynth())).toBe(drumSynthSpec);
  });

  it.each(Object.entries(TYPES))(
    "keeps only %s's selected model's params active",
    (type, [modelParam, byModel]) => {
      for (const model of Object.keys(byModel)) {
        const active = activeAt(type, firstModels(modelParam, model));

        expect(active.toSorted()).toStrictEqual(
          expected(type, model, type === "Clap" ? ["Material"] : []),
        );
      }
    },
  );

  it("gives Simple Drum its Simple Noise param", () => {
    expect(activeAt("Percussion", { "Perc Model": "Simple Drum" })).toContain(
      "Simple Noise",
    );
    expect(activeAt("Percussion", { "Perc Model": "Bongo" })).not.toContain(
      "Simple Noise",
    );
  });

  it("follows a switch of Sound Type", () => {
    const models = firstModels("Kick Model", "Kick 90x");

    expect(activeAt("Kick", models)).toContain("Kick 90x Attack");
    expect(activeAt("Snare", models)).not.toContain("Kick 90x Attack");
    expect(activeAt("Snare", models)).toContain("Snare TR Snap");
  });

  it("gates Material by Sound Type only, not by Clap model", () => {
    expect(activeAt("Clap", firstModels("Clap Model", "Guiro"))).toContain(
      "Material",
    );
    expect(activeAt("Kick", firstModels())).not.toContain("Material");
  });

  it("answers a write check from the current sound type and model", () => {
    registerMockObject("type", {
      type: "DeviceParameter",
      properties: {
        name: "Sound Type",
        original_name: "Sound Type",
        is_quantized: 1,
        is_enabled: 1,
        value: 1,
        value_items: ["Kick", "Snare"],
      },
    });
    registerMockObject("dev-1", {
      type: "Device",
      properties: {
        class_display_name: "Drum Synth",
        class_name: "DrumSynth",
        parameters: ["id", "type"],
      },
    });

    const device = LiveAPI.from("id dev-1");

    expect(isParamInactiveBySpecialized(device, "Kick 80x Click")).toBe(true);
    expect(isParamInactiveBySpecialized(device, "Snare Model")).toBe(false);
  });
});
