// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { paramsInputSchema } from "../../device-params-schema.ts";
import { normalizeParamValue } from "../../update-device-param-parser.ts";

describe("normalizeParamValue", () => {
  it("coerces numeric values", () => {
    expect(normalizeParamValue("1000")).toBe(1000);
    expect(normalizeParamValue("-3.5")).toBe(-3.5);
    expect(normalizeParamValue("0")).toBe(0);
  });

  it("keeps non-numeric values as strings", () => {
    expect(normalizeParamValue("C3")).toBe("C3");
    expect(normalizeParamValue("Fade")).toBe("Fade");
    expect(normalizeParamValue("custom-value")).toBe("custom-value");
  });

  it("does not treat Infinity or NaN as numbers", () => {
    expect(normalizeParamValue("Infinity")).toBe("Infinity");
    expect(normalizeParamValue("NaN")).toBe("NaN");
  });

  it("keeps an empty string as a string (does not coerce to 0)", () => {
    expect(normalizeParamValue("")).toBe("");
  });

  it("keeps division-style string values as strings", () => {
    expect(normalizeParamValue("1/16")).toBe("1/16");
  });

  it("strips unit suffixes and converts to canonical units", () => {
    expect(normalizeParamValue("72 Hz")).toBe(72);
    expect(normalizeParamValue("72Hz")).toBe(72);
    expect(normalizeParamValue("1.5 kHz")).toBe(1500);
    expect(normalizeParamValue("-6 dB")).toBe(-6);
    expect(normalizeParamValue("100 ms")).toBe(100);
    expect(normalizeParamValue("0.5 s")).toBe(500);
    expect(normalizeParamValue("180°")).toBe(180);
    expect(normalizeParamValue("180 °")).toBe(180);
  });

  it("accepts unit suffixes case-insensitively", () => {
    expect(normalizeParamValue("72hz")).toBe(72);
    expect(normalizeParamValue("72 HZ")).toBe(72);
    expect(normalizeParamValue("1.5 KHZ")).toBe(1500);
    expect(normalizeParamValue("-6 db")).toBe(-6);
  });

  it("keeps directional pan labels as strings but maps centered 'C' to 0", () => {
    // A directional pan label must NOT reduce to its bare number — that drops the
    // L/R direction (#14), and a bare pan number is meaningless (pan is -1..1).
    // The pan-aware setter parses the string form. "C" has no direction → 0.
    expect(normalizeParamValue("50L")).toBe("50L");
    expect(normalizeParamValue("50R")).toBe("50R");
    expect(normalizeParamValue("25L")).toBe("25L");
    expect(normalizeParamValue("C")).toBe(0);
  });
});

describe("paramsInputSchema", () => {
  it("accepts a structured array unchanged", () => {
    expect(
      paramsInputSchema.parse([{ name: "Filter Freq", value: "1000" }]),
    ).toStrictEqual([{ name: "Filter Freq", value: "1000" }]);
  });

  it("coerces a numeric value to a string", () => {
    expect(
      paramsInputSchema.parse([{ name: "Freq", value: 1000 }]),
    ).toStrictEqual([{ name: "Freq", value: "1000" }]);
  });

  it("coerces a numeric name (param index) to a string instead of failing", () => {
    expect(paramsInputSchema.parse([{ name: 3, value: 1 }])).toStrictEqual([
      { name: "3", value: "1" },
    ]);
  });

  it("rejects an entry with a missing name", () => {
    expect(() => paramsInputSchema.parse([{ value: "1" }])).toThrow(
      "Invalid input: expected string, received undefined",
    );
  });

  it("parses a JSON-stringified array (small-model fallback)", () => {
    expect(
      paramsInputSchema.parse('[{"name":"Freq","value":1000}]'),
    ).toStrictEqual([{ name: "Freq", value: "1000" }]);
  });

  it("passes undefined through (optional)", () => {
    expect(paramsInputSchema.parse(undefined)).toBeUndefined();
  });

  it("rejects an entry with a missing value", () => {
    expect(() => paramsInputSchema.parse([{ name: "Freq" }])).toThrow(
      "Invalid input: expected string, received undefined",
    );
  });

  it("rejects an entry with a null value", () => {
    expect(() =>
      paramsInputSchema.parse([{ name: "Freq", value: null }]),
    ).toThrow("Invalid input: expected string, received null");
  });

  it("rejects a non-JSON string with a clear array error", () => {
    expect(() => paramsInputSchema.parse("not valid format")).toThrow(
      "Invalid input: expected array, received string",
    );
  });

  it("rejects a JSON string that does not parse to an array", () => {
    expect(() => paramsInputSchema.parse('{"name":"Freq","value":1}')).toThrow(
      "Invalid input: expected array, received object",
    );
  });
});
