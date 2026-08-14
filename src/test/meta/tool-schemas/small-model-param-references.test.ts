// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { z, type ZodType } from "zod";
import { NOTATIONS, type Notation } from "#src/shared/notation.ts";
import { type ToolDefFunction } from "#src/tools/shared/tool-framework/define-tool.ts";
import { filterSchemaForSmallModel } from "#src/tools/shared/tool-framework/filter-schema.ts";
import {
  param,
  resolveModalDescription,
  resolveParamModes,
} from "#src/tools/shared/tool-framework/modal-config.ts";

// Hiding a param with `smallModel: null` leaves any sibling text that named it
// pointing at nothing, so the small model is told to use an argument its schema
// doesn't have. Five defects shipped from exactly this before the check existed.
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
  TOOL_DEFS.map(
    (def) => [`${def.toolName} (${notation})`, def, notation] as const,
  ),
);

describe("small-model param references", () => {
  it.each(CASES)("%s names no param it removed", (_label, def, notation) => {
    expect(danglingReferences(def, notation)).toStrictEqual([]);
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

    expect(danglingReferences(def, "barbeat")).toStrictEqual([
      "fake (barbeat): tool description names removed param `takeLane`",
    ]);
  });
});

/**
 * Finds text a tool still ships in small-model mode that names a param the same
 * mode removed.
 * @param def - The tool definition to resolve
 * @param notation - The notation axis to resolve alongside small-model mode
 * @returns One message per offending (description, removed param) pair
 */
function danglingReferences(
  def: ToolDefFunction,
  notation: Notation,
): string[] {
  const { inputSchema, description } = def.toolOptions;
  const context = { notation, smallModelMode: true };
  const resolved = resolveParamModes(inputSchema, context);

  if (resolved.excludeParams.length === 0) return [];

  const survivors = filterSchemaForSmallModel(
    inputSchema,
    resolved.excludeParams,
    resolved.descriptionOverrides,
    resolved.excludeEnumValues,
  );

  const texts: [string, string][] = [
    ["tool description", resolveModalDescription(description, context)],
  ];

  for (const [name, schema] of Object.entries(survivors)) {
    const text = (schema as ZodType).description;

    if (text != null) texts.push([`\`${name}\` description`, text]);
  }

  return resolved.excludeParams.flatMap((removed) =>
    texts
      .filter(([, text]) => new RegExp(`\\b${removed}\\b`).test(text))
      .map(
        ([where]) =>
          `${def.toolName} (${notation}): ${where} names removed param \`${removed}\``,
      ),
  );
}
