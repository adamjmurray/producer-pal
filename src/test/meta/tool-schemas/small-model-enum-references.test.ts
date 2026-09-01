// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { z, type ZodType } from "zod";
import { type Notation } from "#src/shared/notation.ts";
import { type ToolDefFunction } from "#src/tools/shared/tool-framework/define-tool.ts";
import {
  param,
  resolveModalDescription,
  resolveParamModes,
} from "#src/tools/shared/tool-framework/modal-config.ts";
import { resolveToolSchema } from "#src/tools/shared/tool-framework/resolve-tool-schema.ts";
import { TOOL_DEF_CASES } from "./tool-defs-test-helpers.ts";

// The enum-value twin of small-model-param-references.test.ts. Trimming a value
// with `excludeEnumValues` leaves any sibling text that still names it offering
// an argument the schema now REJECTS — the trim is enforced in the validating
// schema, so the model doesn't get a no-op, it gets an error.
//
// Not hypothetical: read-device's `maxDepth` already says "chains/drum-pads" in
// its default text and "chains" in its small-model text, for exactly this
// reason. That correction was made by hand, with nothing watching it — which is
// why cross-param texts are in scope here, not just the trimmed param's own.
//
// The check is per-tool, never a global union of trimmed values: `*` is trimmed
// on every read tool while ppal-library's `query` legitimately teaches `*` as
// its wildcard.
//
// Matching treats `-` as a word character, so a trimmed `routings` does not fire
// on a surviving `available-routings`. It stays case-sensitive because enum
// values are exact literals — that is what keeps `folder` off `sampleFolder`.

/**
 * Values a param may name because they are its OWN live options. Enum values
 * collide across params far more than param names do: ppal-library trims
 * `plugin` from `kind` while `source` still offers a `plugin` of its own, and
 * listing it there is correct. Skipping by live-value keeps the check sharp — if
 * `source` ever drops `plugin` too, this stops excusing it.
 *
 * @param schema - A published param schema
 * @returns Its enum options, or [] when it isn't enum-shaped
 */
function liveEnumValues(schema: ZodType): readonly string[] {
  type Unwrappable = { type: string; def: Record<string, unknown> };

  let current = schema as unknown as Unwrappable;

  // Unwrap the builders enum params are actually declared with:
  // z.array(z.enum(…)).default(…), z.enum(…).optional().default(…), etc.
  while (["default", "optional", "nullable", "array"].includes(current.type)) {
    const inner = (current.def.innerType ?? current.def.element) as
      | Unwrappable
      | undefined;

    if (inner == null) return [];

    current = inner;
  }

  return current.type === "enum"
    ? ((current as unknown as z.ZodEnum).options as string[])
    : [];
}

/**
 * Trimmed values that are also ordinary English on a given tool, keyed by tool
 * name. The sibling param test needs no such list and says so; enum values need
 * one because they are far likelier to be common words. Add an entry ONLY when
 * the prose could not be read as offering the value — don't loosen the match.
 *
 * `folder` is a ppal-library `kind` value and the word it uses for a directory
 * ("absolute folder path", "the user's sample folder"). Neither site offers a
 * kind.
 */
const ORDINARY_WORDS: Record<string, readonly string[]> = {
  "ppal-library": ["folder"],
  // `return` is trimmed off create-track's `type` because "rt+" asks for one
  // now, and `path` has to say what "rt+" makes. Safe to excuse: the word is
  // prose here, and the value is still accepted anyway - only unoffered.
  "ppal-create-track": ["return"],
};

const SMALL_BARBEAT = { notation: "barbeat", smallModelMode: true } as const;

