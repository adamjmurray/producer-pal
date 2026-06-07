// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { parse } from "#src/notation/transform/parser/transform-parser.ts";

describe("Transform Parser - note-count operations (ratchet/merge)", () => {
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

    it("rejects merge() used as a value", () => {
      expect(() => parse("velocity = merge()")).toThrow(
        /merge\(\) is a note-count operation, not a value/,
      );
    });

    it("rejects a note op nested inside an expression", () => {
      expect(() => parse("duration = 1 + ratchet(2)")).toThrow(
        /note-count operation/,
      );
    });
  });
});
