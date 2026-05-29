// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { barBeatDurationToMusicalBeats } from "../barbeat-time.ts";

describe("barBeatDurationToMusicalBeats", () => {
  describe("beat-only format (NEW)", () => {
    it("parses decimal beat durations", () => {
      expect(barBeatDurationToMusicalBeats("2.5", 4)).toBe(2.5);
      expect(barBeatDurationToMusicalBeats("1.0", 4)).toBe(1.0);
      expect(barBeatDurationToMusicalBeats("0.25", 4)).toBe(0.25);
      expect(barBeatDurationToMusicalBeats("3.75", 4)).toBe(3.75);
    });

    it("parses fractional beat durations", () => {
      expect(barBeatDurationToMusicalBeats("5/2", 4)).toBe(2.5);
      expect(barBeatDurationToMusicalBeats("3/4", 4)).toBe(0.75);
      expect(barBeatDurationToMusicalBeats("1/3", 4)).toBeCloseTo(1 / 3, 10);
      expect(barBeatDurationToMusicalBeats("4/3", 4)).toBeCloseTo(4 / 3, 10);
    });

    it("parses beat durations with + operator (integer + fraction)", () => {
      expect(barBeatDurationToMusicalBeats("2+3/4", 4)).toBe(2.75);
      expect(barBeatDurationToMusicalBeats("1+1/2", 4)).toBe(1.5);
      expect(barBeatDurationToMusicalBeats("3+1/3", 4)).toBeCloseTo(10 / 3, 10);
      expect(barBeatDurationToMusicalBeats("0+3/4", 4)).toBe(0.75);
    });

    it("handles zero duration", () => {
      expect(barBeatDurationToMusicalBeats("0", 4)).toBe(0);
      expect(barBeatDurationToMusicalBeats("0.0", 4)).toBe(0);
    });

    it("throws error for negative durations", () => {
      expect(() => barBeatDurationToMusicalBeats("-1", 4)).toThrow(
        "Beats in duration must be 0 or greater, got: -1",
      );
      expect(() => barBeatDurationToMusicalBeats("-2.5", 4)).toThrow(
        "Beats in duration must be 0 or greater",
      );
    });

    it("throws error for division by zero", () => {
      expect(() => barBeatDurationToMusicalBeats("5/0", 4)).toThrow(
        "Invalid duration format: division by zero",
      );
    });

    it("throws error for invalid formats", () => {
      expect(() => barBeatDurationToMusicalBeats("abc", 4)).toThrow(
        "Invalid duration format",
      );
      expect(() => barBeatDurationToMusicalBeats("", 4)).toThrow(
        "Invalid duration format",
      );
      expect(() => barBeatDurationToMusicalBeats("/3", 4)).toThrow(
        "Invalid duration format",
      );
      expect(() => barBeatDurationToMusicalBeats("5/", 4)).toThrow(
        "Invalid duration format",
      );
    });
  });

  describe("bar:beat format (existing)", () => {
    it("parses bar:beat durations in 4/4 time", () => {
      expect(barBeatDurationToMusicalBeats("0:0", 4)).toBe(0);
      expect(barBeatDurationToMusicalBeats("0:1", 4)).toBe(1);
      expect(barBeatDurationToMusicalBeats("1:0", 4)).toBe(4);
      expect(barBeatDurationToMusicalBeats("2:1.5", 4)).toBe(9.5);
    });

    it("parses bar:beat durations in 3/4 time", () => {
      expect(barBeatDurationToMusicalBeats("0:0", 3)).toBe(0);
      expect(barBeatDurationToMusicalBeats("0:1", 3)).toBe(1);
      expect(barBeatDurationToMusicalBeats("1:0", 3)).toBe(3);
      expect(barBeatDurationToMusicalBeats("2:1.5", 3)).toBe(7.5);
    });

    it("handles fractional beats in bar:beat format", () => {
      expect(barBeatDurationToMusicalBeats("0:1/3", 4)).toBeCloseTo(1 / 3, 10);
      expect(barBeatDurationToMusicalBeats("1:3/4", 4)).toBeCloseTo(4.75, 10);
      expect(barBeatDurationToMusicalBeats("2:5/3", 4)).toBeCloseTo(
        8 + 5 / 3,
        10,
      );
    });

    it("handles bar:beat durations with + operator", () => {
      expect(barBeatDurationToMusicalBeats("1:2+1/3", 4)).toBeCloseTo(
        4 + 2 + 1 / 3,
        10,
      );
      expect(barBeatDurationToMusicalBeats("0:3+3/4", 4)).toBe(3.75);
      expect(barBeatDurationToMusicalBeats("2:1+1/2", 3)).toBe(7.5);
    });

    it("throws error for negative values", () => {
      expect(() => barBeatDurationToMusicalBeats("-1:0", 4)).toThrow(
        "Bars in duration must be 0 or greater, got: -1",
      );
      expect(() => barBeatDurationToMusicalBeats("0:-1", 4)).toThrow(
        "Beats in duration must be 0 or greater, got: -1",
      );
    });

    it("throws error for invalid bar:beat format", () => {
      expect(() => barBeatDurationToMusicalBeats("1:", 4)).toThrow(
        "Invalid bar:beat duration format",
      );
      expect(() => barBeatDurationToMusicalBeats(":2", 4)).toThrow(
        "Invalid bar:beat duration format",
      );
    });

    it("throws error when time signature numerator is undefined", () => {
      expect(() =>
        barBeatDurationToMusicalBeats("1:0", undefined as unknown as number),
      ).toThrow("Time signature numerator required for bar:beat duration");
    });
  });
});
