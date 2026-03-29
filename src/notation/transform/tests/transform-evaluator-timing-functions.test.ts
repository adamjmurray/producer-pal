// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { evaluateTransform } from "#src/notation/transform/transform-evaluator.ts";
import {
  createContext,
  expectTransformError,
} from "./evaluator/transform-evaluator-test-helpers.ts";

describe("Transform Evaluator - swing()", () => {
  describe("8th-note swing (default period)", () => {
    it("does not offset on-beat notes (position 0)", () => {
      const ctx = createContext({ position: 0 });
      const result = evaluateTransform("timing = swing(0.05)", ctx);

      expect(result.timing!.value).toBeCloseTo(0, 10);
    });

    it("offsets off-beat notes by amount (position 0.5)", () => {
      const ctx = createContext({ position: 0.5 });
      const result = evaluateTransform("timing = swing(0.05)", ctx);

      expect(result.timing!.value).toBeCloseTo(0.55, 10);
    });

    it("does not offset on-beat notes (position 1.0)", () => {
      const ctx = createContext({ position: 1.0 });
      const result = evaluateTransform("timing = swing(0.05)", ctx);

      expect(result.timing!.value).toBeCloseTo(1.0, 10);
    });

    it("offsets off-beat notes (position 1.5)", () => {
      const ctx = createContext({ position: 1.5 });
      const result = evaluateTransform("timing = swing(0.05)", ctx);

      expect(result.timing!.value).toBeCloseTo(1.55, 10);
    });

    it("does not offset on-beat notes (position 2.0)", () => {
      const ctx = createContext({ position: 2.0 });
      const result = evaluateTransform("timing = swing(0.05)", ctx);

      expect(result.timing!.value).toBeCloseTo(2.0, 10);
    });

    it("handles amount = 0 as no-op", () => {
      const ctx = createContext({ position: 0.5 });
      const result = evaluateTransform("timing = swing(0)", ctx);

      expect(result.timing!.value).toBeCloseTo(0.5, 10);
    });

    it("handles negative amount (early off-beats)", () => {
      const ctx = createContext({ position: 0.5 });
      const result = evaluateTransform("timing = swing(-0.03)", ctx);

      expect(result.timing!.value).toBeCloseTo(0.47, 10);
    });
  });

  describe("16th-note swing (custom period)", () => {
    it("does not offset on-beat of 0.5 period (position 0)", () => {
      const ctx = createContext({ position: 0 });
      const result = evaluateTransform("timing = swing(0.03, 1/2t)", ctx);

      expect(result.timing!.value).toBeCloseTo(0, 10);
    });

    it("offsets off-beat of 0.5 period (position 0.25)", () => {
      const ctx = createContext({ position: 0.25 });
      const result = evaluateTransform("timing = swing(0.03, 1/2t)", ctx);

      expect(result.timing!.value).toBeCloseTo(0.28, 10);
    });

    it("does not offset next on-beat (position 0.5)", () => {
      const ctx = createContext({ position: 0.5 });
      const result = evaluateTransform("timing = swing(0.03, 1/2t)", ctx);

      expect(result.timing!.value).toBeCloseTo(0.5, 10);
    });

    it("offsets next off-beat (position 0.75)", () => {
      const ctx = createContext({ position: 0.75 });
      const result = evaluateTransform("timing = swing(0.03, 1/2t)", ctx);

      expect(result.timing!.value).toBeCloseTo(0.78, 10);
    });
  });

  describe("error handling", () => {
    it("throws for zero arguments", () => {
      expectTransformError("timing = swing()");
    });

    it("throws for three arguments", () => {
      expectTransformError("timing = swing(0.05, 1t, 0.5)");
    });
  });
});

describe("Transform Evaluator - quant()", () => {
  describe("8th-note grid (1/2t)", () => {
    it("snaps position 0.3 to 0.5", () => {
      const ctx = createContext({ position: 0.3 });
      const result = evaluateTransform("timing = quant(1/2t)", ctx);

      expect(result.timing!.value).toBeCloseTo(0.5, 10);
    });

    it("snaps position 0.1 to 0.0", () => {
      const ctx = createContext({ position: 0.1 });
      const result = evaluateTransform("timing = quant(1/2t)", ctx);

      expect(result.timing!.value).toBeCloseTo(0, 10);
    });

    it("leaves on-grid position unchanged", () => {
      const ctx = createContext({ position: 0.5 });
      const result = evaluateTransform("timing = quant(1/2t)", ctx);

      expect(result.timing!.value).toBeCloseTo(0.5, 10);
    });
  });

  describe("16th-note grid (1/4t)", () => {
    it("snaps position 0.3 to 0.25", () => {
      const ctx = createContext({ position: 0.3 });
      const result = evaluateTransform("timing = quant(1/4t)", ctx);

      expect(result.timing!.value).toBeCloseTo(0.25, 10);
    });

    it("snaps position 0.4 to 0.5", () => {
      const ctx = createContext({ position: 0.4 });
      const result = evaluateTransform("timing = quant(1/4t)", ctx);

      expect(result.timing!.value).toBeCloseTo(0.5, 10);
    });
  });

  describe("quarter-note grid (1t)", () => {
    it("snaps position 1.3 to 1.0", () => {
      const ctx = createContext({ position: 1.3 });
      const result = evaluateTransform("timing = quant(1t)", ctx);

      expect(result.timing!.value).toBeCloseTo(1.0, 10);
    });

    it("snaps position 1.7 to 2.0", () => {
      const ctx = createContext({ position: 1.7 });
      const result = evaluateTransform("timing = quant(1t)", ctx);

      expect(result.timing!.value).toBeCloseTo(2.0, 10);
    });
  });

  describe("numeric grid (no period syntax)", () => {
    it("quant(0.5) works same as quant(1/2t)", () => {
      const ctx = createContext({ position: 0.3 });
      const result = evaluateTransform("timing = quant(0.5)", ctx);

      expect(result.timing!.value).toBeCloseTo(0.5, 10);
    });
  });

  describe("position 0", () => {
    it("stays at 0 for any grid", () => {
      const ctx = createContext({ position: 0 });
      const result = evaluateTransform("timing = quant(1/4t)", ctx);

      expect(result.timing!.value).toBeCloseTo(0, 10);
    });
  });

  describe("error handling", () => {
    it("throws for zero arguments", () => {
      expectTransformError("timing = quant()");
    });

    it("throws for two arguments", () => {
      expectTransformError("timing = quant(1/2t, 1/4t)");
    });

    it("throws for grid <= 0", () => {
      expectTransformError("timing = quant(-1)");
    });
  });
});
