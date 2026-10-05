// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic), Claude Code (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  looseLabelKey,
  resolveEnumIndex,
} from "#src/tools/shared/device/helpers/param-label-parsing.ts";
import { normalizeDivisionLabel } from "#src/tools/shared/device/helpers/param-reading.ts";

describe("looseLabelKey", () => {
  it.each([
    ["Mid / Side", "mid/side"],
    ["Sample & Hold", "sample&hold"],
    ["Low-pass 12dB / oct", "lowpass12db/oct"],
    ["Low - pass", "lowpass"],
    ["8-Bit", "8bit"],
    ["AD-R", "adr"],
  ])("reduces %s to %s", (label, key) => {
    expect(looseLabelKey(label)).toBe(key);
  });

  it.each([
    ["1 1/16", "1 1/16"],
    ["1  1/16", "1 1/16"],
    ["1 6", "1 6"],
    ["11  / 16", "11/16"],
    ["1 / 16", "1/16"],
    ["Amp 1 LFO 1 -> Volume", "amp1lfo1->volume"],
    [" 1 2", "1 2"],
    ["1 2 ", "1 2"],
  ])("keeps a space between digits only: %s is %s", (label, key) => {
    expect(looseLabelKey(label)).toBe(key);
  });

  it.each([["-6 dB"], ["Pitch -6"], ["1 -> 2"]])(
    "keeps a hyphen that is not between words in %s",
    (label) => {
      expect(looseLabelKey(label)).toContain("-");
    },
  );
});

describe("normalizeDivisionLabel", () => {
  it.each(["4 d", "4D", "4 D"])("reads %s as 4d", (written) => {
    expect(normalizeDivisionLabel(written)).toBe("4d");
  });

  it.each(["1/4 D", "1 / 4D", "1/4d"])("reads %s as 1/4d", (written) => {
    expect(normalizeDivisionLabel(written)).toBe("1/4d");
  });

  it("does not read '1 1/16' as the label '11  / 16'", () => {
    expect(normalizeDivisionLabel("1 1/16")).not.toBe(
      normalizeDivisionLabel("11  / 16"),
    );
  });
});

describe("resolveEnumIndex loose matching", () => {
  const looper = ["1/2", "1/2T", "1/4", "1/4T", "1/32"];

  it.each([
    ["1/2 T", 1],
    ["1 / 2T", 1],
    ["1/2t", 1],
    ["1 / 32", 4],
    ["1 / 4 t", 3],
  ])("matches %s on a Looper Quantization list", (written, index) => {
    expect(resolveEnumIndex(looper, written)).toBe(index);
  });

  it.each([
    [["Stereo", "Left", "Right", "Mid/Side"], "Mid / Side", 3],
    [["Low-pass 12dB/oct", "Low-pass 24dB/oct"], "Low-pass 12dB / oct", 0],
    [["Low-pass", "High-pass"], "Lowpass", 0],
    [["Low-pass", "High-pass"], "Low pass", 0],
    [["Low-pass", "High-pass"], "high pass", 1],
    [["AD-R", "ADR-R", "AD"], "ADR", 0],
    [["AD-R", "ADR-R", "AD"], "AD R", 0],
    [["Sine", "Sample & Hold"], "Sample&Hold", 1],
    [["Independent S&H", "Dependent"], "Independent S & H", 0],
    [["Rec/OVR", "Rec/Dub"], "Rec / OVR", 0],
  ])("matches %j written as %s", (options, written, index) => {
    expect(resolveEnumIndex(options, written)).toBe(index);
  });

  it("matches the other way round, a spaced option written tight", () => {
    expect(resolveEnumIndex(["1 / 4", "1 / 8"], "1/8")).toBe(1);
  });

  it("refuses text that matches no option", () => {
    expect(resolveEnumIndex(looper, "1/3 T")).toBe(-1);
  });

  it("refuses when two options share a key", () => {
    expect(resolveEnumIndex(["Low-pass", "Low pass"], "Lowpass")).toBe(-1);
    expect(resolveEnumIndex(["Mid/Side", "Mid / Side"], "mid /side")).toBe(-1);
  });

  it("still prefers an exact match over a loose one", () => {
    expect(resolveEnumIndex(["Low-pass", "Low pass"], "Low pass")).toBe(1);
  });

  it("does not drop the minus sign of a number", () => {
    expect(resolveEnumIndex(["-6", "0"], "6")).toBe(-1);
    expect(resolveEnumIndex(["-6", "0"], "-6")).toBe(0);
  });

  it("reads blank text as nothing, not as 0", () => {
    expect(resolveEnumIndex(["0 ms", "1 ms"], "  ")).toBe(-1);
  });

  it("matches a padded note name on its option", () => {
    expect(resolveEnumIndex(["C3", "D3"], " D3 ")).toBe(1);
    expect(resolveEnumIndex(["C3", "D3"], " E3 ")).toBe(-1);
  });

  it("keeps a different unit refused", () => {
    expect(resolveEnumIndex(["12 dB", "24 dB"], 24, "24 ms")).toBe(-1);
  });
});

describe("resolveEnumIndex refuses text that only looks like an option", () => {
  it.each([
    [["A", "B", "C"], "0"],
    [["A", "B", "C"], "0.0"],
    [["0 ms", "1 ms", "10 ms"], "1/2"],
    [["0 ms", "1 ms", "10 ms"], "10-20"],
    [["1 ms", "10 ms"], "10 samples"],
    [["12 dB", "24 dB"], "12 oct"],
    [["12 dB", "24 dB"], "24 x"],
    [["1/16", "11/16"], "1 1/16"],
    [["1/16", "11/16"], "11 1/16"],
    [[1, 6, 16], "1 6"],
  ])("refuses %j written as %s", (options, written) => {
    expect(resolveEnumIndex(options, written)).toBe(-1);
  });

  it("still lands a bare number on a measured unit and a pan on its label", () => {
    expect(resolveEnumIndex(["12 dB", "24 dB"], "24")).toBe(1);
    expect(resolveEnumIndex(["50L", "C", "50R"], "C")).toBe(1);
    expect(resolveEnumIndex(["50L", "C", "50R"], "50 R")).toBe(2);
  });

  it("matches a spaced digit label however it is spaced", () => {
    expect(resolveEnumIndex(["1 1/16", "1/16"], "1  1/16")).toBe(0);
    expect(resolveEnumIndex(["11  / 16", "1 / 16"], "11/16")).toBe(0);
  });
});
