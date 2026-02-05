// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import * as parser from "./barbeat-parser.ts";

describe("BarBeatScript Parser - basic tests", () => {
  describe("basic structure", () => {
    it("parses an empty input", () => {
      expect(parser.parse("")).toStrictEqual([]);
      expect(parser.parse("  \t\n ")).toStrictEqual([]);
    });

    it("parses a sequence of notes", () => {
      expect(parser.parse("C3 E3 G3")).toStrictEqual([
        { pitch: 60 },
        { pitch: 64 },
        { pitch: 67 },
      ]);
    });

    it("parses mixed elements (state + notes)", () => {
      expect(parser.parse("1|1 v100 t0.5 p0.8 C3 D3")).toStrictEqual([
        { bar: 1, beat: 1 },
        { velocity: 100 },
        { duration: 0.5 },
        { probability: 0.8 },
        { pitch: 60 },
        { pitch: 62 },
      ]);
    });

    it("parses state-only input", () => {
      expect(parser.parse("2|3 v80 t0.25 p0.9")).toStrictEqual([
        { bar: 2, beat: 3 },
        { velocity: 80 },
        { duration: 0.25 },
        { probability: 0.9 },
      ]);
    });
  });

  describe("pitch", () => {
    it("rejects out-of-range MIDI pitch", () => {
      expect(() => parser.parse("C-3")).toThrow(/outside valid range/);
      expect(() => parser.parse("C9")).toThrow(/outside valid range/);
    });

    it("handles enharmonic spellings", () => {
      expect(parser.parse("C3 D#3 Eb3 F#3 Gb3")).toStrictEqual([
        { pitch: 60 }, // C3
        { pitch: 63 }, // D#3
        { pitch: 63 }, // Eb3
        { pitch: 66 }, // F#3
        { pitch: 66 }, // Gb3
      ]);
    });

    it("doesn't support B#, Cb, E# or Fb", () => {
      expect(() => parser.parse("B#3")).toThrow();
      expect(() => parser.parse("Cb3")).toThrow();
      expect(() => parser.parse("E#3")).toThrow();
      expect(() => parser.parse("Fb3")).toThrow();
    });
  });

  describe("probability", () => {
    it("accepts valid probability values", () => {
      expect(parser.parse("p0.0 C3 p0.5 D3 p1.0 E3")).toStrictEqual([
        { probability: 0.0 },
        { pitch: 60 },
        { probability: 0.5 },
        { pitch: 62 },
        { probability: 1.0 },
        { pitch: 64 },
      ]);
    });

    it("rejects out-of-range probability", () => {
      expect(() => parser.parse("p1.5 C3")).toThrow(
        "Note probability 1.5 outside valid range 0.0-1.0",
      );
    });
  });

  describe("velocity", () => {
    it("accepts valid MIDI velocity", () => {
      expect(parser.parse("v0 C3 v127 D3")).toStrictEqual([
        { velocity: 0 },
        { pitch: 60 },
        { velocity: 127 },
        { pitch: 62 },
      ]);
    });

    it("accepts valid velocity ranges", () => {
      expect(parser.parse("v80-120 C3 v0-127 D3")).toStrictEqual([
        { velocityMin: 80, velocityMax: 120 },
        { pitch: 60 },
        { velocityMin: 0, velocityMax: 127 },
        { pitch: 62 },
      ]);
    });

    it("rejects out-of-range velocity", () => {
      expect(() => parser.parse("v128 C3")).toThrow(
        "MIDI velocity 128 outside valid range 0-127",
      );
    });

    it("rejects invalid velocity ranges", () => {
      expect(() => parser.parse("v128-130 C3")).toThrow(
        "Invalid velocity range 128-130",
      );
      expect(() => parser.parse("v0-128 C3")).toThrow(
        "Invalid velocity range 0-128",
      );
    });

    it("rejects negative velocity", () => {
      expect(() => parser.parse("v-1 C3")).toThrow(
        'Expected [0-9] but "-" found.',
      );
    });
  });
});
