// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { z, type ZodType } from "zod";
import { deprecatedParam } from "../deprecated-param.ts";
import { getParamModes, param } from "../modal-config.ts";
import { resolveToolSchema } from "../resolve-tool-schema.ts";
import { carrySchemaTags, getSchemaTag, tagSchema } from "../schema-tags.ts";

// Every Zod builder returns a NEW instance, so tagging a param and then wrapping
// it used to drop the tag with nothing failing: the retired name got
// republished, or per-mode config stopped applying. These are the wrappers a
// tool author would plausibly reach for after param() / deprecatedParam().
const WRAPPERS: [string, (schema: ZodType) => ZodType][] = [
  [".optional()", (schema) => schema.optional()],
  [".nullable()", (schema) => schema.nullable()],
  [".default()", (schema) => schema.default("x")],
  [".transform()", (schema) => schema.transform((value) => value)],
  [".refine()", (schema) => schema.refine(() => true)],
  [".meta()", (schema) => schema.meta({ title: "a param" })],
  [".describe()", (schema) => schema.describe("re-described")],
  [".optional().refine()", (schema) => schema.optional().refine(() => true)],
];

describe("tags through Zod wrappers", () => {
  it.each(WRAPPERS)(
    "keeps a deprecated param unpublished through %s",
    (_label, wrap) => {
      const toSlot = wrap(
        deprecatedParam(z.coerce.string(), { replacedBy: "toPath" }),
      );
      const { published, validating, deprecated } = resolveToolSchema(
        { toSlot },
        {},
      );

      expect(Object.keys(published)).toStrictEqual([]);
      expect(Object.keys(validating)).toStrictEqual(["toSlot"]);
      expect(deprecated.toSlot).toStrictEqual({ replacedBy: "toPath" });
    },
  );

  it.each(WRAPPERS)(
    "keeps a mode that hides the param applying through %s",
    (_label, wrap) => {
      const notes = wrap(
        param(z.coerce.string(), { default: "base", smallModel: null }),
      );

      expect(Object.keys(resolveToolSchema({ notes }, {}).published)).toContain(
        "notes",
      );
      expect(
        Object.keys(
          resolveToolSchema({ notes }, { smallModelMode: true }).published,
        ),
      ).toStrictEqual([]);
    },
  );

  it.each(WRAPPERS)(
    "keeps a mode's description override applying through %s",
    (_label, wrap) => {
      const notes = wrap(
        param(z.coerce.string(), { default: "base", smallModel: "short" }),
      );
      const { published } = resolveToolSchema(
        { notes },
        { smallModelMode: true },
      );

      expect(published.notes?.description).toBe("short");
    },
  );
});

describe("tag resolution", () => {
  it("lets a re-tagged schema override what it inherited", () => {
    const schema = param(param(z.string(), { default: "inner" }), {
      default: "outer",
    });

    expect(getParamModes(schema)?.default).toBe("outer");
  });

  it("does not reach into an array's element", () => {
    const key = Symbol("test");
    const element = tagSchema(z.string(), key, "tagged");

    expect(getSchemaTag(z.array(element), key)).toBeUndefined();
  });
});

describe("carrySchemaTags", () => {
  it("copies tags found under a wrapper onto a rebuilt schema", () => {
    // An enum trim rebuilds the param from scratch, so there is no link back to
    // where the tags were attached — here, under the .default() wrapper.
    const trimmed = deprecatedParam(
      param(z.array(z.enum(["a", "b"])), {
        default: "a param",
        smallModel: { excludeEnumValues: ["b"] },
      }),
      { replacedBy: "toPath" },
    ).default([]);
    const { published, deprecated } = resolveToolSchema(
      { trimmed },
      { smallModelMode: true },
    );

    expect(Object.keys(published)).toStrictEqual([]);
    expect(deprecated.trimmed).toStrictEqual({ replacedBy: "toPath" });
  });

  it("leaves an untagged schema untagged", () => {
    const key = Symbol("test");

    expect(getSchemaTag(carrySchemaTags(z.string(), z.number()), key)).toBe(
      undefined,
    );
  });
});
