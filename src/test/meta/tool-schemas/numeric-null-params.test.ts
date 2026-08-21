// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { STANDARD_TOOL_DEFS } from "#src/mcp-server/create-mcp-server.ts";
import { batchQuerySchema } from "#src/tools/session/library-query-schema.ts";
import { resolveToolSchema } from "#src/tools/shared/tool-framework/resolve-tool-schema.ts";

// z.coerce.number() runs Number(), and Number(null) and Number("") are both 0 —
// a real value the caller never sent. A tool that checks `x == null` to decide
// whether it was given a location then reads or writes index 0 instead of
// refusing, and a param bounded away from 0 rejects the whole call.
// optionalNumber() drops those before coercion; this pins every numeric param
// to it, so a new one written the plain way fails here.
//
// Opt-in tools (ppal-live-api) aren't in STANDARD_TOOL_DEFS and aren't covered.

type ParamSchema = z.ZodType;

/**
 * Whether a param takes a number, read from the JSON Schema the model sees.
 * @param schema - The param's schema
 * @returns True for an integer or number param
 */
function isNumeric(schema: ParamSchema): boolean {
  const { type } = z.toJSONSchema(schema, {
    io: "input",
    unrepresentable: "any",
  }) as { type?: string };

  return type === "integer" || type === "number";
}

/**
 * Assert one numeric param reads null and "" exactly as omitting it.
 * @param label - Tool and param name, for the failure message
 * @param schema - The param's schema
 */
function expectNullStaysUnset(label: string, schema: ParamSchema): void {
  if (!isNumeric(schema)) return;

  const omitted = schema.safeParse(undefined);

  // A required param has nothing to read null as.
  if (!omitted.success) return;

  for (const empty of [null, ""]) {
    const result = schema.safeParse(empty);
    const became = result.success
      ? `became ${JSON.stringify(result.data)}`
      : "was rejected";

    expect(
      result.success && result.data === omitted.data,
      `${label}: ${JSON.stringify(empty)} ${became}, not ${JSON.stringify(omitted.data)}; wrap it in optionalNumber()`,
    ).toBe(true);
  }
}

describe("numeric params read null as unset", () => {
  for (const def of STANDARD_TOOL_DEFS) {
    it(`${def.toolName} reads an empty value as no value`, () => {
      const { validating } = resolveToolSchema(def.toolOptions.inputSchema, {});

      for (const [name, schema] of Object.entries(validating)) {
        expectNullStaysUnset(`${def.toolName}.${name}`, schema);
      }
    });
  }

  // Nested one level down in ppal-library's `queries` array, so the loop above
  // doesn't reach it.
  it("covers limit inside a searchBatch query", () => {
    expectNullStaysUnset(
      "batchQuerySchema.limit",
      batchQuerySchema.shape.limit,
    );
  });
});
