// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The schema-variant corpus for the schema-compat probe. Each variant pairs a
 * hand-written JSON Schema with a prompt and a structural check() over the
 * model's tool-call input. Kept separate from the runner so the runner stays
 * focused on orchestration and reporting.
 */

import { type jsonSchema } from "ai";

export type JsonSchemaInput = Parameters<typeof jsonSchema>[0];
export type Args = Record<string, unknown>;

export interface Variant {
  id: string;
  toolName: string;
  /** What construct this probes, for the report. */
  tests: string;
  schema: JsonSchemaInput;
  prompt: string;
  /** Structural correctness of the model's tool-call input. */
  check: (input: Args) => boolean;
}

/**
 * @param x - Value to test
 * @returns True if x is a string
 */
const isStr = (x: unknown): x is string => typeof x === "string";

/**
 * @param x - Value to test
 * @returns True if x is an array of strings
 */
const isStrArray = (x: unknown): x is string[] =>
  Array.isArray(x) && x.every(isStr);

/**
 * @param x - Value to test
 * @param keys - Keys that must be present
 * @returns True if x is a plain (non-array) object containing every key
 */
const isParamMap = (x: unknown, keys: string[]): boolean =>
  x != null &&
  typeof x === "object" &&
  !Array.isArray(x) &&
  keys.every((k) => k in (x as Args));

// Note: most variants omit additionalProperties on purpose so a clean shape is
// probed without confounding the construct-acceptance signal. The two object-map
// variants are the exception — they exist specifically to probe dynamic-key
// objects (what `z.record(...)` emits). Finding: Gemini does NOT reject
// additionalProperties anymore, but it (and the bare-object fallback) silently
// fills `{}` — dropping every key. All other curated models fill it correctly.
// This is why update-device `params` stays an array<object{name,value}> rather
// than an object map: the map loses all params on Gemini with no error.
export const VARIANTS: Variant[] = [
  {
    id: "array-of-strings",
    toolName: "record_actions",
    tests: "array<string> (baseline, == update-device 'actions')",
    schema: {
      type: "object",
      properties: { actions: { type: "array", items: { type: "string" } } },
      required: ["actions"],
    },
    prompt:
      "Record exactly these three device actions verbatim using record_actions: " +
      "reverse | warpAs(4) | setModulation('Osc 1 Pos','Env 2',0.5)",
    check: (i) => isStrArray(i.actions) && i.actions.length >= 3,
  },
  {
    id: "csv-string",
    toolName: "record_actions_csv",
    tests: "comma-separated string (current convention; commas-in-values fail)",
    schema: {
      type: "object",
      properties: {
        actions: {
          type: "string",
          description: "comma-separated list of actions",
        },
      },
      required: ["actions"],
    },
    prompt:
      "Record exactly these three device actions verbatim using record_actions_csv: " +
      "reverse | warpAs(4) | setModulation('Osc 1 Pos','Env 2',0.5)",
    // "Correct" is impossible to recover unambiguously — the 3rd value has
    // commas. We mark pass only if it's a string (acceptance), and the details
    // dump shows how the ambiguity bites.
    check: (i) => isStr(i.actions),
  },
  {
    id: "string-or-array-union",
    toolName: "record_action",
    tests: "anyOf[string, array<string>] (THE concern)",
    schema: {
      type: "object",
      properties: {
        action: {
          anyOf: [
            { type: "string" },
            { type: "array", items: { type: "string" } },
          ],
        },
      },
      required: ["action"],
    },
    prompt:
      "Record these two device actions using record_action: reverse, warpAs(4)",
    // Both documented anyOf failures return a STRING — collapse-to-scalar (drops
    // data) and JSON-stringify-the-array-into-the-string-slot — so we require
    // the lossless array branch AND assert both requested actions survive. A
    // string of any kind now scores wrong-shape, which makes the failure this
    // variant exists to catch actually measurable. (Was `isStr || isStrArray`,
    // which BOTH failure modes passed — the metric couldn't see the bug.)
    check: (i) =>
      isStrArray(i.action) && hasAll(i.action, ["reverse", "warpAs(4)"]),
  },
  {
    id: "nested-object-array",
    toolName: "build_kit",
    tests: "array<object{note,sample,name}> (drum-kit spec)",
    schema: {
      type: "object",
      properties: {
        pads: {
          type: "array",
          items: {
            type: "object",
            properties: {
              note: { type: "string" },
              sample: { type: "string" },
              name: { type: "string" },
            },
            required: ["note", "sample", "name"],
          },
        },
      },
      required: ["pads"],
    },
    prompt:
      "Build a drum kit with build_kit using these three pads: " +
      "C1 -> /samples/kick.wav named Kick; " +
      "D1 -> /samples/snare.wav named Snare; " +
      "F#1 -> /samples/hihat.wav named HiHat",
    check: (i) =>
      Array.isArray(i.pads) &&
      i.pads.length >= 3 &&
      i.pads.every(
        (p) =>
          p != null &&
          isStr((p as Args).note) &&
          isStr((p as Args).sample) &&
          isStr((p as Args).name),
      ),
  },
  {
    id: "object-map",
    toolName: "set_params_map",
    tests:
      "object{additionalProperties:string} (proposed update-device 'params' map)",
    schema: {
      type: "object",
      properties: {
        params: {
          type: "object",
          additionalProperties: { type: "string" },
        },
      },
      required: ["params"],
    },
    prompt:
      "Set these three device parameters using set_params_map: " +
      "Frequency to 500, Resonance to 20, Drive to 30%.",
    check: (i) => isParamMap(i.params, ["Frequency", "Resonance", "Drive"]),
  },
  {
    id: "object-map-bare",
    toolName: "set_params_bare",
    tests: "object{} no additionalProperties (free-form fallback)",
    schema: {
      type: "object",
      properties: {
        params: { type: "object" },
      },
      required: ["params"],
    },
    prompt:
      "Set these three device parameters using set_params_bare: " +
      "Frequency to 500, Resonance to 20, Drive to 30%.",
    check: (i) => isParamMap(i.params, ["Frequency", "Resonance", "Drive"]),
  },
  {
    id: "live-api-value-union",
    toolName: "set_value",
    tests: "anyOf[string,number,boolean,array<number>] (== live-api 'value')",
    schema: {
      type: "object",
      properties: {
        value: {
          anyOf: [
            { type: "string" },
            { type: "number" },
            { type: "boolean" },
            { type: "array", items: { type: "number" } },
          ],
        },
      },
      required: ["value"],
    },
    prompt:
      "Set the parameter to the list of numbers 0.1, 0.2, 0.3 using set_value.",
    check: (i) =>
      Array.isArray(i.value) && i.value.every((x) => typeof x === "number"),
  },
];

/**
 * @param arr - Strings to search
 * @param needles - Substrings that must each appear in some element
 * @returns True if every needle is a substring of at least one arr element
 */
function hasAll(arr: string[], needles: string[]): boolean {
  return needles.every((n) => arr.some((v) => v.includes(n)));
}
