// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { evaluateModulation } from "#src/notation/modulation/modulation-evaluator.ts";

describe("Modulation Evaluator", () => {
  describe("pitch filtering", () => {
    it("applies modulation to matching pitch", () => {
      const result = evaluateModulation("C3 velocity += 10", {
        position: 0,
        pitch: 60,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBe(10);
    });

    it("skips modulation for non-matching pitch", () => {
      const result = evaluateModulation("C3 velocity += 10", {
        position: 0,
        pitch: 61,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result).toStrictEqual({});
    });

    it("applies modulation when no pitch specified", () => {
      const result = evaluateModulation("velocity += 10", {
        position: 0,
        pitch: 60,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBe(10);
    });

    it("persists pitch across multiple lines", () => {
      const result = evaluateModulation("C3 velocity += 10\ntiming += 0.05", {
        position: 0,
        pitch: 60,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBe(10);
      expect(result.timing!.value).toBe(0.05);
    });

    it("resets pitch when specified again", () => {
      const modString = `C3 velocity += 10
C#3 velocity += 20`;
      const result1 = evaluateModulation(modString, {
        position: 0,
        pitch: 60,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result1.velocity!.value).toBe(10);

      const result2 = evaluateModulation(modString, {
        position: 0,
        pitch: 61,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result2.velocity!.value).toBe(20);
    });

    it("applies modulation to pitch within range", () => {
      const result = evaluateModulation("C3-C5 velocity += 10", {
        position: 0,
        pitch: 72, // C4 is within C3-C5
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBe(10);
    });

    it("applies modulation to pitch at range start", () => {
      const result = evaluateModulation("C3-C5 velocity += 10", {
        position: 0,
        pitch: 60, // C3 is at start
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBe(10);
    });

    it("applies modulation to pitch at range end", () => {
      const result = evaluateModulation("C3-C5 velocity += 10", {
        position: 0,
        pitch: 84, // C5 is at end
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBe(10);
    });

    it("skips modulation for pitch below range", () => {
      const result = evaluateModulation("C3-C5 velocity += 10", {
        position: 0,
        pitch: 59, // B2 is below C3
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result).toStrictEqual({});
    });

    it("skips modulation for pitch above range", () => {
      const result = evaluateModulation("C3-C5 velocity += 10", {
        position: 0,
        pitch: 85, // C#5 is above C5
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result).toStrictEqual({});
    });

    it("persists pitch range across multiple lines", () => {
      const result = evaluateModulation(
        "C3-C5 velocity += 10\ntiming += 0.05",
        {
          position: 0,
          pitch: 72, // C4 within range
          timeSig: { numerator: 4, denominator: 4 },
        },
      );

      expect(result.velocity!.value).toBe(10);
      expect(result.timing!.value).toBe(0.05);
    });

    it("updates pitch range when specified again", () => {
      const modString = `C3-C5 velocity += 10
G4-G5 velocity += 20`;

      const result1 = evaluateModulation(modString, {
        position: 0,
        pitch: 72, // C4 in first range
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result1.velocity!.value).toBe(10);

      const result2 = evaluateModulation(modString, {
        position: 0,
        pitch: 91, // G5 in second range
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result2.velocity!.value).toBe(20);

      const result3 = evaluateModulation(modString, {
        position: 0,
        pitch: 76, // E4 in first range but not second
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result3.velocity!.value).toBe(10);
    });
  });

  describe("time range filtering", () => {
    it("applies modulation within time range", () => {
      const result = evaluateModulation("1|1-2|1 velocity += 10", {
        position: 0,
        bar: 1,
        beat: 2,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBe(10);
    });

    it("skips modulation outside time range (before)", () => {
      const result = evaluateModulation("2|1-3|1 velocity += 10", {
        position: 0,
        bar: 1,
        beat: 4,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result).toStrictEqual({});
    });

    it("skips modulation outside time range (after)", () => {
      const result = evaluateModulation("1|1-2|1 velocity += 10", {
        position: 0,
        bar: 3,
        beat: 1,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result).toStrictEqual({});
    });

    it("applies at range boundaries", () => {
      const modString = "1|1-2|4 velocity += 10";

      const atStart = evaluateModulation(modString, {
        position: 0,
        bar: 1,
        beat: 1,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(atStart.velocity!.value).toBe(10);

      const atEnd = evaluateModulation(modString, {
        position: 0,
        bar: 2,
        beat: 4,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(atEnd.velocity!.value).toBe(10);
    });
  });

  describe("combined pitch and time filtering", () => {
    it("applies when both pitch and time match", () => {
      const result = evaluateModulation("C3 1|1-2|1 velocity += 10", {
        position: 0,
        pitch: 60,
        bar: 1,
        beat: 2,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBe(10);
    });

    it("skips when pitch matches but time doesn't", () => {
      const result = evaluateModulation("C3 1|1-2|1 velocity += 10", {
        position: 0,
        pitch: 60,
        bar: 3,
        beat: 1,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result).toStrictEqual({});
    });

    it("skips when time matches but pitch doesn't", () => {
      const result = evaluateModulation("C3 1|1-2|1 velocity += 10", {
        position: 0,
        pitch: 61,
        bar: 1,
        beat: 2,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result).toStrictEqual({});
    });
  });

  describe("operators", () => {
    it("returns add operator for += syntax", () => {
      const result = evaluateModulation("velocity += 10", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.operator).toBe("add");
    });

    it("returns set operator for = syntax", () => {
      const result = evaluateModulation("velocity = 64", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.operator).toBe("set");
    });
  });

  describe("note property variables", () => {
    const noteProps = {
      pitch: 60,
      start: 2.5,
      velocity: 100,
      velocityDeviation: 10,
      duration: 0.5,
      probability: 0.8,
    };

    it("evaluates note.pitch variable", () => {
      const result = evaluateModulation(
        "velocity += note.pitch",
        {
          position: 0,
          timeSig: { numerator: 4, denominator: 4 },
        },
        noteProps,
      );

      expect(result.velocity!.value).toBe(60);
    });

    it("evaluates note.start variable", () => {
      const result = evaluateModulation(
        "velocity += note.start * 10",
        {
          position: 0,
          timeSig: { numerator: 4, denominator: 4 },
        },
        noteProps,
      );

      expect(result.velocity!.value).toBe(25);
    });

    it("evaluates note.velocity variable", () => {
      const result = evaluateModulation(
        "duration += note.velocity / 100",
        {
          position: 0,
          timeSig: { numerator: 4, denominator: 4 },
        },
        noteProps,
      );

      expect(result.duration!.value).toBe(1);
    });

    it("evaluates note.velocityDeviation variable", () => {
      const result = evaluateModulation(
        "velocity += note.velocityDeviation",
        {
          position: 0,
          timeSig: { numerator: 4, denominator: 4 },
        },
        noteProps,
      );

      expect(result.velocity!.value).toBe(10);
    });

    it("evaluates note.duration variable", () => {
      const result = evaluateModulation(
        "probability += note.duration",
        {
          position: 0,
          timeSig: { numerator: 4, denominator: 4 },
        },
        noteProps,
      );

      expect(result.probability!.value).toBe(0.5);
    });

    it("evaluates note.probability variable", () => {
      const result = evaluateModulation(
        "velocity += note.probability * 20",
        {
          position: 0,
          timeSig: { numerator: 4, denominator: 4 },
        },
        noteProps,
      );

      expect(result.velocity!.value).toBe(16);
    });

    it("allows self-reference: velocity based on note.velocity", () => {
      const result = evaluateModulation(
        "velocity = note.velocity / 2",
        {
          position: 0,
          timeSig: { numerator: 4, denominator: 4 },
        },
        noteProps,
      );

      expect(result.velocity!.value).toBe(50);
    });

    it("combines variables in arithmetic expressions", () => {
      const result = evaluateModulation(
        "velocity += note.pitch + note.velocityDeviation",
        {
          position: 0,
          timeSig: { numerator: 4, denominator: 4 },
        },
        noteProps,
      );

      expect(result.velocity!.value).toBe(70);
    });

    it("uses variables with functions", () => {
      const result = evaluateModulation(
        "velocity += note.velocity * cos(1t)",
        {
          position: 0,
          timeSig: { numerator: 4, denominator: 4 },
        },
        noteProps,
      );

      expect(result.velocity!.value).toBeCloseTo(100, 5);
    });

    it("uses variables in complex expressions", () => {
      const result = evaluateModulation(
        "velocity = (note.pitch / 127) * 100",
        {
          position: 0,
          timeSig: { numerator: 4, denominator: 4 },
        },
        noteProps,
      );

      expect(result.velocity!.value).toBeCloseTo(47.24, 2);
    });

    it("uses multiple variables in same expression", () => {
      const result = evaluateModulation(
        "duration = note.duration * note.probability",
        {
          position: 0,
          timeSig: { numerator: 4, denominator: 4 },
        },
        noteProps,
      );

      expect(result.duration!.value).toBe(0.4);
    });

    it("uses variables in parenthesized expressions", () => {
      const result = evaluateModulation(
        "velocity = (note.pitch + note.velocityDeviation) * 2",
        {
          position: 0,
          timeSig: { numerator: 4, denominator: 4 },
        },
        noteProps,
      );

      expect(result.velocity!.value).toBe(140);
    });

    it("uses variables with pitch filtering", () => {
      const result = evaluateModulation(
        "C3 velocity = note.velocity / 2",
        {
          position: 0,
          pitch: 60,
          timeSig: { numerator: 4, denominator: 4 },
        },
        noteProps,
      );

      expect(result.velocity!.value).toBe(50);
    });

    it("uses variables with time range filtering", () => {
      const result = evaluateModulation(
        "1|1-2|1 velocity = note.pitch",
        {
          position: 0,
          bar: 1,
          beat: 2,
          timeSig: { numerator: 4, denominator: 4 },
        },
        noteProps,
      );

      expect(result.velocity!.value).toBe(60);
    });

    it("throws error for undefined variable", () => {
      const result = evaluateModulation(
        "velocity += note.invalid",
        {
          position: 0,
          timeSig: { numerator: 4, denominator: 4 },
        },
        {},
      );

      // Should skip the parameter due to error
      expect(result).toStrictEqual({});
    });

    it("handles variables in ramp function arguments", () => {
      const result = evaluateModulation(
        "velocity = ramp(0, note.velocity)",
        {
          position: 2,
          timeSig: { numerator: 4, denominator: 4 },
          clipTimeRange: { start: 0, end: 4 },
        },
        noteProps,
      );

      expect(result.velocity!.value).toBe(50); // ramp at 0.5 phase
    });

    it("handles variables in waveform phase offset", () => {
      const result = evaluateModulation(
        "velocity += cos(1t, note.probability)",
        {
          position: 0,
          timeSig: { numerator: 4, denominator: 4 },
        },
        noteProps,
      );

      // cos(phase 0 + offset 0.8)
      expect(result.velocity!.value).toBeCloseTo(
        Math.cos(2 * Math.PI * 0.8),
        5,
      );
    });

    it("uses variable as waveform period", () => {
      const result = evaluateModulation(
        "velocity += cos(note.duration)",
        {
          position: 0.25, // quarter way through period
          timeSig: { numerator: 4, denominator: 4 },
        },
        noteProps,
      );

      // noteProps.duration = 0.5, so position 0.25 / period 0.5 = phase 0.5
      // cos(0.5) = -1
      expect(result.velocity!.value).toBeCloseTo(-1.0, 5);
    });

    it("uses expression as waveform period", () => {
      const result = evaluateModulation(
        "velocity += cos(note.duration * 2)",
        {
          position: 0.5, // halfway through period
          timeSig: { numerator: 4, denominator: 4 },
        },
        noteProps,
      );

      // noteProps.duration * 2 = 0.5 * 2 = 1.0
      // position 0.5 / period 1.0 = phase 0.5 → cos(0.5) = -1
      expect(result.velocity!.value).toBeCloseTo(-1.0, 5);
    });

    it("throws error when variable period is <= 0", () => {
      const result = evaluateModulation(
        "velocity += cos(note.duration - 0.5)",
        {
          position: 0,
          timeSig: { numerator: 4, denominator: 4 },
        },
        noteProps,
      );

      // noteProps.duration - 0.5 = 0.5 - 0.5 = 0, should error
      expect(result).toStrictEqual({});
    });
  });
});
