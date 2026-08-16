// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import * as parser from "../barbeat-parser.ts";

describe("BarBeatScript Parser - edge cases", () => {
  describe("velocity range edge cases", () => {
    it("handles reversed velocity ranges correctly", () => {
      expect(parser.parse("v120-80 C3")).toStrictEqual([
        { velocityMin: 80, velocityMax: 120 },
        { pitch: 60 },
      ]);
    });

    it("handles same value velocity ranges", () => {
      expect(parser.parse("v100-100 C3")).toStrictEqual([
        { velocityMin: 100, velocityMax: 100 },
        { pitch: 60 },
      ]);
    });
  });

  describe("float parsing edge cases", () => {
    it("handles integer floats with trailing decimal in time", () => {
      expect(parser.parse("1|1.")).toStrictEqual([{ bar: 1, beat: 1 }]);
    });

    it("handles decimal-only floats in probability", () => {
      expect(parser.parse("p.5 C3")).toStrictEqual([
        { probability: 0.5 },
        { pitch: 60 },
      ]);
    });

    it("handles various float formats", () => {
      expect(parser.parse("p0.5 n5/16 v64")).toStrictEqual([
        { probability: 0.5 },
        { duration: 5 / 16 },
        { velocity: 64 },
      ]);
    });
  });

  describe("special character handling", () => {
    it("handles tab and newline characters in input", () => {
      expect(parser.parse("C3\t\nD3")).toStrictEqual([
        { pitch: 60 },
        { pitch: 62 },
      ]);
    });

    it("handles carriage return characters", () => {
      expect(parser.parse("C3\r\nD3")).toStrictEqual([
        { pitch: 60 },
        { pitch: 62 },
      ]);
    });

    it("rejects invalid characters with proper error messages", () => {
      expect(() => parser.parse("1|1 @")).toThrow('but "@" found');
      expect(() => parser.parse("1|1 $")).toThrow('but "$" found');
      expect(() => parser.parse("1|1 %")).toThrow('but "%" found');
    });

    it("handles control characters in error messages", () => {
      expect(() => parser.parse("1|1 \x00")).toThrow('but "\\0" found');
      expect(() => parser.parse("1|1 \x1F")).toThrow('but "\\x1F" found');
    });
  });

  // Forms that stay rejected (accepting them would mask a real mistake or is
  // ambiguous) but get a targeted, fix-suggesting error instead of peggy's
  // generic "Expected …".
  describe("targeted errors for kept-rejected forms", () => {
    it("rejects a 0-indexed beat and never teaches the 1|0 form", () => {
      expect(() => parser.parse("1|0 C3")).toThrow(
        /beats are 1-indexed.*for a pickup.*1\|1-n\/4.*Got beat 0/,
      );
      expect(() => parser.parse("1|0.5")).toThrow(/Got beat 0\.5/);
      // A 0 inside a comma beat-list is caught the same way.
      expect(() => parser.parse("1|1,0")).toThrow(/beats are 1-indexed/);
      // Steers to 1|1 and the offset pickup form, not the phased-out 1|0 spelling.
      let message = "";

      try {
        parser.parse("1|0");
      } catch (error) {
        message = (error as Error).message;
      }

      expect(message).not.toContain("not 1|0");
      expect(message).toContain("1|1-n/4");
    });

    it("rejects a range used as a position with a transform-time-filter hint", () => {
      expect(() => parser.parse("1|1-2|1 C3")).toThrow(
        /a position is a single bar\|beat.*transform time filter \(1\|1-2\|1: \.{3}\)/,
      );
    });

    it("rejects bar.beat / bar:beat (wrong separator) with a pipe hint", () => {
      expect(() => parser.parse("1.1")).toThrow(
        /positions use a pipe.*not "\."/,
      );
      expect(() => parser.parse("1:1")).toThrow(
        /positions use a pipe.*Got 1:1/,
      );
      expect(() => parser.parse("C3 2.3")).toThrow(
        /positions use a pipe.*Got 2\.3/,
      );
    });

    it("rejects a raw MIDI number used as a pitch", () => {
      expect(() => parser.parse("60")).toThrow(
        /use note names like C3.*not MIDI numbers.*Got 60/,
      );
      expect(() => parser.parse("C3 60")).toThrow(/use note names like C3/);
    });
  });
});
