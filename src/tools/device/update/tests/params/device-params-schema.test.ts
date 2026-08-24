// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { paramsInputSchema } from "../../device-params-schema.ts";

describe("paramsInputSchema", () => {
  it("parses a JSON-stringified array of entries", () => {
    const result = paramsInputSchema.parse(
      JSON.stringify([{ name: "Volume", value: "0.5" }]),
    );

    expect(result).toStrictEqual([{ name: "Volume", value: "0.5" }]);
  });

  it("accepts an already-structured array unchanged", () => {
    const result = paramsInputSchema.parse([{ name: "Pan", value: "0" }]);

    expect(result).toStrictEqual([{ name: "Pan", value: "0" }]);
  });

  it("rejects a malformed JSON string rather than swallowing it as undefined", () => {
    // The catch must return the original (unparseable) string so array
    // validation fails; returning undefined would masquerade as "no params".
    expect(() => paramsInputSchema.parse("not json [")).toThrow(
      "Invalid input: expected array, received string",
    );
  });

  it("coerces numeric name/value fields to strings", () => {
    const result = paramsInputSchema.parse([{ name: 3, value: 1 }]);

    expect(result).toStrictEqual([{ name: "3", value: "1" }]);
  });

  it("coerces an object field to JSON so the setter can warn and skip it", () => {
    // A structured name/value can never resolve, but it must reach the setter
    // as a string: setParamValues warns and skips the one bad entry, where a
    // validation failure here would reject every other param in the call.
    const result = paramsInputSchema.parse([
      { name: { oops: 1 }, value: ["a"] },
    ]);

    expect(result).toStrictEqual([{ name: '{"oops":1}', value: '["a"]' }]);
  });

  it("rejects a missing or null field", () => {
    expect(() => paramsInputSchema.parse([{ name: null, value: "1" }])).toThrow(
      "Invalid input: expected string, received null",
    );
    expect(() => paramsInputSchema.parse([{ value: "1" }])).toThrow(
      "Invalid input: expected string, received undefined",
    );
  });
});
