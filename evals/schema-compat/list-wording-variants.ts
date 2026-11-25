// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Variants comparing wordings for "this param takes a comma list paired with
 * the targets". Each wording builds the same trimmed update-track and
 * update-clip schemas; the prompts need paired lists, a different order than
 * the indexes, and params that apply to every target.
 *
 * Opt-in: run with `--variant=list-wording-*` (not in the default corpus).
 */

import {
  type Args,
  type JsonSchemaInput,
  type Variant,
} from "./schema-compat-variants.ts";

interface Wording {
  /** Suffix for a paired param description, given the target noun. */
  list: (noun: string) => string;
  /** Tool-description sentence about params without a list form. */
  tool: (noun: string) => string;
}

export const WORDINGS: Record<string, Wording> = {
  // The wording before the "one" was dropped from "comma-separated one per".
  current: {
    list: (n) => `or comma-separated one per ${n}`,
    tool: (n) => `Params with no list form apply to every ${n}.`,
  },
  "short-phrase": {
    list: (n) => `or comma list per ${n}`,
    tool: (n) => `Params with no list form apply to every ${n}.`,
  },
  "current-no-tool-sentence": {
    list: (n) => `or comma-separated one per ${n}`,
    tool: () => "",
  },
  // The shipped wording.
  "dropped-one": {
    list: (n) => `or comma-separated per ${n}`,
    tool: (n) => `Params with no list form apply to every ${n}.`,
  },
  marker: {
    list: () => "(list)",
    tool: (n) =>
      `Params marked (list) take comma-separated values, one per ${n}; others apply to every ${n}.`,
  },
};

const str = (description: string): object => ({ type: "string", description });

/**
 * @param wording - The wording under test
 * @returns Trimmed update-track tool description and schema
 */
function trackTool(wording: Wording): {
  description: string;
  schema: JsonSchemaInput;
} {
  const l = wording.list("target");

  return {
    description: `Update track(s). ${wording.tool("target")}`.trim(),
    schema: {
      type: "object",
      properties: {
        id: str("track id(s), comma-separated"),
        path: str(
          "track path(s) to update instead of id, comma-separated: 't<index>' (t0 is the first track, so a user's \"track 3\" is t2), 'rt<index>' (return), 'mt' (main) - e.g. 't0,rt1'",
        ),
        name: str(`name, ideally unique, ${l}`),
        color: str(`#RRGGBB, ${l}`),
        gainDb: { type: "number", description: "track gain in dB" },
        pan: { type: "number", description: "pan: -1 (left) to 1 (right)" },
        mute: { type: "boolean", description: "muted?" },
        solo: { type: "boolean", description: "soloed?" },
        inputRoutingType: str(`name from availableInputRoutingTypes; ${l}`),
      },
    },
  };
}

/**
 * @param wording - The wording under test
 * @returns Trimmed update-clip tool description and schema
 */
function clipTool(wording: Wording): {
  description: string;
  schema: JsonSchemaInput;
} {
  const l = wording.list("clip");

  return {
    description:
      `Update clip(s) and MIDI notes. ${wording.tool("clip")}`.trim(),
    schema: {
      type: "object",
      properties: {
        id: str("clip id(s), comma-separated"),
        path: str(
          "clip(s) to update instead of id, comma-separated: a clip slot 't<track>/s<scene>' (0-based), e.g. 't0/s3,t1/s0'",
        ),
        name: str(`name, ${l}`),
        color: str(`#RRGGBB, ${l}`),
        length: str(`duration, e.g. '4bar'; ${l}`),
        start: str(`bar|beat position where the loop begins; ${l}`),
        looping: { type: "boolean", description: "loop the clip?" },
        muted: { type: "boolean", description: "mute the clip?" },
        gain: { type: "number", description: "audio clip gain" },
      },
    },
  };
}

/**
 * @param x - Param value
 * @returns Trimmed entries of a comma list, or [] when not a string
 */
function list(x: unknown): string[] {
  return typeof x === "string" ? x.split(",").map((s) => s.trim()) : [];
}

/**
 * Whether a call pairs each target with its value, in whatever order the model
 * lists them: a sorted list that keeps the pairs together is as right as one in
 * the prompt's order.
 * @param i - The call input
 * @param param - The list param to check
 * @param expected - The value each target must get, keyed by target
 * @param key - Normalizes a target entry to a key of `expected`
 * @returns True if every target carries its own value, with none extra
 */
