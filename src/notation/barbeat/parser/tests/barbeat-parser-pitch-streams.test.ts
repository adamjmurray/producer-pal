// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import * as parser from "../barbeat-parser.ts";

describe("BarBeatScript Parser - pitch streams (pattern brackets)", () => {
  describe("valid streams", () => {
    it("parses a bracketed pitch stream as chord values", () => {
      expect(parser.parse("[C3 E3 G3]")).toStrictEqual([
        {
          stream: {
            param: "pitch",
            values: [[{ pitch: 60 }], [{ pitch: 64 }], [{ pitch: 67 }]],
          },
        },
      ]);
    });

    it("normalizes a single bare pitch to a length-1 chord", () => {
      expect(parser.parse("[C3]")).toStrictEqual([
        { stream: { param: "pitch", values: [[{ pitch: 60 }]] } },
      ]);
    });

    it("parses parenthesized chords as stream values", () => {
      expect(parser.parse("[(C3 E3) (D3 F3)]")).toStrictEqual([
        {
          stream: {
            param: "pitch",
            values: [
              [{ pitch: 60 }, { pitch: 64 }],
              [{ pitch: 62 }, { pitch: 65 }],
            ],
          },
        },
      ]);
    });

    it("mixes bare pitches and chords", () => {
      expect(parser.parse("[C3 (E3 G3)]")).toStrictEqual([
        {
          stream: {
            param: "pitch",
            values: [[{ pitch: 60 }], [{ pitch: 64 }, { pitch: 67 }]],
          },
        },
      ]);
    });

    it("tolerates whitespace inside brackets and chords", () => {
      expect(parser.parse("[ C3   ( E3  G3 ) ]")).toStrictEqual([
        {
          stream: {
            param: "pitch",
            values: [[{ pitch: 60 }], [{ pitch: 64 }, { pitch: 67 }]],
          },
        },
      ]);
    });

    it("parses a stream followed by a time position", () => {
      expect(parser.parse("[C3 E3] 1|1x2@n/4")).toStrictEqual([
        {
          stream: {
            param: "pitch",
            values: [[{ pitch: 60 }], [{ pitch: 64 }]],
          },
        },
        { bar: 1, beat: { start: 1, times: 2, step: 0.25 } },
      ]);
    });

    it("parses sibling pitch streams as separate elements", () => {
      expect(parser.parse("[C3 E3] [G3 A3]")).toStrictEqual([
        {
          stream: {
            param: "pitch",
            values: [[{ pitch: 60 }], [{ pitch: 64 }]],
          },
        },
        {
          stream: {
            param: "pitch",
            values: [[{ pitch: 67 }], [{ pitch: 69 }]],
          },
        },
      ]);
    });
  });

  describe("rejected forms (one parameter kind, no nesting)", () => {
    it("rejects an empty bracket", () => {
      expect(() => parser.parse("[]")).toThrow();
    });

    it("rejects a parameter token inside a pitch bracket", () => {
      expect(() => parser.parse("[v80 v100]")).toThrow();
      expect(() => parser.parse("[v80 C3]")).toThrow();
    });

    it("rejects a nested bracket (a stream is not a value)", () => {
      expect(() => parser.parse("[C3 [D3 E3]]")).toThrow();
    });

    it("rejects a nested or bracket-containing chord", () => {
      expect(() => parser.parse("((C3 E3) G3)")).toThrow();
      expect(() => parser.parse("(C3 [D3 E3])")).toThrow();
    });

    it("rejects a bare chord with no surrounding stream", () => {
      // `(...)` is only a stream value, not a standalone element.
      expect(() => parser.parse("(C3 E3)")).toThrow();
    });
  });
});
