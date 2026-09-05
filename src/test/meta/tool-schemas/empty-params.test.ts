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
// A blank string is not the same thing (ADR-0035 rule 5): a param with no empty
// value of its own refuses one, because dropping it silently is how `bpm: ""`
// became a call that set no tempo and said nothing. This pins that for the whole
// tool surface too, since it is the half most likely to be loosened by accident.
//
// Opt-in tools (ppal-live-api) aren't in STANDARD_TOOL_DEFS and aren't covered.

/**
 * Assert one param reads a null exactly as omitting it, and refuses a blank
 * unless blank is a value it can hold.
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

  const nulled = object.safeParse(unsetEmptyParams({ [name]: null }, schema));

  expect(
    nulled.success ? nulled.data : "was rejected",
    `${label}: null has to read as omitting the param`,
  ).toStrictEqual(omitted.data);

  // A blank string is a real value on a text param — clearing a name or a
  // clip's notes is a request, not a caller with nothing to say. Everywhere
  // else it names nothing the param can hold, and is refused.
  if (param.safeParse("").data === "") {
    const blank = object.safeParse(unsetEmptyParams({ [name]: "" }, schema));

    expect(
      blank.success ? blank.data[name] : "was rejected",
      `${label}: a blank is a value here, so it has to survive`,
    ).toBe("");

    return;
  }

  expect(
    () => unsetEmptyParams({ [name]: "" }, schema),
    `${label}: a blank has to be refused, not dropped`,
  ).toThrow(`${name}: a blank string is not a value for this param.`);
}

/**
 * What one fanned-out query param does with a blank: keeps it (a text param,
 * where clearing is a request), refuses it by name, or — the one thing rule 5
 * rules out — drops it, so the call reads as having nothing to say.
 * @param name - Param name
 * @param omittedValue - What the param parses to when the caller leaves it out
 * @returns "kept", "refused", or "dropped"
 */
function blankOutcome(name: string, omittedValue: unknown): string {
  try {
    const parsed = batchQuerySchema.parse({ [name]: "" }) as Record<
      string,
      unknown
    >;

    return parsed[name] === omittedValue ? "dropped" : "kept";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return message.startsWith(`${name}: a blank string`) ? "refused" : message;
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

  // Nested one level down in ppal-library's `searches` array, so unsetEmptyParams
  // never reaches it — library-query-schema.ts wraps that shape itself.
  it("covers a fanned-out search query's own params", () => {
    const omitted = batchQuerySchema.parse({}) as Record<string, unknown>;

    for (const name of Object.keys(batchQuerySchema.shape)) {
      const nulled = batchQuerySchema.safeParse({ [name]: null });

      expect(
        nulled.success
          ? (nulled.data as Record<string, unknown>)[name]
          : "was rejected",
        `batchQuerySchema.${name}: null has to read as omitting the param`,
      ).toStrictEqual(omitted[name]);

      expect(
        blankOutcome(name, omitted[name]),
        `batchQuerySchema.${name}: a blank has to be kept or refused`,
      ).not.toBe("dropped");
    }
  });
});