describe("published enum references", () => {
  it.each(TOOL_DEF_CASES)(
    "%s names no value it trimmed",
    (_label, def, context) => {
      expect(danglingEnumReferences(def, context)).toStrictEqual([]);
    },
  );

  it("catches a description that names a trimmed value", () => {
    // Without this, a broken matcher would leave every case above passing
    // vacuously — the real defs have nothing to find.
    const def = fakeDef('pass include: ["warp"] for warp settings');

    expect(danglingEnumReferences(def, SMALL_BARBEAT)).toStrictEqual([
      "fake (barbeat): tool description names trimmed value `warp`",
    ]);
  });

  it("does not fire on a surviving value that contains a trimmed one", () => {
    // read-track trims `routings` and keeps `available-routings`; a plain \b
    // match reports the survivor as a dangling reference.
    const def = fakeDef("read available-routings for the valid options");

    expect(danglingEnumReferences(def, SMALL_BARBEAT)).toStrictEqual([]);
  });

  it("does not fire on another param's live value of the same name", () => {
    const def = fakeDef("does a thing", {
      source: param(z.enum(["user", "warp"]).optional().default("user"), {
        default: "where it lives: user | warp",
      }),
    });

    expect(danglingEnumReferences(def, SMALL_BARBEAT)).toStrictEqual([]);
  });
});

/**
 * Builds a tool def whose small-model mode trims `warp` from `include` while
 * keeping `available-routings`, so the matcher can be exercised against a
 * chosen tool description and optional extra params.
 * @param description - The small-model tool description to test
 * @param extraParams - Further params to publish alongside `include`
 * @returns A tool def shaped like the real ones
 */
function fakeDef(
  description: string,
  extraParams: Record<string, ZodType> = {},
): ToolDefFunction {
  return {
    toolName: "fake",
    toolOptions: {
      description: { default: "does a thing", smallModel: description },
      inputSchema: {
        include: param(
          z.array(z.enum(["notes", "warp", "available-routings"])).default([]),
          {
            default: "notes, warp, available-routings",
            smallModel: {
              description: "notes, available-routings",
              excludeEnumValues: ["warp"],
            },
          },
        ),
        ...extraParams,
      },
    },
  } as unknown as ToolDefFunction;
}

/**
 * Finds text a tool still publishes that names an enum value it trimmed in this
 * mode. Checks the tool description and every published param description
 * against the values trimmed from ANY of that tool's params — a value the model
 * cannot send to `include` is just as dangling when a sibling param names it.
 * @param def - The tool definition to resolve
 * @param context - The notation and small-model axes to resolve
 * @returns One message per offending (description, trimmed value) pair
 */
function danglingEnumReferences(
  def: ToolDefFunction,
  context: { notation: Notation; smallModelMode: boolean },
): string[] {
  const { inputSchema, description } = def.toolOptions;
  const excused = ORDINARY_WORDS[def.toolName] ?? [];
  const resolved = resolveParamModes(inputSchema, context);
  // Both kinds count: whether a value was refused or merely not offered, a
  // published description naming it points the model at something it can't
  // pick out of the schema.
  const trimmed = [
    ...new Set(
      [
        ...Object.values(resolved.excludeEnumValues),
        ...Object.values(resolved.unpublishedEnumValues),
      ].flat(),
    ),
  ].filter((value) => !excused.includes(value));

  if (trimmed.length === 0) return [];

  const { published } = resolveToolSchema(inputSchema, context);
  // Each text carries the values its own param still offers, so a collision
  // with another param's trimmed enum doesn't read as a dangling reference.
  const texts: [string, string, readonly string[]][] = [
    ["tool description", resolveModalDescription(description, context), []],
  ];

  for (const [name, schema] of Object.entries(published)) {
    const text = (schema as ZodType).description;

    if (text != null) {
      texts.push([`\`${name}\` description`, text, liveEnumValues(schema)]);
    }
  }

  return trimmed.flatMap((value) =>
    texts
      .filter(([, text, live]) => !live.includes(value) && names(text, value))
      .map(
        ([where]) =>
          `${def.toolName} (${context.notation}): ${where} names trimmed value \`${value}\``,
      ),
  );
}

/**
 * Whether a description names an enum value as a standalone token. `-` counts as
 * a word character on both sides, so `routings` misses `available-routings`.
 * @param text - The published description to search
 * @param value - The trimmed enum value
 * @returns True when the text names the value
 */
function names(text: string, value: string): boolean {
  const escaped = value.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");

  return new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`).test(text);
}