function paired(
  i: Args,
  param: string,
  expected: Record<string, string>,
  key: (target: string) => string,
): boolean {
  const targets = list(i.path ?? i.id).map(key);
  const values = list(i[param]);

  return (
    targets.length === values.length &&
    targets.length === Object.keys(expected).length &&
    targets.every(
      (t, n) => expected[t]?.toLowerCase() === values[n]?.toLowerCase(),
    )
  );
}

// A track entry as its number: models send "t3" as a path or "3" as an id.
const trackNumber = (t: string): string => t.replaceAll(/\D/g, "");

/**
 * @param zeroBased - Expected values keyed by 0-based track index
 * @returns The same, plus keyed by a user's 1-based track number
 */
function eitherBase(
  zeroBased: Record<string, string>,
): Record<string, string>[] {
  return [
    zeroBased,
    Object.fromEntries(
      Object.entries(zeroBased).map(([k, v]) => [String(Number(k) + 1), v]),
    ),
  ];
}

const pairedTracks = (
  i: Args,
  param: string,
  zeroBased: Record<string, string>,
): boolean =>
  eitherBase(zeroBased).some((e) => paired(i, param, e, trackNumber));

const clipKey = (t: string): string => t.toLowerCase();

const same = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * @param x - A param that applies to every target
 * @param value - The one value it must carry
 * @param count - How many targets
 * @returns True if x is `value` once, or repeated per target
 */
function everyTarget(x: unknown, value: string, count: number): boolean {
  const entries = list(x);

  return (
    (entries.length === 1 || entries.length === count) &&
    entries.every((e) => e.toLowerCase() === value.toLowerCase())
  );
}

interface Scenario {
  id: string;
  tool: typeof trackTool;
  toolName: string;
  prompt: string;
  check: (i: Args) => boolean;
}

const SCENARIOS: Scenario[] = [
  {
    id: "track-reordered",
    tool: trackTool,
    toolName: "update_track",
    prompt:
      "In one update_track call, rename track 4 to Pad, track 2 to Bass and track 3 to Keys.",
    check: (i) =>
      pairedTracks(i, "name", { "3": "Pad", "1": "Bass", "2": "Keys" }),
  },
  {
    id: "track-shared",
    tool: trackTool,
    toolName: "update_track",
    prompt:
      "In one update_track call on tracks 1, 3 and 4: name them Bass, Lead and Pad, color them #FF0000, #00FF00 and #0000FF, and mute all three.",
    check: (i) =>
      pairedTracks(i, "name", { "0": "Bass", "2": "Lead", "3": "Pad" }) &&
      pairedTracks(i, "color", {
        "0": "#FF0000",
        "2": "#00FF00",
        "3": "#0000FF",
      }) &&
      i.mute === true,
  },
  {
    id: "clip-shared",
    tool: clipTool,
    toolName: "update_clip",
    prompt:
      "In one update_clip call on the clips at t1/s2 and t0/s0: rename them Chorus and Verse, set their lengths to 8bar and 4bar, and loop both.",
    check: (i) =>
      paired(i, "name", { "t1/s2": "Chorus", "t0/s0": "Verse" }, clipKey) &&
      paired(i, "length", { "t1/s2": "8bar", "t0/s0": "4bar" }, clipKey) &&
      i.looping === true,
  },
  {
    id: "clip-single-value",
    tool: clipTool,
    toolName: "update_clip",
    prompt:
      "In one update_clip call, color the clips t0/s1, t0/s2 and t0/s3 red (#FF0000) and name them all Hook.",
    check: (i) =>
      same(list(i.path).map(clipKey), ["t0/s1", "t0/s2", "t0/s3"]) &&
      everyTarget(i.color, "#FF0000", 3) &&
      everyTarget(i.name, "Hook", 3),
  },
];

export const LIST_WORDING_VARIANTS: Variant[] = Object.entries(
  WORDINGS,
).flatMap(([wordingId, wording]) =>
  SCENARIOS.map((s): Variant => {
    const { description, schema } = s.tool(wording);

    return {
      id: `list-wording-${wordingId}-${s.id}`,
      toolName: s.toolName,
      tests: `list-pairing wording "${wordingId}": ${s.id}`,
      description,
      schema,
      prompt: s.prompt,
      check: s.check,
      optIn: true,
    };
  }),
);
