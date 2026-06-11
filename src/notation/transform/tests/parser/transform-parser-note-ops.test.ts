// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { parse } from "#src/notation/transform/parser/transform-parser.ts";

describe("Transform Parser - note-count operations (ratchet/repeat/split/merge)", () => {
  describe("ratchet", () => {
    it("parses a bare count", () => {
      expect(parse("ratchet(2)")).toStrictEqual([
        {
          pitchRange: null,
          timeRange: null,
          kind: "noteOp",
          name: "ratchet",
          args: [2],
        },
      ]);
    });

    it("parses a note-value grid argument", () => {
      const result = parse("ratchet(n/16)");

      expect(result[0]).toMatchObject({
        kind: "noteOp",
        name: "ratchet",
        args: [{ type: "nDuration", wholeNoteFraction: 0.0625 }],
      });
    });

    it("parses a bar-duration grid argument", () => {
      const result = parse("ratchet(1bar)");

      expect(result[0]).toMatchObject({
        kind: "noteOp",
        name: "ratchet",
        args: [{ type: "barDuration", bars: 1 }],
      });
    });
  });

  describe("repeat", () => {
    it("parses a count and a note-value offset", () => {
      const result = parse("repeat(3, n/8)");

      expect(result[0]).toMatchObject({
        kind: "noteOp",
        name: "repeat",
        args: [3, { type: "nDuration", wholeNoteFraction: 0.125 }],
      });
    });

    it("parses a count and a bar-duration offset", () => {
      expect(parse("repeat(2, 1bar)")).toStrictEqual([
        {
          pitchRange: null,
          timeRange: null,
          kind: "noteOp",
          name: "repeat",
          args: [2, { type: "barDuration", bars: 1 }],
        },
      ]);
    });

    it("carries a selector prefix", () => {
      const result = parse("C3: repeat(2, n/4)");

      expect(result[0]).toMatchObject({
        kind: "noteOp",
        name: "repeat",
        args: [2, { type: "nDuration", wholeNoteFraction: 0.25 }],
        pitchRange: { startPitch: 60, endPitch: 60 },
      });
    });
  });

  describe("merge", () => {
    it("parses with no arguments", () => {
      expect(parse("merge()")).toStrictEqual([
        {
          pitchRange: null,
          timeRange: null,
          kind: "noteOp",
          name: "merge",
          args: [],
        },
      ]);
    });

    it("parses a literal 0 gap-tolerance argument", () => {
      expect(parse("merge(0)")).toStrictEqual([
        {
          pitchRange: null,
          timeRange: null,
          kind: "noteOp",
          name: "merge",
          args: [0],
        },
      ]);
    });

    it("parses a note-value gap-tolerance argument", () => {
      const result = parse("merge(n/8)");

      expect(result[0]).toMatchObject({
        kind: "noteOp",
        name: "merge",
        args: [{ type: "nDuration", wholeNoteFraction: 0.125 }],
      });
    });
  });

  describe("split", () => {
    it("parses one bar|beat position as absolute musical beats", () => {
      expect(parse("split(2|1)")).toStrictEqual([
        {
          pitchRange: null,
          timeRange: null,
          kind: "noteOp",
          name: "split",
          args: [{ type: "barBeatPoint", musicalBeats: 4 }],
          sync: false,
        },
      ]);
    });

    it("parses a trailing sync keyword", () => {
      expect(parse("split(2|1, 2|3, sync)")).toStrictEqual([
        {
          pitchRange: null,
          timeRange: null,
          kind: "noteOp",
          name: "split",
          args: [
            { type: "barBeatPoint", musicalBeats: 4 },
            { type: "barBeatPoint", musicalBeats: 6 },
          ],
          sync: true,
        },
      ]);
    });

    it("parses a single position with sync", () => {
      expect(parse("split(5|1, sync)")).toMatchObject([
        {
          name: "split",
          args: [{ type: "barBeatPoint", musicalBeats: 16 }],
          sync: true,
        },
      ]);
    });

    it("parses a comma-separated list of positions", () => {
      const result = parse("split(2|1, 2|3, 3|2)");

      expect(result[0]).toMatchObject({
        kind: "noteOp",
        name: "split",
        args: [
          { type: "barBeatPoint", musicalBeats: 4 },
          { type: "barBeatPoint", musicalBeats: 6 },
          { type: "barBeatPoint", musicalBeats: 9 },
        ],
      });
    });

    it("folds a decimal beat and a ±n offset into the position", () => {
      const result = parse("split(1|1.5, 2|3+n/8)");

      expect(result[0]).toMatchObject({
        kind: "noteOp",
        name: "split",
        args: [
          { type: "barBeatPoint", musicalBeats: 0.5 },
          { type: "barBeatPoint", musicalBeats: 6.5 },
        ],
      });
    });

    it("uses the meter's beats-per-bar when resolving positions", () => {
      const result = parse("split(2|1)", { beatsPerBar: 3 });

      expect(result[0]).toMatchObject({
        name: "split",
        args: [{ type: "barBeatPoint", musicalBeats: 3 }],
      });
    });

    it("rejects a 0 beat with the 1-indexed steer", () => {
      expect(() => parse("split(2|0)")).toThrow(/beats are 1-indexed/);
    });
  });

  describe("selectors", () => {
    it("applies a pitch range selector", () => {
      const result = parse("C3-C5: ratchet(4)");

      expect(result[0]).toMatchObject({
        kind: "noteOp",
        name: "ratchet",
        args: [4],
        pitchRange: { startPitch: 60, endPitch: 84 },
        timeRange: null,
      });
    });

    it("applies a whole-bar time selector", () => {
      const result = parse("2|*: merge()");

      expect(result[0]).toMatchObject({
        kind: "noteOp",
        name: "merge",
        pitchRange: null,
        timeRange: {
          startBar: 2,
          startBeat: 1,
          endBar: 3,
          endBeat: 1,
          endExclusive: true,
        },
      });
    });

    it("applies an explicit bar|beat range selector", () => {
      const result = parse("1|1-2|1: ratchet(3)");

      expect(result[0]).toMatchObject({
        kind: "noteOp",
        name: "ratchet",
        timeRange: { startBar: 1, startBeat: 1, endBar: 2, endBeat: 1 },
      });
    });
  });

  describe("mixed with assignments", () => {
    it("parses note ops interleaved with assignments in order", () => {
      const result = parse("velocity = 80\nratchet(4)\nmerge()");

      expect(
        result.map((s) => ("kind" in s ? s.kind : s.parameter)),
      ).toStrictEqual(["velocity", "noteOp", "noteOp"]);
    });
  });

  describe("targeted errors", () => {
    it("rejects ratchet() used as a value", () => {
      expect(() => parse("velocity = ratchet(2)")).toThrow(
        /ratchet\(\) is a note-count operation, not a value/,
      );
    });

    it("rejects repeat() used as a value", () => {
      expect(() => parse("velocity = repeat(2, 1bar)")).toThrow(
        /repeat\(\) is a note-count operation, not a value/,
      );
    });

    it("rejects merge() used as a value", () => {
      expect(() => parse("velocity = merge()")).toThrow(
        /merge\(\) is a note-count operation, not a value/,
      );
    });

    it("rejects split() used as a value", () => {
      expect(() => parse("velocity = split(2|1)")).toThrow(
        /split\(\) is a note-count operation, not a value/,
      );
    });

    it("rejects a note op nested inside an expression", () => {
      expect(() => parse("duration = 1 + ratchet(2)")).toThrow(
        /note-count operation/,
      );
    });
  });
});
