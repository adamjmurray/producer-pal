// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { z, type ZodType } from "zod";
import { type Notation } from "#src/shared/notation.ts";
import { type ToolDefFunction } from "#src/tools/shared/tool-framework/define-tool.ts";
import { deprecatedParam } from "#src/tools/shared/tool-framework/hidden-param.ts";
import {
  param,
  resolveModalDescription,
  resolveParamModes,
} from "#src/tools/shared/tool-framework/modal-config.ts";
import { resolveToolSchema } from "#src/tools/shared/tool-framework/resolve-tool-schema.ts";
import { TOOL_DEF_CASES } from "./tool-defs-test-helpers.ts";

// Hiding a param with `smallModel: null` leaves any sibling text that named it
// pointing at nothing, so the small model is told to use an argument its schema
// doesn't have. Five defects shipped from exactly this before the check existed.
//
// Deprecation is the other way a param leaves the published schema, and it
// applies in every mode — so both axes run here.
//
// Two carve-outs, both Live's own vocabulary rather than a param name, blanked
// out of the text before matching so a bare "set slot to ..." or a real
// reference to the retired `locator` param still gets caught:
//
//   "clip slot" — Live's name for a `t0/s1` location, said constantly and
//     nothing to do with the deprecated `slot`/`slots` params.
//   `loc:<locator ...>` — the placeholder inside the song-position prefix,
//     nothing to do with the deprecated `locator` param.
//
// Every other surviving description is clean under a plain word-boundary match,
// including the removed params whose names are also ordinary English (`count`,
// `name`, `format`, `sort`). If another legitimate prose use collides, blank
// that term out the same way — don't loosen the match.

describe("published param references", () => {
  it.each(TOOL_DEF_CASES)(
    "%s names no param it removed",
    (_label, def, context) => {
      expect(danglingReferences(def, context)).toStrictEqual([]);
    },
  );

  it("catches a description that names a removed param", () => {
    // Without this, a broken matcher would leave every case above passing
    // vacuously — the real defs have nothing to find.
    const def = {
      toolName: "fake",
      toolOptions: {
        description: {
          default: "does a thing",
          smallModel: "set takeLane to place the clip",
        },
        inputSchema: {
          takeLane: param(z.string(), { default: "lane", smallModel: null }),
        },
      },
    } as unknown as ToolDefFunction;

    expect(
      danglingReferences(def, { notation: "barbeat", smallModelMode: true }),
    ).toStrictEqual([
      "fake (barbeat): tool description names removed param `takeLane`",
    ]);
  });

  it("still catches a bare `slot` next to the allowed 'clip slot'", () => {
    const def = slotDef("a clip slot 't0/s1'; set slot to the same thing");

    expect(
      danglingReferences(def, { notation: "barbeat", smallModelMode: false }),
    ).toStrictEqual([
      "fake (barbeat): tool description names removed param `slot`",
    ]);
  });

  it("allows 'clip slot' on a tool that deprecated `slot`", () => {
    const def = slotDef("a clip slot 't0/s1', or clip slots 't0/s1,t2/s3'");

    expect(
      danglingReferences(def, { notation: "barbeat", smallModelMode: false }),
    ).toStrictEqual([]);
  });

  it("allows `loc:<locator ...>` on a tool that deprecated `locator`", () => {
    const def = slotDef("bar|beat, or loc:<locator name or id>", "locator");

    expect(
      danglingReferences(def, { notation: "barbeat", smallModelMode: false }),
    ).toStrictEqual([]);
  });

  it("still catches a bare `locator` next to the allowed placeholder", () => {
    const def = slotDef("loc:<locator name or id>, or locator", "locator");

    expect(
      danglingReferences(def, { notation: "barbeat", smallModelMode: false }),
    ).toStrictEqual([
      "fake (barbeat): tool description names removed param `locator`",
    ]);
  });
});

/**
 * A tool that deprecated one of its params, for exercising the carve-outs.
 * @param description - The tool description to publish
 * @param paramName - The param it deprecated
 * @returns A definition shaped enough for danglingReferences()
 */
function slotDef(description: string, paramName = "slot"): ToolDefFunction {
  return {
    toolName: "fake",
    toolOptions: {
      description: { default: description },
      inputSchema: {
        [paramName]: deprecatedParam(z.string().optional(), {
          replacedBy: "path",
        }),
      },
    },
  } as unknown as ToolDefFunction;
}

/**
 * Finds text a tool still publishes that names a param it does not publish —
 * hidden by a mode, or unpublished by deprecatedParam()/aliasParam().
 * @param def - The tool definition to resolve
 * @param context - The notation and small-model axes to resolve
 * @returns One message per offending (description, removed param) pair
 */
function danglingReferences(
  def: ToolDefFunction,
  context: { notation: Notation; smallModelMode: boolean },
): string[] {
  const { inputSchema, description } = def.toolOptions;
  const { published, hidden } = resolveToolSchema(inputSchema, context);
  const removed = [
    ...resolveParamModes(inputSchema, context).excludeParams,
    ...Object.keys(hidden),
  ];

  if (removed.length === 0) return [];

  const texts: [string, string][] = [
    [
      "tool description",
      searchable(resolveModalDescription(description, context)),
    ],
  ];

  for (const [name, schema] of Object.entries(published)) {
    const text = (schema as ZodType).description;

    if (text != null) texts.push([`\`${name}\` description`, searchable(text)]);
  }

  return removed.flatMap((name) =>
    texts
      .filter(([, text]) => new RegExp(`\\b${name}\\b`).test(text))
      .map(
        ([where]) =>
          `${def.toolName} (${context.notation}): ${where} names removed param \`${name}\``,
      ),
  );
}

/**
 * Blanks out the two Live terms that collide with a retired param name: "clip
 * slot" for a `t0/s1` location, and the placeholder inside a `loc:` position.
 * @param text - Published description text
 * @returns The same text with those terms removed
 */
function searchable(text: string): string {
  return text
    .replaceAll(/\bclip slots?\b/gi, "")
    .replaceAll(/\bloc:<[^>]*>/gi, "");
}
