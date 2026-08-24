// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { z, type ZodType } from "zod";
import { STANDARD_TOOL_DEFS } from "#src/mcp-server/create-mcp-server.ts";
import { batchQuerySchema } from "#src/tools/session/library-query-schema.ts";
import { resolveToolSchema } from "#src/tools/shared/tool-framework/resolve-tool-schema.ts";
import { unsetEmptyParams } from "#src/tools/shared/tool-framework/unset-empty-params.ts";

// Clients fill the params they have no value for with null, and the schema
// turns that into something the caller never sent: z.coerce.number() makes it
// 0, a real index; z.coerce.string() makes it "null", a real name; a boolean,
// enum or array rejects it and takes the whole call down. Every call path
// drops those args first — this pins the result for every param of every tool.
//
// Opt-in tools (ppal-live-api) aren't in STANDARD_TOOL_DEFS and aren't covered.

/**
 * Assert one param reads an empty value exactly as omitting it.
 * @param label - Tool and param name, for the failure message
 * @param name - Param name
 * @param schema - The tool's params, keyed by name
 */
function expectEmptyStaysUnset(
  label: string,
  name: string,
  schema: Record<string, ZodType>,
): void {
  const param = schema[name] as ZodType;
  const object = z.object(schema);
  const omitted = object.safeParse(unsetEmptyParams({}, schema));

  // A required param has nothing to read an empty value as.
  if (!omitted.success) return;

  // A blank string is a real value on a text param — clearing a name or a
  // clip's notes is a request, not a caller with nothing to say.
  const blankIsAValue = param.safeParse("").data === "";
  const empties = blankIsAValue ? [null] : [null, ""];

  for (const empty of empties) {
    const args = { [name]: empty };
    const result = object.safeParse(unsetEmptyParams(args, schema));

    expect(
      result.success ? result.data : "was rejected",
      `${label}: ${JSON.stringify(empty)} has to read as omitting the param`,
    ).toStrictEqual(omitted.data);
  }
}

describe("params read an empty value as unset", () => {
  for (const def of STANDARD_TOOL_DEFS) {
    it(`${def.toolName} reads an empty value as no value`, () => {
      const { validating } = resolveToolSchema(def.toolOptions.inputSchema, {});

      for (const name of Object.keys(validating)) {
        expectEmptyStaysUnset(`${def.toolName}.${name}`, name, validating);
      }
    });
  }

  // Nested one level down in ppal-library's `queries` array, so unsetEmptyParams
  // never reaches it — library-query-schema.ts wraps that shape itself.
  it("covers a searchBatch query's own params", () => {
    const omitted = batchQuerySchema.parse({}) as Record<string, unknown>;

    for (const [name, schema] of Object.entries(batchQuerySchema.shape)) {
      const blankIsAValue = schema.safeParse("").data === "";

      for (const empty of blankIsAValue ? [null] : [null, ""]) {
        const result = batchQuerySchema.safeParse({ [name]: empty });

        expect(
          result.success
            ? (result.data as Record<string, unknown>)[name]
            : "was rejected",
          `batchQuerySchema.${name}: ${JSON.stringify(empty)} has to read as omitting the param`,
        ).toStrictEqual(omitted[name]);
      }
    }
  });
});
