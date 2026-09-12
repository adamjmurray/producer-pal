// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The three pitch units Live prints on device params. Split from
// device-display-helpers.test.ts to keep both files under the line limit.
//
// They are all pitch, but none of them folds into another: a param displays
// one of the three, and a written value is converted onto the scale that param
// shows. Cents read as semitones, or scale degrees as either, would land the
// number unconverted.

import { describe, expect, it } from "vitest";
import { parseLabel } from "../device-label-helpers.ts";

describe("parseLabel pitch units", () => {
  describe("semitones (st)", () => {
    it("parses semitone values", () => {
      expect(parseLabel("0 st")).toStrictEqual({
        value: 0,
        unit: "semitones",
      });
      expect(parseLabel("+12 st")).toStrictEqual({
        value: 12,
        unit: "semitones",
      });
      expect(parseLabel("-24 st")).toStrictEqual({
        value: -24,
        unit: "semitones",
      });
      expect(parseLabel("7 st")).toStrictEqual({
        value: 7,
        unit: "semitones",
      });
    });

    it("parses 'semitones', 'semitone', 'semi', 'semis' as st", () => {
      expect(parseLabel("12 semitones")).toStrictEqual({
        value: 12,
        unit: "semitones",
      });
      expect(parseLabel("1 semitone")).toStrictEqual({
        value: 1,
        unit: "semitones",
      });
      expect(parseLabel("+5 semi")).toStrictEqual({
        value: 5,
        unit: "semitones",
      });
      expect(parseLabel("-7 semis")).toStrictEqual({
        value: -7,
        unit: "semitones",
      });
      expect(parseLabel("12SEMITONES")).toStrictEqual({
        value: 12,
        unit: "semitones",
      });
    });

    // Live writes decimals here routinely: Hybrid Reverb's Sh Pitch Shift
    // reads "-1.68 st", Spectral Resonator's Shift reads "0.0 st". An
    // integer-only pattern dropped them to the bare-number fallback, which
    // kept the value and lost the unit.
    it("parses a fractional semitone value", () => {
      expect(parseLabel("0.0 st")).toStrictEqual({
        value: 0,
        unit: "semitones",
      });
      expect(parseLabel("-1.68 st")).toStrictEqual({
        value: -1.68,
        unit: "semitones",
      });
      expect(parseLabel("+2.5 semitones")).toStrictEqual({
        value: 2.5,
        unit: "semitones",
      });
    });
  });

  describe("cents (ct)", () => {
    it("parses cent values", () => {
      expect(parseLabel("0 ct")).toStrictEqual({ value: 0, unit: "cents" });
      expect(parseLabel("2100 ct")).toStrictEqual({
        value: 2100,
        unit: "cents",
      });
      expect(parseLabel("-50 ct")).toStrictEqual({
        value: -50,
        unit: "cents",
      });
      expect(parseLabel("+12.5 cents")).toStrictEqual({
        value: 12.5,
        unit: "cents",
      });
    });

    // Cents are hundredths of a semitone, but folding them the way seconds
    // fold into milliseconds would rescale every write to a cents param: a
    // param displays one or the other, and a write is converted onto the
    // scale the param shows.
    it("keeps cents separate from semitones", () => {
      expect(parseLabel("100 ct").value).toBe(100);
      expect(parseLabel("100 ct").unit).not.toBe("semitones");
    });
  });

  describe("scale degrees (sd)", () => {
    it("parses scale degree values", () => {
      expect(parseLabel("10 sd")).toStrictEqual({
        value: 10,
        unit: "scale degrees",
      });
      expect(parseLabel("-3 scale degrees")).toStrictEqual({
        value: -3,
        unit: "scale degrees",
      });
    });

    // Steps of the current scale, not of the chromatic one, so a semitone
    // value written to one of these is a different quantity and is refused.
    it("does not read them as semitones", () => {
      expect(parseLabel("10 sd").unit).not.toBe("semitones");
    });
  });
});
