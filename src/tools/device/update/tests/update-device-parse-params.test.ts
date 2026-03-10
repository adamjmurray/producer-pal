// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { parseParamLines } from "../update-device-param-parser.ts";

const outlet = vi.fn();

vi.stubGlobal("outlet", outlet);

describe("parseParamLines", () => {
  it("should parse a single name=value pair", () => {
    expect(parseParamLines("Osc Type = Sawtooth")).toStrictEqual([
      ["Osc Type", "Sawtooth"],
    ]);
  });

  it("should parse multiple lines", () => {
    expect(parseParamLines("Attack = 0.1\nRelease = 0.5")).toStrictEqual([
      ["Attack", 0.1],
      ["Release", 0.5],
    ]);
  });

  it("should coerce numeric values", () => {
    expect(parseParamLines("Freq = 1000")).toStrictEqual([["Freq", 1000]]);
    expect(parseParamLines("Gain = -3.5")).toStrictEqual([["Gain", -3.5]]);
    expect(parseParamLines("Zero = 0")).toStrictEqual([["Zero", 0]]);
  });

  it("should keep non-numeric values as strings", () => {
    expect(parseParamLines("Note = C3")).toStrictEqual([["Note", "C3"]]);
    expect(parseParamLines("Mode = Fade")).toStrictEqual([["Mode", "Fade"]]);
  });

  it("should handle whitespace variants around =", () => {
    expect(parseParamLines("A=1")).toStrictEqual([["A", 1]]);
    expect(parseParamLines("A =1")).toStrictEqual([["A", 1]]);
    expect(parseParamLines("A= 1")).toStrictEqual([["A", 1]]);
    expect(parseParamLines("A = 1")).toStrictEqual([["A", 1]]);
  });

  it("should trim leading/trailing whitespace on lines", () => {
    expect(parseParamLines("  A = 1  ")).toStrictEqual([["A", 1]]);
  });

  it("should split on first = only (value contains =)", () => {
    expect(parseParamLines("Param = a=b")).toStrictEqual([["Param", "a=b"]]);
  });

  it("should skip empty and whitespace-only lines", () => {
    expect(parseParamLines("A = 1\n\n  \nB = 2")).toStrictEqual([
      ["A", 1],
      ["B", 2],
    ]);
  });

  it("should skip full-line // comments", () => {
    expect(
      parseParamLines("// Oscillator settings\nOsc Type = Saw"),
    ).toStrictEqual([["Osc Type", "Saw"]]);
  });

  it("should skip indented full-line // comments", () => {
    expect(parseParamLines("  // comment\nA = 1")).toStrictEqual([["A", 1]]);
  });

  it("should strip trailing // comments from values", () => {
    expect(parseParamLines("Freq = 0.5 // will automate")).toStrictEqual([
      ["Freq", 0.5],
    ]);
  });

  it("should handle comment-only input", () => {
    expect(parseParamLines("// nothing here\n// also nothing")).toStrictEqual(
      [],
    );
  });

  it("should return empty array for empty input", () => {
    expect(parseParamLines("")).toStrictEqual([]);
  });

  it("should warn and skip lines without =", () => {
    parseParamLines("no equals here");

    expect(outlet).toHaveBeenCalledWith(
      1,
      'updateDevice: skipping line without "=": no equals here',
    );
  });

  it("should warn and skip lines with empty name", () => {
    parseParamLines("= value");

    expect(outlet).toHaveBeenCalledWith(
      1,
      "updateDevice: skipping line with empty name: = value",
    );
  });

  it("should warn and skip lines with empty value", () => {
    parseParamLines("Name =");

    expect(outlet).toHaveBeenCalledWith(
      1,
      "updateDevice: skipping line with empty value: Name =",
    );
  });

  it("should handle numeric param IDs as names", () => {
    expect(parseParamLines("789 = 1000")).toStrictEqual([["789", 1000]]);
  });

  it("should not treat Infinity or NaN as numbers", () => {
    expect(parseParamLines("A = Infinity")).toStrictEqual([["A", "Infinity"]]);
    expect(parseParamLines("A = NaN")).toStrictEqual([["A", "NaN"]]);
  });

  it("should handle division-style string values", () => {
    expect(parseParamLines("Rate = 1/16")).toStrictEqual([["Rate", "1/16"]]);
  });
});
