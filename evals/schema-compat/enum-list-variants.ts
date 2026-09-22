// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Variants for pairing an enum param per target as a comma-separated list. A
 * `z.enum` rejects "midi,audio" before the handler runs, so the param has to
 * stop carrying `enum` in the JSON Schema. These ask whether a model still
 * sends valid values when the allowed set only lives in the description.
 */

import {
  type JsonSchemaInput,
  type Variant,
} from "./schema-compat-variants.ts";

const LIST_PROMPT =
  "In one call, create three tracks using the tool: a MIDI track named Keys, " +
  "an audio track named Vox, and a MIDI track named Bass. Pass the names as " +
  "Keys,Vox,Bass.";
const ONE_PROMPT = "Create one audio track named Vox using the tool.";

const NAMES_DESC = "comma-separated track names, one per new track";
const TYPE_DESC =
  "midi or audio. One for all, or comma-separated one per track, in order";
const TYPE_ENUM: JsonSchemaInput = {
  type: "string",
  enum: ["midi", "audio"],
};

export const ENUM_LIST_VARIANTS: Variant[] = [
  {
    id: "enum-csv-string",
    toolName: "create_tracks_csv",
    tests:
      "enum list as type:string, values in description ('midi,audio,midi')",
    schema: {
      type: "object",
      properties: {
        names: { type: "string", description: NAMES_DESC },
        type: { type: "string", description: TYPE_DESC },
      },
      required: ["names", "type"],
    },
    prompt: LIST_PROMPT,
    check: (i) => isEnumList(i.type, ["midi", "audio", "midi"]),
  },
  {
    id: "enum-or-csv-union",
    toolName: "create_tracks_union",
    tests: "anyOf[enum, string] ('midi' | 'midi,audio,midi')",
    schema: {
      type: "object",
      properties: {
        names: { type: "string", description: NAMES_DESC },
        type: {
          anyOf: [TYPE_ENUM, { type: "string" }],
          description: TYPE_DESC,
        },
      },
      required: ["names", "type"],
    },
    prompt: LIST_PROMPT,
    check: (i) => isEnumList(i.type, ["midi", "audio", "midi"]),
  },
  {
    id: "enum-single-string",
    toolName: "create_track_csv",
    tests: "type:string, values in description, one target (still valid?)",
    schema: {
      type: "object",
      properties: {
        names: { type: "string", description: NAMES_DESC },
        type: { type: "string", description: TYPE_DESC },
      },
      required: ["names", "type"],
    },
    prompt: ONE_PROMPT,
    check: (i) => isEnumList(i.type, ["audio"]),
  },
  {
    id: "enum-single-union",
    toolName: "create_track_union",
    tests: "anyOf[enum, string], one target (still valid?)",
    schema: {
      type: "object",
      properties: {
        names: { type: "string", description: NAMES_DESC },
        type: {
          anyOf: [TYPE_ENUM, { type: "string" }],
          description: TYPE_DESC,
        },
      },
      required: ["names", "type"],
    },
    prompt: ONE_PROMPT,
    check: (i) => isEnumList(i.type, ["audio"]),
  },
];

/**
 * @param x - The type value the model sent
 * @param want - Enum values expected, one per target
 * @returns True if x is that list: a comma-separated string of exactly those
 * values, in order
 */
function isEnumList(x: unknown, want: string[]): boolean {
  if (typeof x !== "string") {
    return false;
  }

  const items = x.split(",").map((s) => s.trim().toLowerCase());

  return items.length === want.length && items.every((s, k) => s === want[k]);
}
