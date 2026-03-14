// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { filterSchemaForSmallModel } from "./filter-schema.ts";

describe("filterSchemaForSmallModel", () => {
  it("should remove specified parameters from schema", () => {
    const schema = {
      keepMe: z.string(),
      removeMe: z.number(),
      alsoKeep: z.boolean(),
      alsoRemove: z.string().optional(),
    };

    const filtered = filterSchemaForSmallModel(schema, [
      "removeMe",
      "alsoRemove",
    ]);

    expect(Object.keys(filtered)).toStrictEqual(["keepMe", "alsoKeep"]);
    expect(filtered.keepMe).toBe(schema.keepMe);
    expect(filtered.alsoKeep).toBe(schema.alsoKeep);
    expect(filtered.removeMe).toBeUndefined();
    expect(filtered.alsoRemove).toBeUndefined();
  });

  it("should return original schema when excludeParams is empty", () => {
    const schema = {
      param1: z.string(),
      param2: z.number(),
    };

    const filtered = filterSchemaForSmallModel(schema, []);

    expect(filtered).toStrictEqual(schema);
  });

  it("should return original schema when excludeParams is null", () => {
    const schema = {
      param1: z.string(),
      param2: z.number(),
    };

    const filtered = filterSchemaForSmallModel(schema, null);

    expect(filtered).toStrictEqual(schema);
  });

  it("should return original schema when excludeParams is undefined", () => {
    const schema = {
      param1: z.string(),
      param2: z.number(),
    };

    const filtered = filterSchemaForSmallModel(schema);

    expect(filtered).toStrictEqual(schema);
  });

  it("should handle excluding non-existent parameters gracefully", () => {
    const schema = {
      param1: z.string(),
      param2: z.number(),
    };

    const filtered = filterSchemaForSmallModel(schema, [
      "nonExistent",
      "param1",
    ]);

    expect(Object.keys(filtered)).toStrictEqual(["param2"]);
    expect(filtered.param2).toBe(schema.param2);
    expect(filtered.param1).toBeUndefined();
  });

  it("should handle empty schema", () => {
    const schema = {};

    const filtered = filterSchemaForSmallModel(schema, ["anything"]);

    expect(filtered).toStrictEqual({});
  });

  it("should preserve complex Zod schema types", () => {
    const schema = {
      simpleString: z.string(),
      optionalNumber: z.number().optional(),
      enumParam: z.enum(["a", "b", "c"]),
      withDefault: z.string().default("default"),
      removeThis: z.boolean(),
    };

    const filtered = filterSchemaForSmallModel(schema, ["removeThis"]);

    expect(filtered.simpleString).toBe(schema.simpleString);
    expect(filtered.optionalNumber).toBe(schema.optionalNumber);
    expect(filtered.enumParam).toBe(schema.enumParam);
    expect(filtered.withDefault).toBe(schema.withDefault);
    expect(filtered.removeThis).toBeUndefined();
  });

  it("should apply description overrides", () => {
    const schema = {
      param1: z.string().describe("original description"),
      param2: z.number().describe("another description"),
    };

    const filtered = filterSchemaForSmallModel(schema, [], {
      param1: "simplified description",
    });

    // param1 should have new description (new schema object)
    expect(filtered.param1).not.toBe(schema.param1);
    expect(filtered.param1!.description).toBe("simplified description");

    // param2 should be unchanged (same schema object)
    expect(filtered.param2).toBe(schema.param2);
    expect(filtered.param2!.description).toBe("another description");
  });

  it("should combine exclusions and description overrides", () => {
    const schema = {
      keep: z.string().describe("original"),
      override: z.number().describe("original number"),
      remove: z.boolean(),
    };

    const filtered = filterSchemaForSmallModel(schema, ["remove"], {
      override: "simplified number",
    });

    expect(Object.keys(filtered)).toStrictEqual(["keep", "override"]);
    expect(filtered.keep).toBe(schema.keep);
    expect(filtered.override).not.toBe(schema.override);
    expect(filtered.override!.description).toBe("simplified number");
    expect(filtered.remove).toBeUndefined();
  });

  it("should ignore description overrides for non-existent parameters", () => {
    const schema = {
      param1: z.string(),
    };

    const filtered = filterSchemaForSmallModel(schema, [], {
      nonExistent: "this should be ignored",
    });

    expect(Object.keys(filtered)).toStrictEqual(["param1"]);
    expect(filtered.param1).toBe(schema.param1);
  });

  it("should return original schema when both excludeParams and descriptionOverrides are empty", () => {
    const schema = {
      param1: z.string(),
      param2: z.number(),
    };

    const filtered = filterSchemaForSmallModel(schema, [], {});

    expect(filtered).toBe(schema);
  });

  it("should remove enum values from array enum param", () => {
    const schema = {
      include: z
        .array(z.enum(["notes", "timing", "warp", "sample", "*"]))
        .default([])
        .describe("all options"),
    };

    const filtered = filterSchemaForSmallModel(
      schema,
      [],
      {},
      {
        include: ["warp"],
      },
    );

    expect(getEnumOptions(filtered.include)).toStrictEqual([
      "notes",
      "timing",
      "sample",
      "*",
    ]);
    expect(getDefault(filtered.include)).toStrictEqual([]);
    expect(filtered.include!.description).toBe("all options");
  });

  it("should remove multiple enum values from array enum param", () => {
    const schema = {
      include: z
        .array(z.enum(["chains", "drum-pads", "params", "return-chains", "*"]))
        .default([]),
    };

    const filtered = filterSchemaForSmallModel(
      schema,
      [],
      {},
      {
        include: ["drum-pads", "return-chains"],
      },
    );

    expect(getEnumOptions(filtered.include)).toStrictEqual([
      "chains",
      "params",
      "*",
    ]);
  });

  it("should apply description override alongside enum value exclusion", () => {
    const schema = {
      include: z
        .array(z.enum(["notes", "warp", "*"]))
        .default([])
        .describe("original"),
    };

    const filtered = filterSchemaForSmallModel(
      schema,
      [],
      { include: "simplified" },
      { include: ["warp"] },
    );

    expect(getEnumOptions(filtered.include)).toStrictEqual(["notes", "*"]);
    // descriptionOverrides is applied first, then excludeEnumValues preserves it
    expect(filtered.include!.description).toBe("simplified");
  });

  it("should combine excludeParams with excludeEnumValues", () => {
    const schema = {
      name: z.string(),
      include: z.array(z.enum(["a", "b", "c"])).default([]),
      advanced: z.boolean(),
    };

    const filtered = filterSchemaForSmallModel(
      schema,
      ["advanced"],
      {},
      { include: ["b"] },
    );

    expect(Object.keys(filtered)).toStrictEqual(["name", "include"]);
    expect(getEnumOptions(filtered.include)).toStrictEqual(["a", "c"]);
  });

  it("should remove wildcard '*' from enum values", () => {
    const schema = {
      include: z.array(z.enum(["notes", "timing", "warp", "*"])).default([]),
    };

    const filtered = filterSchemaForSmallModel(
      schema,
      [],
      {},
      { include: ["warp", "*"] },
    );

    expect(getEnumOptions(filtered.include)).toStrictEqual(["notes", "timing"]);
  });

  it("should return original schema when all filter options are empty", () => {
    const schema = {
      param1: z.string(),
    };

    const filtered = filterSchemaForSmallModel(schema, [], {}, {});

    expect(filtered).toBe(schema);
  });

  it("should throw when excludeEnumValues targets a non-default schema", () => {
    const schema = {
      include: z.array(z.enum(["a", "b"])),
    };

    expect(() =>
      filterSchemaForSmallModel(schema, [], {}, { include: ["a"] }),
    ).toThrow("excludeEnumValues requires z.array(z.enum([...])).default([])");
  });

  it("should throw when all enum values would be excluded", () => {
    const schema = {
      include: z.array(z.enum(["a", "b"])).default([]),
    };

    expect(() =>
      filterSchemaForSmallModel(schema, [], {}, { include: ["a", "b"] }),
    ).toThrow("at least one must remain");
  });
});

function getEnumOptions(schema: z.ZodType | undefined): string[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Zod v4 internal type access
  return (schema as any).def.innerType.def.element.options;
}

function getDefault(schema: z.ZodType | undefined): string[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Zod v4 internal type access
  return (schema as any).def.defaultValue;
}
