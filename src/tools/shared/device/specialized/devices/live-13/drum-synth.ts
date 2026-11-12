// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { prefixModes } from "../../specialized-device-inactive.ts";
import {
  type InactiveWhenRule,
  type SpecializedDeviceSpec,
} from "../../specialized-device-types.ts";

// Drum Synth (Live 13, generic Device, class_name "DrumSynth", 57 params). It
// has no pseudo-params. `Sound Type` picks what is synthesized; each type has a
// `* Model` param picking one model, and each model owns params named after it
// ("Kick 80x Click", "Zapp Snap"). Live reports all 57 active at every setting,
// so a read lists ~45 params that do nothing. Two levels of rules fix that: a
// model's params apply only under its type, and only while it is the type's
// selected model. See dev/live-api/specialized-devices/live-13-devices.md.

interface DrumType {
  /** Sound Type value. */
  type: string;
  /** Name prefix of the type's own params, `* Model` included. */
  prefix: string;
  /** The type's model param, and its options. */
  modelParam: string;
  models: readonly string[];
}

const TYPES: readonly DrumType[] = [
  {
    type: "Kick",
    prefix: "Kick",
    modelParam: "Kick Model",
    models: ["Kick 80x", "Kick 90x", "Kick 78"],
  },
  {
    type: "Snare",
    prefix: "Snare",
    modelParam: "Snare Model",
    models: ["Snare TR", "Snare Modal", "Snare Acoustic"],
  },
  {
    type: "Rim Shot",
    prefix: "Rim",
    modelParam: "Rim Model",
    models: ["Rim TR", "Zapp"],
  },
  {
    type: "HiHat",
    prefix: "HiHat",
    modelParam: "HiHat Model",
    models: ["HiHat TR", "HiHat Digi", "Spark"],
  },
  {
    type: "Clap",
    prefix: "Clap",
    modelParam: "Clap Model",
    models: ["Clap TR", "Marbles", "Guiro"],
  },
  {
    type: "Percussion",
    prefix: "Perc",
    modelParam: "Perc Model",
    models: ["Simple Drum", "Bongo", "Timpani"],
  },
  {
    type: "Tom",
    prefix: "Tom",
    modelParam: "Tom Model",
    models: ["Tom 80x", "Tom 90x"],
  },
  {
    type: "Cymbal",
    prefix: "Cymbal",
    modelParam: "Cymbal Model",
    models: ["Cymbal TR", "Cymbal RH"],
  },
  {
    type: "FX",
    prefix: "FX",
    modelParam: "FX Model",
    models: ["Cow TR", "FM", "Metallic", "Liquid"],
  },
];

/** A model's param prefix is its option name, except Simple Drum's. */
const MODEL_PREFIX: Record<string, string> = { "Simple Drum": "Simple" };

/**
 * The prefix of a model's params.
 * @param model - The model option
 * @returns The prefix
 */
function modelPrefix(model: string): string {
  return MODEL_PREFIX[model] ?? model;
}

/**
 * `Material` belongs to the Clap type's Marbles model (Live names it
 * `Clap_MarblesMaterial`) but carries no model prefix, so it is gated by name:
 * off for other types, and off for the other Clap models.
 */
const MARBLES_PARAM = "Material";

/**
 * The rules: one on Sound Type, one per type on its model param.
 * @returns The rules
 */
function drumSynthRules(): InactiveWhenRule[] {
  const typeRule = prefixModes(
    "Sound Type",
    Object.fromEntries(
      TYPES.map(({ type, prefix, models }) => [
        type,
        [prefix, ...models.map(modelPrefix)],
      ]),
    ),
    Object.fromEntries(
      TYPES.filter(({ type }) => type !== "Clap").map(({ type }) => [
        type,
        [MARBLES_PARAM],
      ]),
    ),
  );
  const modelRules = TYPES.map(({ type, modelParam, models }) =>
    prefixModes(
      modelParam,
      Object.fromEntries(models.map((model) => [model, modelPrefix(model)])),
      type === "Clap"
        ? Object.fromEntries(
            models
              .filter((model) => model !== "Marbles")
              .map((model) => [model, [MARBLES_PARAM]]),
          )
        : {},
    ),
  );

  return [typeRule, ...modelRules];
}

export const drumSynthSpec: SpecializedDeviceSpec = {
  displayNames: [],
  classNames: ["DrumSynth"],
  params: [],
  inactiveWhen: drumSynthRules(),
};
