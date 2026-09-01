// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  optionalParams,
  unsetEmptyParams,
} from "#src/tools/shared/tool-framework/unset-empty-params.ts";

const schema = {
  trackIndex: z.coerce.number().int().min(0).optional(),
  count: z.coerce.number().int().min(1).default(1),
  name: z.string().optional(),
  id: z.coerce.string().optional(),
  solo: z.boolean().optional(),
  sort: z.enum(["name", "date"]).optional(),
};

const parse = (args: Record<string, unknown>): Record<string, unknown> =>
  z.object(schema).parse(unsetEmptyParams(args, schema));

describe("unsetEmptyParams", () => {
  it("drops a param sent as null", () => {
    // Number(null) is 0, a real index. z.coerce.string() gives "null", a real
    // name. A boolean or enum rejects it and takes the whole call down.
    expect(
      unsetEmptyParams(
        { trackIndex: null, id: null, name: null, solo: null, sort: null },
        schema,
      ),
    ).toStrictEqual({});
  });

  // A number, boolean or enum has no empty value, so a blank one is a mistake
  // whichever way you read it — and dropping it silently is how `count: ""`
  // became a call that quietly did one of something.
  it.each([
    ["a number", { trackIndex: "" }, "trackIndex"],
    ["a defaulted number", { count: "   " }, "count"],
    ["a boolean", { solo: "" }, "solo"],
    ["an enum", { sort: "" }, "sort"],
  ])("refuses a blank on %s", (_label, args, param) => {
    expect(() => unsetEmptyParams(args, schema)).toThrow(
      `${param}: a blank string is not a value for this param. ` +
        "Leave it out instead.",
    );
  });

  it("keeps a blank on a text param, where clearing is a real request", () => {
    expect(unsetEmptyParams({ name: "", id: "" }, schema)).toStrictEqual({
      name: "",
      id: "",
    });
  });

  it("keeps every real value, including false and 0", () => {
    const args = { trackIndex: 0, solo: false, name: "Drums", sort: "date" };

    expect(unsetEmptyParams(args, schema)).toStrictEqual(args);
  });

  it("leaves an arg the tool doesn't declare for the caller's warning", () => {
    expect(unsetEmptyParams({ nope: null }, schema)).toStrictEqual({
      nope: null,
    });
  });

  it("reads a null as omitting the param", () => {
    expect(parse({ trackIndex: null, name: null })).toStrictEqual({ count: 1 });
  });

  // Without this, `count: null` coerces to 0, fails min(1), and takes the whole
  // call down instead of falling back to the default.
  it("hands a defaulted param its default, not a rejection", () => {
    expect(parse({ count: null })).toStrictEqual({ count: 1 });
    expect(parse({ count: 3 })).toStrictEqual({ count: 3 });
  });

  it("still validates a real value", () => {
    expect(() => parse({ trackIndex: -1 })).toThrow(/too_small/);
    expect(() => parse({ sort: "nope" })).toThrow(/Invalid option/);
  });
});

describe("optionalParams", () => {
  const nested = z.object(
    optionalParams({
      kind: z.enum(["audio", "midi"]).optional().default("audio"),
      query: z.coerce.string().optional(),
      limit: z.coerce.number().optional(),
    }),
  );

  it("reads a nested param's null as unset", () => {
    expect(
      nested.parse({ kind: null, query: null, limit: null }),
    ).toStrictEqual({ kind: "audio", query: undefined, limit: undefined });
  });

  // A nested param reads a blank the same way the args-level pass does — the
  // shape is a level down from the args, not a different rule.
  it("refuses a blank on a nested param that has no blank value", () => {
    expect(() => nested.parse({ limit: "" })).toThrow(
      "limit: a blank string is not a value for this param.",
    );
  });

  it("leaves the published JSON Schema alone", () => {
    expect(z.toJSONSchema(nested, { io: "input" })).toStrictEqual({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        kind: { type: "string", enum: ["audio", "midi"], default: "audio" },
        query: { type: "string" },
        limit: { type: "number" },
      },
    });
  });
});
