// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { createNote } from "#src/test/test-data-builders.ts";
import { interpretNotation } from "#src/notation/barbeat/interpreter/barbeat-interpreter.ts";
import * as console from "#src/shared/v8-max-console.ts";

describe("bar|beat interpretNotation() - pitch streams (pattern brackets)", () => {
  describe("melodic stepping (@step grid)", () => {
    it("distributes a pitch stream across @step positions", () => {
      const result = interpretNotation("[C3 E3 G3] 1|1x3@n/4");

      expect(result).toStrictEqual([
        createNote({ pitch: 60, start_time: 0 }),
        createNote({ pitch: 64, start_time: 1 }),
        createNote({ pitch: 67, start_time: 2 }),
      ]);
    });

    it("cycles the stream when the count exceeds its length", () => {
      const result = interpretNotation("[C3 E3] 1|1x4@n/4");

      expect(result.map((n) => [n.pitch, n.start_time])).toStrictEqual([
        [60, 0],
        [64, 1],
        [60, 2],
        [64, 3],
      ]);
    });

    it("ends mid-cycle silently when the count is shorter than the stream", () => {
      // Only one position: just the first stream value emits, the rest are silent.
      const result = interpretNotation("[C3 E3 G3] 1|1");

      expect(result.map((n) => n.pitch)).toStrictEqual([60]);
    });

    it("treats a single-value stream like a bare pitch", () => {
      expect(interpretNotation("[C3] 1|1x2@n/4")).toStrictEqual([
        createNote({ pitch: 60, start_time: 0 }),
        createNote({ pitch: 60, start_time: 1 }),
      ]);
    });
  });

  describe("cross-event cursor (carries across separate positions)", () => {
    it("steps the stream across separate time positions", () => {
      const result = interpretNotation("[C3 E3 G3] 1|1 1|2 1|3");

      expect(result.map((n) => [n.pitch, n.start_time])).toStrictEqual([
        [60, 0],
        [64, 1],
        [67, 2],
      ]);
    });

    it("wraps the cursor across separate positions", () => {
      const result = interpretNotation("[C3 E3] 1|1 1|2 1|3");

      expect(result.map((n) => [n.pitch, n.start_time])).toStrictEqual([
        [60, 0],
        [64, 1],
        [60, 2],
      ]);
    });

    it("treats a comma beat list as separate stepping positions", () => {
      // `1|1,2,3` flattens to three time positions — the cursor steps across
      // them exactly like three separate tokens.
      const result = interpretNotation("[C3 E3 G3] 1|1,2,3");

      expect(result.map((n) => [n.pitch, n.start_time])).toStrictEqual([
        [60, 0],
        [64, 1],
        [67, 2],
      ]);
    });

    it("carries the cursor from an x-expansion into a following position", () => {
      const result = interpretNotation("[C3 E3] 1|1x2@n/4 1|3");

      expect(result.map((n) => [n.pitch, n.start_time])).toStrictEqual([
        [60, 0],
        [64, 1],
        [60, 2],
      ]);
    });

    it("advances the cursor once per chord, not per pitch", () => {
      const result = interpretNotation("[(C3 E3) (D3 F3)] 1|1 1|2");

      expect(result.map((n) => [n.pitch, n.start_time])).toStrictEqual([
        [60, 0],
        [64, 0],
        [62, 1],
        [65, 1],
      ]);
    });

    it("rewinds the cursor when a bare pitch reassigns the parameter", () => {
      // F3 replaces the stream with a length-1 (constant) stream and resets the
      // cursor, so it broadcasts at every following position.
      const result = interpretNotation("[C3 E3] 1|1 1|2 F3 1|3 1|4");

      expect(result.map((n) => [n.pitch, n.start_time])).toStrictEqual([
        [60, 0],
        [64, 1],
        [65, 2],
        [65, 3],
      ]);
    });

    it("rewinds the cursor when a new bracket reassigns the parameter", () => {
      const result = interpretNotation("[C3 E3 G3] 1|1 [A3 B3] 1|2 1|3");

      expect(result.map((n) => [n.pitch, n.start_time])).toStrictEqual([
        [60, 0],
        [69, 1],
        [71, 2],
      ]);
    });

    it("keeps a bare chord broadcasting across positions (length-1 stream)", () => {
      // Regression: no bracket ⇒ the chord repeats at every position unchanged.
      const result = interpretNotation("C3 1|1 1|2");

      expect(result.map((n) => [n.pitch, n.start_time])).toStrictEqual([
        [60, 0],
        [60, 1],
      ]);
    });
  });

  describe("chords within a stream", () => {
    it("emits each parenthesized chord simultaneously at its step", () => {
      const result = interpretNotation("[(C3 E3) (D3 F3)] 1|1x2@n/4");

      expect(result.map((n) => [n.pitch, n.start_time])).toStrictEqual([
        [60, 0],
        [64, 0],
        [62, 1],
        [65, 1],
      ]);
    });

    it("mixes bare pitches and chords as stream values", () => {
      const result = interpretNotation("[C3 (E3 G3)] 1|1x2@n/4");

      expect(result.map((n) => [n.pitch, n.start_time])).toStrictEqual([
        [60, 0],
        [64, 1],
        [67, 1],
      ]);
    });
  });

  describe("replacement (stream supersedes prior pitch state)", () => {
    it("replaces a preceding bare pitch with the stream", () => {
      // C3 sets the pitch to a length-1 chord; the bracket then replaces it, so
      // only the stream emits (C3 is dropped) — the spec's "later assignment
      // replaces the parameter's stream" rule.
      const result = interpretNotation("C3 [E3 G3] 1|1");

      expect(result.map((n) => [n.pitch, n.start_time])).toStrictEqual([
        [64, 0],
      ]);
    });
  });

  describe("legato run (no @step → advance by current duration)", () => {
    it("advances by the current duration when @step is omitted", () => {
      const result = interpretNotation("n/8 [C3 E3 G3] 1|1x3");

      expect(result.map((n) => n.start_time)).toStrictEqual([0, 0.5, 1]);
      expect(result.every((n) => n.duration === 0.5)).toBe(true);
    });
  });

  describe("state capture", () => {
    it("applies the current velocity/duration/probability to every stream value", () => {
      const result = interpretNotation("v80 n/8 p0.5 [C3 E3] 1|1x2@n/4");

      expect(result).toStrictEqual([
        createNote({
          pitch: 60,
          start_time: 0,
          duration: 0.5,
          velocity: 80,
          probability: 0.5,
        }),
        createNote({
          pitch: 64,
          start_time: 1,
          duration: 0.5,
          velocity: 80,
          probability: 0.5,
        }),
      ]);
    });

    it("captures a velocity range as min + deviation for every value", () => {
      const result = interpretNotation("v40-80 [C3 E3] 1|1x2@n/4");

      expect(
        result.map((n) => [n.velocity, n.velocity_deviation]),
      ).toStrictEqual([
        [40, 40],
        [40, 40],
      ]);
    });

    it("drops out-of-range pitches per chord, keeping the rest", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const result = interpretNotation("[(C3 C9) E3] 1|1x2@n/4");

      // C9 (132) is out of range and dropped; C3 still emits at step 0.
      expect(result.map((n) => [n.pitch, n.start_time])).toStrictEqual([
        [60, 0],
        [64, 1],
      ]);
      warn.mockRestore();
    });
  });

  describe("meter safety", () => {
    it("steps by felt beats in 6/8 (dotted-quarter @step)", () => {
      const result = interpretNotation("[C3 E3] 1|1x2@n3/8", {
        timeSigNumerator: 6,
        timeSigDenominator: 8,
      });

      expect(result.map((n) => [n.pitch, n.start_time])).toStrictEqual([
        [60, 0],
        [64, 1.5],
      ]);
    });

    it("wraps stream positions across bar lines in 5/4", () => {
      const result = interpretNotation("[C3 E3 G3 C4 D4 E4] 1|1x6@n/4", {
        timeSigNumerator: 5,
        timeSigDenominator: 4,
      });

      // Six quarter-note steps from 1|1: the sixth lands in bar 2 (5/4 bar).
      expect(result.map((n) => n.start_time)).toStrictEqual([0, 1, 2, 3, 4, 5]);
    });

    it("steps by felt beats across a 12/8 bar", () => {
      const result = interpretNotation("[C3 E3 G3 C4] 1|1x4@n3/8", {
        timeSigNumerator: 12,
        timeSigDenominator: 8,
      });

      // Four dotted-quarter felt beats fill one 12/8 bar (6 quarters).
      expect(result.map((n) => n.start_time)).toStrictEqual([0, 1.5, 3, 4.5]);
    });
  });

  describe("dangling / unemitted stream warnings", () => {
    it("warns when a pitch stream is buffered but never emitted", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      interpretNotation("[C3 E3 G3]");

      expect(warn).toHaveBeenCalledWith(
        "3 pitch(es) buffered but no time position to emit them",
      );
      warn.mockRestore();
    });

    it("warns when @clear discards a buffered pitch stream", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      interpretNotation("[C3 E3] @clear");

      expect(warn).toHaveBeenCalledWith(
        "2 pitch(es) buffered but not emitted before @clear",
      );
      warn.mockRestore();
    });
  });
});
