// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { STANDARD_TOOL_DEFS } from "#src/mcp-server/create-mcp-server.ts";
import { batchQuerySchema } from "#src/tools/session/library-query-schema.ts";
import { resolveToolSchema } from "#src/tools/shared/tool-framework/resolve-tool-schema.ts";

// z.coerce.number() runs Number(), and Number(null) and Number("") are both 0 —
// a real value the caller never sent. Tools that check `x == null` to decide
// whether they were given a location then read or write index 0 instead of
// refusing. optionalNumber() nulls those before coercion; this pins every
// numeric param to it, so a new one written the plain way fails here.
//
// Opt-in tools (ppal-live-api) aren't in STANDARD_TOOL_DEFS and aren't covered.

/**
 * Parse one value against one param's schema, reporting what it became.
 * @param schema - The param's schema
 * @param value - The value to parse
 * @returns The parsed value, or undefined when the schema rejected it
 */
function parsed(
  schema: { safeParse: (v: unknown) => { success: boolean; data?: unknown } },
  value: unknown,
): unknown {
  const result = schema.safeParse(value);

  return result.success ? result.data : undefined;
}

/**
 * Assert one param reads null and "" as unset, not as 0.
 * @param label - Tool and param name, for the failure message
 * @param schema - The param's schema
 */
function expectNullStaysUnset(
  label: string,
  schema: { safeParse: (v: unknown) => { success: boolean; data?: unknown } },
): void {
  // A rejected null is fine — that's a loud failure, not a silent 0.
  const omitted = parsed(schema, undefined);

  for (const empty of [null, ""]) {
    const value = parsed(schema, empty);

    if (typeof value !== "number") continue;

    // A number is only acceptable when omitting the param produces the same
    // one, i.e. the schema has that default anyway.
    expect(
      value,
      `${label}: ${JSON.stringify(empty)} became ${value}; wrap it in optionalNumber()`,
    ).toBe(omitted);
  }
}

describe("numeric params read null as unset", () => {
  for (const def of STANDARD_TOOL_DEFS) {
    it(`${def.toolName} never turns an empty value into a number`, () => {
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
