// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { z, type ZodType } from "zod";
import { aliasedEnum } from "#src/tools/shared/tool-framework/enum-aliases.ts";
import { resolveToolSchema } from "#src/tools/shared/tool-framework/resolve-tool-schema.ts";
import { param } from "#src/tools/shared/tool-framework/modal-config.ts";

const ACTIONS = ["search", "list-tags", "find-similar"] as const;
const ALIASES = { listTags: "list-tags", findSimilar: "find-similar" } as const;

/**
 * The JSON Schema a shape publishes.
 * @param shape - Param schemas
 * @returns The JSON Schema of the object they form
 */
function jsonSchema(shape: Record<string, ZodType>): {
  properties: Record<string, { enum?: string[]; items?: { enum?: string[] } }>;
} {
  return z.toJSONSchema(z.object(shape)) as never;
}

describe("aliasedEnum", () => {
  const schema = aliasedEnum(ACTIONS, ALIASES);

  it("publishes only the canonical values", () => {
    expect(
      jsonSchema({ action: schema }).properties.action?.enum,
    ).toStrictEqual([...ACTIONS]);
  });

  it("maps every alias to its canonical value", () => {
    for (const [alias, canonical] of Object.entries(ALIASES)) {
      expect(schema.parse(alias)).toBe(canonical);
    }
  });

  it("leaves canonical values alone and still refuses unknown ones", () => {
    expect(schema.parse("list-tags")).toBe("list-tags");
    expect(() => schema.parse("list_tags")).toThrow("Invalid option");
  });

  it("works under optional, default, array and object wrappers", () => {
    const shape = z.object({
      one: schema.optional().default("search"),
      many: z.array(schema).default([]),
      nested: z.array(z.object({ type: schema })),
    });

    expect(
      shape.parse({
        many: ["listTags", "search"],
        nested: [{ type: "findSimilar" }],
      }),
    ).toStrictEqual({
      one: "search",
      many: ["list-tags", "search"],
      nested: [{ type: "find-similar" }],
    });
  });

  it("keeps the published list canonical when wrapped", () => {
    const published = jsonSchema({
      one: schema.optional().default("search"),
      many: z.array(schema).default([]),
    }).properties;

    expect(published.one?.enum).toStrictEqual([...ACTIONS]);
    expect(published.many?.items?.enum).toStrictEqual([...ACTIONS]);
  });
});

describe("aliasedEnum in a tool schema", () => {
  const input = {
    action: param(aliasedEnum(ACTIONS, ALIASES).optional().default("search"), {
      default: "what to do",
      smallModel: {
        description: "what to do",
        excludeEnumValues: ["find-similar"],
      },
    }),
  };

  it("publishes only canonical values in every mode", () => {
    for (const smallModelMode of [false, true]) {
      const { published } = resolveToolSchema(input, { smallModelMode });
      const values = jsonSchema(published).properties.action?.enum;

      expect(values).toStrictEqual(
        smallModelMode ? ["search", "list-tags"] : [...ACTIONS],
      );
    }
  });

  it("accepts aliases, and a small model's trim takes the aliases of a trimmed value with it", () => {
    const large = z.object(resolveToolSchema(input, {}).validating);
    const small = z.object(
      resolveToolSchema(input, { smallModelMode: true }).validating,
    );

    expect(large.parse({ action: "findSimilar" }).action).toBe("find-similar");
    expect(small.parse({ action: "listTags" }).action).toBe("list-tags");
    expect(() => small.parse({ action: "findSimilar" })).toThrow(
      "Invalid option",
    );
    expect(() => small.parse({ action: "find-similar" })).toThrow(
      "Invalid option",
    );
  });
});
