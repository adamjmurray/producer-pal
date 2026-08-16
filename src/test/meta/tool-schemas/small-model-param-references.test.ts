// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { z, type ZodType } from "zod";
import { NOTATIONS, type Notation } from "#src/shared/notation.ts";
import { type ToolDefFunction } from "#src/tools/shared/tool-framework/define-tool.ts";
import {
  param,
  resolveModalDescription,
  resolveParamModes,
} from "#src/tools/shared/tool-framework/modal-config.ts";
import { resolveToolSchema } from "#src/tools/shared/tool-framework/resolve-tool-schema.ts";

// Hiding a param with `smallModel: null` leaves any sibling text that named it
// pointing at nothing, so the small model is told to use an argument its schema
// doesn't have. Five defects shipped from exactly this before the check existed.
//
// Deprecation is the other way a param leaves the published schema, and it
// applies in every mode — so both axes run here.
//
// There is no allowlist. Every surviving description is currently clean under a
// plain word-boundary match, including the removed params whose names are also
// ordinary English (`count`, `name`, `format`, `sort`). If a legitimate prose
// use ever collides, add the allowlist then — don't loosen the match.

// The `code` params only exist when this flag is on, and it is read when the
// tool defs load — so stub it before importing them.
vi.stubEnv("ENABLE_CODE_EXEC", "true");
const { STANDARD_TOOL_DEFS } =
  await import("#src/mcp-server/create-mcp-server.ts");
const { toolDefLiveApi } = await import("#src/tools/advanced/live-api.def.ts");

vi.unstubAllEnvs();

const TOOL_DEFS = [...STANDARD_TOOL_DEFS, toolDefLiveApi];

// Small-model mode crosses with notation, and a param can be hidden in only one
// cell (`smallModel:stark`), so every combination gets its own case.
const CASES = NOTATIONS.flatMap((notation) =>
  [true, false].flatMap((smallModelMode) =>
    TOOL_DEFS.map(
      (def) =>
        [
          `${def.toolName} (${notation}${smallModelMode ? ", small" : ""})`,
          def,
          { notation, smallModelMode },
        ] as const,
    ),
  ),
);

describe("published param references", () => {
  it.each(CASES)("%s names no param it removed", (_label, def, context) => {
    expect(danglingReferences(def, context)).toStrictEqual([]);
  });

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
});

/**
 * Finds text a tool still publishes that names a param it does not publish —
 * hidden by a mode, or retired by deprecatedParam().
 * @param def - The tool definition to resolve
 * @param context - The notation and small-model axes to resolve
 * @returns One message per offending (description, removed param) pair
 */
function danglingReferences(
  def: ToolDefFunction,
  context: { notation: Notation; smallModelMode: boolean },
): string[] {
  const { inputSchema, description } = def.toolOptions;
  const { published, deprecated } = resolveToolSchema(inputSchema, context);
  const removed = [
    ...resolveParamModes(inputSchema, context).excludeParams,
    ...Object.keys(deprecated),
  ];

  if (removed.length === 0) return [];

  const texts: [string, string][] = [
    ["tool description", resolveModalDescription(description, context)],
  ];

  for (const [name, schema] of Object.entries(published)) {
    const text = (schema as ZodType).description;

    if (text != null) texts.push([`\`${name}\` description`, text]);
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
