// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { paramsInputSchema } from "../device-params-schema.ts";
import { normalizeParamValue } from "../update-device-param-parser.ts";

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
  });

  it("accepts unit suffixes case-insensitively", () => {
    expect(normalizeParamValue("72hz")).toBe(72);
    expect(normalizeParamValue("72 HZ")).toBe(72);
    expect(normalizeParamValue("1.5 KHZ")).toBe(1500);
    expect(normalizeParamValue("-6 db")).toBe(-6);
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
    expect(() => paramsInputSchema.parse([{ value: "1" }])).toThrow();
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
    expect(() => paramsInputSchema.parse([{ name: "Freq" }])).toThrow();
  });

  it("rejects an entry with a null value", () => {
    expect(() =>
      paramsInputSchema.parse([{ name: "Freq", value: null }]),
    ).toThrow();
  });

  it("rejects a non-JSON string with a clear array error", () => {
    expect(() => paramsInputSchema.parse("not valid format")).toThrow();
  });

  it("rejects a JSON string that does not parse to an array", () => {
    expect(() =>
      paramsInputSchema.parse('{"name":"Freq","value":1}'),
    ).toThrow();
  });
});
