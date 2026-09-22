// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Variants for pairing a boolean or number param per target as a
 * comma-separated list: a plain string versus an anyOf union with the typed
 * scalar. Shared by the same runners as the main corpus.
 */

import { type Variant } from "./schema-compat-variants.ts";

const MUTE_PROMPT =
  "In one call, mute tracks t1 and t3 and unmute track t2 using the tool. " +
  "Pass the paths as t1,t2,t3.";
const GAIN_PROMPT =
  "In one call, set track t1 to -6 dB, t2 to -3 dB and t3 to 0 dB using the " +
  "tool. Pass the paths as t1,t2,t3.";

/**
 * @param x - Value to test
 * @returns True if x is a string
 */
const isStr = (x: unknown): x is string => typeof x === "string";

const PATHS_DESC = "comma-separated track paths";
const MUTE_DESC =
  "true or false for all, or comma-separated one per path, in order";
const GAIN_DESC =
  "gain in dB for all, or comma-separated one per path, in order";

export const PER_TARGET_LIST_VARIANTS: Variant[] = [
  // Per-target pairing for a boolean or number param: does the model send the
  // list as "true,false,true" when the schema is a plain string, and does it
  // still pick the typed branch for one value when the schema is a union?
  {
    id: "bool-csv-string",
    toolName: "set_mute_csv",
    tests: "boolean list as type:string (mute: 'true,false,true')",
    schema: {
      type: "object",
      properties: {
        paths: { type: "string", description: PATHS_DESC },
        mute: {
          type: "string",
          description: MUTE_DESC,
        },
      },
      required: ["paths", "mute"],
    },
    prompt: MUTE_PROMPT,
    check: (i) => isBoolList(i.mute, [true, false, true]),
  },
  {
    id: "bool-or-csv-union",
    toolName: "set_mute_union",
    tests: "anyOf[boolean, string] (mute: true | 'true,false,true')",
    schema: {
      type: "object",
      properties: {
        paths: { type: "string", description: PATHS_DESC },
        mute: {
          anyOf: [{ type: "boolean" }, { type: "string" }],
          description: MUTE_DESC,
        },
      },
      required: ["paths", "mute"],
    },
    prompt: MUTE_PROMPT,
    check: (i) => isBoolList(i.mute, [true, false, true]),
  },
  {
    id: "number-csv-string",
    toolName: "set_gain_csv",
    tests: "number list as type:string (gainDb: '-6,-3,0')",
    schema: {
      type: "object",
      properties: {
        paths: { type: "string", description: PATHS_DESC },
        gainDb: {
          type: "string",
          description: GAIN_DESC,
        },
      },
      required: ["paths", "gainDb"],
    },
    prompt: GAIN_PROMPT,
    check: (i) => isNumList(i.gainDb, [-6, -3, 0]),
  },
  {
    id: "number-or-csv-union",
    toolName: "set_gain_union",
    tests: "anyOf[number, string] (gainDb: -6 | '-6,-3,0')",
    schema: {
      type: "object",
      properties: {
        paths: { type: "string", description: PATHS_DESC },
        gainDb: {
          anyOf: [{ type: "number" }, { type: "string" }],
          description: GAIN_DESC,
        },
      },
      required: ["paths", "gainDb"],
    },
    prompt: GAIN_PROMPT,
    check: (i) => isNumList(i.gainDb, [-6, -3, 0]),
  },
  {
    id: "bool-single-union",
    toolName: "set_mute_one",
    tests: "anyOf[boolean, string], one target (does it still send true?)",
    schema: {
      type: "object",
      properties: {
        paths: { type: "string", description: PATHS_DESC },
        mute: {
          anyOf: [{ type: "boolean" }, { type: "string" }],
          description: MUTE_DESC,
        },
      },
      required: ["paths", "mute"],
    },
    prompt: "Mute track t2 using set_mute_one.",
    check: (i) => isBoolList(i.mute, [true]),
  },
];

/**
 * @param x - The mute value the model sent
 * @param want - Booleans expected, one per target
 * @returns True if x is that list: a boolean when one is wanted, else a
 * comma-separated string of true/false in order
 */
function isBoolList(x: unknown, want: boolean[]): boolean {
  if (want.length === 1 && typeof x === "boolean") {
    return x === want[0];
  }

  if (!isStr(x)) {
    return false;
  }

  const items = x.split(",").map((s) => s.trim());

  return (
    items.length === want.length && items.every((s, k) => s === String(want[k]))
  );
}

/**
 * @param x - The gain value the model sent
 * @param want - Numbers expected, one per target
 * @returns True if x is that list: a number when one is wanted, else a
 * comma-separated string of numbers in order
 */
function isNumList(x: unknown, want: number[]): boolean {
  if (want.length === 1 && typeof x === "number") {
    return x === want[0];
  }

  if (!isStr(x)) {
    return false;
  }

  const items = x.split(",").map((s) => Number(s.trim()));

  return items.length === want.length && items.every((n, k) => n === want[k]);
}
