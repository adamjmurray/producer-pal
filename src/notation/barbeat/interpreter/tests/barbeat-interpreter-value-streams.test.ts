// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { interpretNotation } from "#src/notation/barbeat/interpreter/barbeat-interpreter.ts";

describe("bar|beat interpretNotation() - value streams (v/n/p pattern brackets)", () => {
  describe("velocity streams", () => {
    it("cycles velocity across a repeat while the pitch stays constant", () => {
      const result = interpretNotation("[v80 v100] C3 1|1x4@n/4");

      expect(result.map((n) => [n.start_time, n.velocity])).toStrictEqual([
        [0, 80],
        [1, 100],
        [2, 80],
        [3, 100],
      ]);
      expect(result.every((n) => n.pitch === 60)).toBe(true);
    });

    it("captures a velocity range stream value as velocity + deviation", () => {
      const result = interpretNotation("[v40-80 v100] C3 1|1x2@n/4");

      expect(
        result.map((n) => [n.velocity, n.velocity_deviation]),
      ).toStrictEqual([
        [40, 40],
        [100, 0],
      ]);
    });

    it("applies one streamed velocity to the whole chord per emission", () => {
      const result = interpretNotation("[v80 v100] C3 E3 1|1x2@n/4");

      expect(
        result.map((n) => [n.pitch, n.start_time, n.velocity]),
      ).toStrictEqual([
        [60, 0, 80],
        [64, 0, 80],
        [60, 1, 100],
        [64, 1, 100],
      ]);
    });

    it("ends a partial cycle silently", () => {
      const result = interpretNotation("[v80 v100 v60] C3 1|1x2@n/4");

      expect(result.map((n) => n.velocity)).toStrictEqual([80, 100]);
    });

    it("preserves legacy per-pitch capture when no velocity stream is active", () => {
      const result = interpretNotation("v80 C3 v100 E3 1|1");

      expect(result.map((n) => [n.pitch, n.velocity])).toStrictEqual([
        [60, 80],
        [64, 100],
      ]);
    });
  });

  describe("duration streams", () => {
    it("cycles note length without changing position spacing", () => {
      // @step = n/4 keeps positions a quarter apart; the duration stream only
      // varies each note's LENGTH (the duration-fold is a later phase).
      const result = interpretNotation("[n/4 n/8] C3 1|1x4@n/4");

      expect(result.map((n) => [n.start_time, n.duration])).toStrictEqual([
        [0, 1],
        [1, 0.5],
        [2, 1],
        [3, 0.5],
      ]);
    });
  });

  describe("probability streams", () => {
    it("cycles probability across a repeat", () => {
      const result = interpretNotation("[p1 p0.5] C3 1|1x4@n/4");

      expect(result.map((n) => n.probability)).toStrictEqual([1, 0.5, 1, 0.5]);
    });
  });

  describe("zip (multiple sibling streams)", () => {
    it("cycles coprime velocity and pitch streams against a shared index", () => {
      const result = interpretNotation("[v80 v100] [C3 E3 G3] 1|1x6@n/8");

      expect(
        result.map((n) => [n.pitch, n.start_time, n.velocity]),
      ).toStrictEqual([
        [60, 0, 80],
        [64, 0.5, 100],
        [67, 1, 80],
        [60, 1.5, 100],
        [64, 2, 80],
        [67, 2.5, 100],
      ]);
    });

    it("zips three streams of different lengths (vel, dur, pitch)", () => {
      const result = interpretNotation(
        "[v80 v100] [n/4 n/8] [C3 E3 G3] 1|1x6@n/4",
      );

      expect(
        result.map((n) => [n.pitch, n.start_time, n.velocity, n.duration]),
      ).toStrictEqual([
        [60, 0, 80, 1],
        [64, 1, 100, 0.5],
        [67, 2, 80, 1],
        [60, 3, 100, 0.5],
        [64, 4, 80, 1],
        [67, 5, 100, 0.5],
      ]);
    });
  });

  describe("cross-event cursor (value streams persist across positions)", () => {
    it("cycles a velocity stream across separate note events", () => {
      const result = interpretNotation("[v80 v100] C3 1|1 D3 1|2 E3 1|3");

      expect(
        result.map((n) => [n.pitch, n.start_time, n.velocity]),
      ).toStrictEqual([
        [60, 0, 80],
        [62, 1, 100],
        [64, 2, 80],
      ]);
    });

    it("lets a later scalar replace an active value stream", () => {
      const result = interpretNotation("[v80 v100] C3 1|1 v60 D3 1|2");

      expect(result.map((n) => [n.pitch, n.velocity])).toStrictEqual([
        [60, 80],
        [62, 60],
      ]);
    });

    it("lets a second bracket replace the first for the same parameter (last wins)", () => {
      // A redundant value stream is last-wins (consistent with pitch), not a
      // hard error that would abort the whole clip's notation.
      const result = interpretNotation("[v80 v100] [v60 v70] C3 1|1x2@n/4");

      expect(result.map((n) => n.velocity)).toStrictEqual([60, 70]);
    });
  });

  describe("state capture interaction", () => {
    it("does not warn when a value stream follows a pitch stream", () => {
      // The velocity stream takes effect at emission (override), so setting it
      // after the pitch group must not trip the stale "won't affect" warning.
      const result = interpretNotation("[C3 E3] [v80 v100] 1|1x2@n/4");

      expect(result.map((n) => [n.pitch, n.velocity])).toStrictEqual([
        [60, 80],
        [64, 100],
      ]);
    });
  });
});
