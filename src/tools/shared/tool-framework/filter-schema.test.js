import { describe, expect, it } from "vitest";
import { z } from "zod";
import { filterSchemaForSmallModel } from "./filter-schema.js";

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

    const filtered = filterSchemaForSmallModel(schema, undefined);

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
});
