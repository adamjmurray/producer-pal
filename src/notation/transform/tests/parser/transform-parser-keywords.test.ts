// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { type FunctionNode } from "#src/notation/transform/parser/transform-parser.ts";
import * as parser from "#src/notation/transform/parser/transform-parser.ts";

describe("Transform Parser - Function Keywords", () => {
  describe("sync keyword", () => {
    it("parses cos with frequency and sync", () => {
      const result = parser.parse("velocity += cos(1t, sync)");

      expect(result[0]!.expression).toStrictEqual({
        type: "function",
        name: "cos",
        args: [{ type: "period", bars: 0, beats: 1 }],
        sync: true,
        raw: false,
      });
    });

    it("parses tri with frequency, phase, and sync", () => {
      const result = parser.parse("velocity += tri(2t, 0.5, sync)");

      expect(result[0]!.expression).toStrictEqual({
        type: "function",
        name: "tri",
        args: [{ type: "period", bars: 0, beats: 2 }, 0.5],
        sync: true,
        raw: false,
      });
    });

    it("parses square with all args and sync", () => {
      const result = parser.parse("velocity += square(2t, 0, 0.75, sync)");

      expect(result[0]!.expression).toStrictEqual({
        type: "function",
        name: "square",
        args: [{ type: "period", bars: 0, beats: 2 }, 0, 0.75],
        sync: true,
        raw: false,
      });
    });

    it("parses saw with sync", () => {
      const result = parser.parse("velocity += saw(4:0t, sync)");

      expect(result[0]!.expression).toStrictEqual({
        type: "function",
        name: "saw",
        args: [{ type: "period", bars: 4, beats: 0 }],
        sync: true,
        raw: false,
      });
    });

    it("rejects sync on swing", () => {
      expect(() => parser.parse("timing = swing(0.05, sync)")).toThrow();
    });

    it("rejects sync on rand", () => {
      expect(() => parser.parse("velocity += rand(sync)")).toThrow();
    });

    it("rejects sync on ramp", () => {
      expect(() => parser.parse("velocity += ramp(0, 1, sync)")).toThrow();
    });

    it("rejects sync on round", () => {
      expect(() => parser.parse("velocity += round(sync)")).toThrow();
    });

    it("rejects sync on choose", () => {
      expect(() => parser.parse("velocity += choose(1, 2, sync)")).toThrow();
    });
  });

  describe("raw keyword", () => {
    it.each([
      ["swing(0.05, raw)", [0.05], true],
      [
        "swing(0.03, 1/2t, raw)",
        [0.03, { type: "period", bars: 0, beats: 0.5 }],
        true,
      ],
      ["swing(0.05)", [0.05], false],
      [
        "swing(0.05, 1/2t)",
        [0.05, { type: "period", bars: 0, beats: 0.5 }],
        false,
      ],
    ] as const)("parses %s", (expr, expectedArgs, expectedRaw) => {
      const result = parser.parse(`timing = ${expr}`);
      const node = result[0]!.expression as FunctionNode;

      expect(node.name).toBe("swing");
      expect(node.args).toStrictEqual(expectedArgs);
      expect(node.raw).toBe(expectedRaw);
    });

    it("rejects raw on non-swing functions", () => {
      expect(() => parser.parse("velocity += rand(raw)")).toThrow();
      expect(() => parser.parse("velocity += cos(1t, raw)")).toThrow();
    });
  });
});
