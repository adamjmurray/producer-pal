// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import * as parser from "../barbeat-parser.ts";

// Two independent sibling pitch streams: `[C3 E3]` then `[G3 A3]`. Shared by the
// space-separated and abutting-bracket cases, whose ASTs are identical.
const SIBLING_PITCH_STREAMS = [
  { stream: { param: "pitch", values: [[{ pitch: 60 }], [{ pitch: 64 }]] } },
  { stream: { param: "pitch", values: [[{ pitch: 67 }], [{ pitch: 69 }]] } },
];

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
      // The grammar is unchanged by pitch layering: sibling brackets parse to
      // two independent pitch-stream elements. Layering them into a chord is an
      // interpreter concern (see barbeat-interpreter-pitch-streams.test.ts).
      expect(parser.parse("[C3 E3] [G3 A3]")).toStrictEqual(
        SIBLING_PITCH_STREAMS,
      );
    });

    it("tolerates abutting sibling brackets with no separating space", () => {
      // A `[` is a self-delimiting boundary, so adjacent brackets need no space.
      // The AST is identical to the whitespace-separated form above.
      expect(parser.parse("[C3 E3][G3 A3]")).toStrictEqual(
        SIBLING_PITCH_STREAMS,
      );
    });

    it("tolerates abutting brackets of different parameter kinds", () => {
      expect(parser.parse("[C3 E3][v80 v100]")).toStrictEqual([
        {
          stream: {
            param: "pitch",
            values: [[{ pitch: 60 }], [{ pitch: 64 }]],
          },
        },
        {
          stream: {
            param: "velocity",
            values: [{ velocity: 80 }, { velocity: 100 }],
          },
        },
      ]);
    });
  });

  describe("value streams (velocity / duration / probability)", () => {
    it("parses a velocity stream", () => {
      expect(parser.parse("[v80 v100]")).toStrictEqual([
        {
          stream: {
            param: "velocity",
            values: [{ velocity: 80 }, { velocity: 100 }],
          },
        },
      ]);
    });

    it("parses a velocity range as a stream value", () => {
      expect(parser.parse("[v40-80 v100]")).toStrictEqual([
        {
          stream: {
            param: "velocity",
            values: [{ velocityMin: 40, velocityMax: 80 }, { velocity: 100 }],
          },
        },
      ]);
    });

    it("parses a duration stream (note values and bar forms)", () => {
      expect(parser.parse("[n/4 n/8]")).toStrictEqual([
        {
          stream: {
            param: "duration",
            values: [{ duration: 0.25 }, { duration: 0.125 }],
          },
        },
      ]);
      expect(parser.parse("[1bar n/8]")).toStrictEqual([
        {
          stream: {
            param: "duration",
            values: [{ bars: 1, duration: 0 }, { duration: 0.125 }],
          },
        },
      ]);
    });

    it("parses a probability stream", () => {
      expect(parser.parse("[p1 p0.6]")).toStrictEqual([
        {
          stream: {
            param: "probability",
            values: [{ probability: 1 }, { probability: 0.6 }],
          },
        },
      ]);
    });
  });

  describe("rejected forms (one parameter kind, no nesting)", () => {
    it("rejects an empty bracket", () => {
      expect(() => parser.parse("[]")).toThrow('but "[" found');
    });

    it("rejects a bracket mixing parameter kinds", () => {
      expect(() => parser.parse("[v80 C3]")).toThrow("one parameter kind");
      expect(() => parser.parse("[n/4 v80]")).toThrow("one parameter kind");
      expect(() => parser.parse("[C3 p1]")).toThrow("one parameter kind");
    });

    it("rejects a nested bracket (a stream is not a value)", () => {
      expect(() => parser.parse("[C3 [D3 E3]]")).toThrow('but "[" found');
    });

    it("rejects a nested or bracket-containing chord", () => {
      expect(() => parser.parse("((C3 E3) G3)")).toThrow('but "(" found');
      expect(() => parser.parse("(C3 [D3 E3])")).toThrow('but "(" found');
    });

    it("rejects a bare chord with no surrounding stream", () => {
      // `(...)` is only a stream value, not a standalone element.
      expect(() => parser.parse("(C3 E3)")).toThrow('but "(" found');
    });

    it("still requires whitespace from a bracket to a non-bracket element", () => {
      // The no-space tolerance fires only before a `[`, so a bracket followed by
      // a time position (or any non-bracket) is NOT allowed to abut.
      expect(() => parser.parse("[C3 E3]1|1")).toThrow('but "1" found');
      expect(() => parser.parse("[v80 v100]C3 1|1")).toThrow('but "C" found');
    });
  });
});
