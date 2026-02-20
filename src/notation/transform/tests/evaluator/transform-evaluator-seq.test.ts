// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import * as parser from "#src/notation/transform/parser/transform-parser.ts";
import { evaluateTransform } from "#src/notation/transform/transform-evaluator.ts";

describe("Transform - seq function", () => {
  describe("parser", () => {
    it("parses seq with multiple arguments", () => {
      const result = parser.parse("velocity = seq(60, 80, 100)");

      expect(result[0]!.expression).toStrictEqual({
        type: "function",
        name: "seq",
        args: [60, 80, 100],
        sync: false,
      });
    });

    it("rejects sync on seq", () => {
      expect(() => parser.parse("velocity += seq(1, 2, sync)")).toThrow();
    });
  });

  describe("evaluator", () => {
    it("evaluates seq with single value", () => {
      const result = evaluateTransform("velocity = seq(42)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBe(42);
    });

    it("cycles through values based on note.index", () => {
      const expected = [60, 80, 100, 60, 80];

      for (let i = 0; i < expected.length; i++) {
        const result = evaluateTransform(
          "velocity = seq(60, 80, 100)",
          {
            position: i,
            timeSig: { numerator: 4, denominator: 4 },
          },
          { index: i, count: 5 },
        );

        expect(result.velocity!.value).toBe(expected[i]);
      }
    });

    it("wraps around with modulo", () => {
      const result = evaluateTransform(
        "velocity = seq(10, 20)",
        {
          position: 0,
          timeSig: { numerator: 4, denominator: 4 },
        },
        { index: 4, count: 5 },
      );

      expect(result.velocity!.value).toBe(10); // 4 % 2 = 0
    });

    it("supports nested seq", () => {
      // seq(seq(1,2), seq(3,4)) with index 0: outer[0] → seq(1,2)[0] → 1
      const result0 = evaluateTransform(
        "velocity = seq(seq(1, 2), seq(3, 4))",
        { position: 0, timeSig: { numerator: 4, denominator: 4 } },
        { index: 0, count: 4 },
      );

      expect(result0.velocity!.value).toBe(1);

      // index 1: outer[1] → seq(3,4)[1] → 4
      const result1 = evaluateTransform(
        "velocity = seq(seq(1, 2), seq(3, 4))",
        { position: 0, timeSig: { numerator: 4, denominator: 4 } },
        { index: 1, count: 4 },
      );

      expect(result1.velocity!.value).toBe(4);
    });

    it("selects correct argument per index", () => {
      const result = evaluateTransform(
        "velocity = seq(42, 99)",
        { position: 0, timeSig: { numerator: 4, denominator: 4 } },
        { index: 0, count: 2 },
      );

      expect(result.velocity!.value).toBe(42);

      const result2 = evaluateTransform(
        "velocity = seq(42, 99)",
        { position: 0, timeSig: { numerator: 4, denominator: 4 } },
        { index: 1, count: 2 },
      );

      expect(result2.velocity!.value).toBe(99);
    });

    it("defaults to index 0 when no note properties", () => {
      const result = evaluateTransform("velocity = seq(60, 80, 100)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBe(60);
    });

    it("uses clip.index when note.index is not available", () => {
      const result = evaluateTransform(
        "velocity = seq(10, 20, 30)",
        { position: 0, timeSig: { numerator: 4, denominator: 4 } },
        { "clip:index": 2, "clip:count": 3 },
      );

      expect(result.velocity!.value).toBe(30);
    });
  });
});
