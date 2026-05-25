// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { queriesInputSchema } from "../library-query-schema.ts";

describe("queriesInputSchema (searchBatch input)", () => {
  it("parses an array of query objects", () => {
    expect(
      queriesInputSchema.parse([
        { label: "Kick", tags: "Kick", limit: 3 },
        { query: "808" },
      ]),
    ).toStrictEqual([
      { label: "Kick", tags: "Kick", limit: 3 },
      { query: "808" },
    ]);
  });

  it("coerces scalar fields (numeric query/limit) to their target types", () => {
    expect(
      queriesInputSchema.parse([{ query: 808, limit: "3" }]),
    ).toStrictEqual([{ query: "808", limit: 3 }]);
  });

  it("parses a JSON-stringified array (small-model fallback)", () => {
    expect(
      queriesInputSchema.parse('[{"label":"Snare","tags":"Snare"}]'),
    ).toStrictEqual([{ label: "Snare", tags: "Snare" }]);
  });

  it("returns undefined when omitted", () => {
    expect(queriesInputSchema.parse(undefined)).toBeUndefined();
  });

  it("rejects a non-array, non-JSON string", () => {
    expect(() => queriesInputSchema.parse("not valid")).toThrow();
  });

  it("rejects a JSON string that does not parse to an array", () => {
    expect(() => queriesInputSchema.parse('{"tags":"Kick"}')).toThrow();
  });

  it("rejects an unknown enum value", () => {
    expect(() => queriesInputSchema.parse([{ kind: "bogus" }])).toThrow();
  });
});
