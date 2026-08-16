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
      { label: "Kick", tags: "Kick", limit: 3, kind: "audio" },
      { query: "808", kind: "audio" },
    ]);
  });

  it("defaults kind to audio (matching single search) and preserves an explicit kind", () => {
    expect(
      queriesInputSchema.parse([
        { tags: "Kick" },
        { tags: "Pad", kind: "midi" },
      ]),
    ).toStrictEqual([
      { tags: "Kick", kind: "audio" },
      { tags: "Pad", kind: "midi" },
    ]);
  });

  it("coerces scalar fields (numeric query/limit) to their target types", () => {
    expect(
      queriesInputSchema.parse([{ query: 808, limit: "3" }]),
    ).toStrictEqual([{ query: "808", limit: 3, kind: "audio" }]);
  });

  it("accepts verifyPaths per query so a batch can verify each query's results independently", () => {
    expect(
      queriesInputSchema.parse([
        { label: "Kicks", tags: "Kick", verifyPaths: true },
        { label: "Snares", tags: "Snare" },
      ]),
    ).toStrictEqual([
      { label: "Kicks", tags: "Kick", verifyPaths: true, kind: "audio" },
      { label: "Snares", tags: "Snare", kind: "audio" },
    ]);
  });

  it("preserves inFolder so a batch query restricts to a folder like a single search", () => {
    expect(
      queriesInputSchema.parse([
        { label: "Inside Kicks", inFolder: "/Library/Drums/Kicks" },
      ]),
    ).toStrictEqual([
      {
        label: "Inside Kicks",
        inFolder: "/Library/Drums/Kicks",
        kind: "audio",
      },
    ]);
  });

  it("parses a JSON-stringified array (small-model fallback)", () => {
    expect(
      queriesInputSchema.parse('[{"label":"Snare","tags":"Snare"}]'),
    ).toStrictEqual([{ label: "Snare", tags: "Snare", kind: "audio" }]);
  });

  it("returns undefined when omitted", () => {
    expect(queriesInputSchema.parse(undefined)).toBeUndefined();
  });

  it("rejects a non-array, non-JSON string", () => {
    expect(() => queriesInputSchema.parse("not valid")).toThrow(
      "Invalid input: expected array, received string",
    );
  });

  it("rejects a JSON string that does not parse to an array", () => {
    expect(() => queriesInputSchema.parse('{"tags":"Kick"}')).toThrow(
      "Invalid input: expected array, received object",
    );
  });

  it("rejects an unknown enum value", () => {
    // Zod's message lands inside a JSON dump, so the quotes around each value
    // arrive escaped.
    expect(() => queriesInputSchema.parse([{ kind: "bogus" }])).toThrow(
      /Invalid option: expected one of .*audio.*folder/,
    );
  });
});
