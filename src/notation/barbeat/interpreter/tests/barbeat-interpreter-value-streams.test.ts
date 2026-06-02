// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { interpretNotation } from "#src/notation/barbeat/interpreter/barbeat-interpreter.ts";
import * as console from "#src/shared/v8-max-console.ts";

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
    it("cycles note length without changing position spacing under @step", () => {
      // @step = n/4 pins positions a quarter apart; the duration stream only
      // varies each note's LENGTH (the duration-fold below applies only when
      // @step is omitted).
      const result = interpretNotation("[n/4 n/8] C3 1|1x4@n/4");

      expect(result.map((n) => [n.start_time, n.duration])).toStrictEqual([
        [0, 1],
        [1, 0.5],
        [2, 1],
        [3, 0.5],
      ]);
    });

    it("resolves a bar-length stream value into beats (under @step)", () => {
      // `1bar` in a duration stream resolves through the bar component
      // (bars * beatsPerBar); with @step pinning the spacing, the stream only
      // varies LENGTH: a whole-bar note (4 beats in 4/4) then a quarter.
      const result = interpretNotation("[1bar n/4] C3 1|1x2@n/4");

      expect(result.map((n) => [n.start_time, n.duration])).toStrictEqual([
        [0, 4],
        [1, 1],
      ]);
    });
  });

  describe("duration-fold (no @step, gallop)", () => {
    it("folds the cycled duration into position spacing", () => {
      // No @step → each note's spacing to the next is its own cycled duration,
      // so length and spacing track together (the spec's Gallop example).
      const result = interpretNotation("[n/4 n/8] C3 1|1x8");

      expect(result.map((n) => [n.start_time, n.duration])).toStrictEqual([
        [0, 1],
        [1, 0.5],
        [1.5, 1],
        [2.5, 0.5],
        [3, 1],
        [4, 0.5],
        [4.5, 1],
        [5.5, 0.5],
      ]);
    });

    it("zips a pitch stream against the duration-fold (independent cursors)", () => {
      const result = interpretNotation("[n/4 n/8] [C3 E3 G3] 1|1x6");

      expect(
        result.map((n) => [n.pitch, n.start_time, n.duration]),
      ).toStrictEqual([
        [60, 0, 1],
        [64, 1, 0.5],
        [67, 1.5, 1],
        [60, 2.5, 0.5],
        [64, 3, 1],
        [67, 4, 0.5],
      ]);
    });

    it("falls back to the scalar duration when no duration stream is active", () => {
      // [C3 E3 G3] with no @step and no duration stream advances by the scalar
      // current duration — the legato run (unchanged by the fold).
      const result = interpretNotation("n/4 [C3 E3 G3] 1|1x3");

      expect(result.map((n) => [n.pitch, n.start_time])).toStrictEqual([
        [60, 0],
        [64, 1],
        [67, 2],
      ]);
    });

    it("folds a bar-length stream value into the spacing", () => {
      // A whole-bar duration in the fold advances a full bar (4 beats in 4/4):
      // note 1 holds bar 1 and the next lands at 2|1, then a quarter.
      const result = interpretNotation("[1bar n/4] C3 1|1x2");

      expect(result.map((n) => [n.start_time, n.duration])).toStrictEqual([
        [0, 4],
        [4, 1],
      ]);
    });

    it("continues the duration-fold cursor across token boundaries", () => {
      // The fold cursor carries across separate repeat tokens (the wrinkle P3c
      // was built around: the position computation reads the cursor base before
      // it advances). Three notes in 1|1x3 leave the cursor on the SHORT value,
      // so 2|1x2 resumes short-then-long — not a fresh long-short restart.
      const result = interpretNotation("[n/4 n/8] C3 1|1x3 2|1x2");

      expect(result.map((n) => [n.start_time, n.duration])).toStrictEqual([
        [0, 1],
        [1, 0.5],
        [1.5, 1],
        [4, 0.5],
        [4.5, 1],
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

    it("applies one velocity per emission to a layered (multi-voice) chord", () => {
      // A velocity stream zips against the emission index while two pitch voices
      // LAYER: the cycled velocity applies to the whole layered chord, not per
      // voice. (Regression for value-stream zip × pitch layering.)
      const result = interpretNotation(
        "n/4 [v80 v100] [C3 C4] [E3 G3 E4] 1|1,2,3,4",
      );

      expect(
        result.map((n) => [n.pitch, n.start_time, n.velocity]),
      ).toStrictEqual([
        [60, 0, 80],
        [64, 0, 80],
        [72, 1, 100],
        [67, 1, 100],
        [60, 2, 80],
        [76, 2, 80],
        [72, 3, 100],
        [64, 3, 100],
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

    it("cycles a duration stream's length across separate note events", () => {
      // Explicit positions (no repeat) → the fold doesn't move them, but the
      // duration stream still cycles each note's LENGTH by the carried cursor.
      const result = interpretNotation("[n/4 n/8] C3 1|1 D3 1|2 E3 1|3");

      expect(
        result.map((n) => [n.pitch, n.start_time, n.duration]),
      ).toStrictEqual([
        [60, 0, 1],
        [62, 1, 0.5],
        [64, 2, 1],
      ]);
    });

    it("cycles a probability stream across separate note events", () => {
      const result = interpretNotation("[p1 p0.5] C3 1|1 D3 1|2 E3 1|3");

      expect(
        result.map((n) => [n.pitch, n.start_time, n.probability]),
      ).toStrictEqual([
        [60, 0, 1],
        [62, 1, 0.5],
        [64, 2, 1],
      ]);
    });

    it("lets a later scalar replace an active value stream", () => {
      const result = interpretNotation("[v80 v100] C3 1|1 v60 D3 1|2");

      expect(result.map((n) => [n.pitch, n.velocity])).toStrictEqual([
        [60, 80],
        [62, 60],
      ]);
    });

    it("lets a scalar duration cancel an active duration stream", () => {
      const result = interpretNotation("[n/4 n/8] C3 1|1 n/16 D3 1|2");

      // The n/16 clears the stream, so D3 takes the scalar (0.25), not the
      // stream's next value (0.5).
      expect(result.map((n) => [n.pitch, n.duration])).toStrictEqual([
        [60, 1],
        [62, 0.25],
      ]);
    });

    it("lets a scalar probability cancel an active probability stream", () => {
      const result = interpretNotation("[p1 p0.5] C3 1|1 p0.25 D3 1|2");

      expect(result.map((n) => [n.pitch, n.probability])).toStrictEqual([
        [60, 1],
        [62, 0.25],
      ]);
    });

    it("lets a second bracket replace the first for the same parameter (last wins)", () => {
      // Value streams are last-wins — a note has exactly one velocity, so a
      // second velocity bracket supersedes the first. (Pitch is the exception:
      // multiple pitch brackets LAYER into a chord instead of replacing.)
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

    it("warns when a SCALAR follows a pitch stream (can't affect the group)", () => {
      // A pitch stream captures v/n/p at bracket time, so a late scalar can't
      // change it — same as a bare chord (`C3 E3 v80 1|1`). The scalar is
      // dropped for this group (notes stay at the default velocity) AND the
      // "won't affect this group" warning fires (it didn't before — the warning
      // keyed only off the bare-chord buffer, not a buffered pitch stream).
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const result = interpretNotation("[C3 E3] v80 1|1x2@n/4");

      expect(result.map((n) => [n.pitch, n.velocity])).toStrictEqual([
        [60, 100],
        [64, 100],
      ]);
      expect(warn).toHaveBeenCalledWith(
        "state change after pitch(es) but before time position won't affect this group",
      );
      warn.mockRestore();
    });

    it("updates a carried pitch stream like a carried bare pitch (length-1 == bare)", () => {
      // The core design principle: "a scalar — or a bare chord — is just a
      // length-1 stream." A scalar between two carried positions retroactively
      // updates the carried pitch state, and a length-1 stream MUST behave
      // exactly like the bare pitch: both give the second note velocity 80.
      const carriedStream = interpretNotation("[C3] 1|1 v80 1|2");
      const carriedBare = interpretNotation("C3 1|1 v80 1|2");

      expect(carriedStream.map((n) => n.velocity)).toStrictEqual([100, 80]);
      expect(carriedBare.map((n) => n.velocity)).toStrictEqual([100, 80]);
      expect(carriedStream).toStrictEqual(carriedBare);
    });

    it("carries a scalar forward through a multi-value stream's captured values", () => {
      // For a longer stream the scalar updates every captured value, so
      // emissions at/after it reflect it: C3 already emitted at v100, E3 (the
      // next value) emits at v80.
      const result = interpretNotation("[C3 E3] 1|1 v80 1|2");

      expect(result.map((n) => [n.pitch, n.velocity])).toStrictEqual([
        [60, 100],
        [64, 80],
      ]);
    });

    it("updates every voice of a carried LAYERED group when a later scalar follows", () => {
      // Combines layered-voice carry with a retroactive scalar: a layered group
      // (bare C4 + bracket [E4 G4]) persists across the first comma list into
      // bar 2, the shared pitch cursor carries (so bar 2 keeps phasing), and the
      // `v100` between the two lists retroactively updates ALL carried voices —
      // bar 1 is v80, bar 2 the same layered shape at v100. Asserted against the
      // fully written-out equivalent.
      const result = interpretNotation(
        "n/4 v80 C4 [E4 G4] 1|1,2,3,4 v100 2|1,2,3,4",
      );

      expect(result.map((n) => n.velocity)).toStrictEqual([
        80, 80, 80, 80, 80, 80, 80, 80, 100, 100, 100, 100, 100, 100, 100, 100,
      ]);
      expect(result).toStrictEqual(
        interpretNotation(
          "n/4 v80 C4 E4 1|1 C4 G4 1|2 C4 E4 1|3 C4 G4 1|4 " +
            "v100 C4 E4 2|1 C4 G4 2|2 C4 E4 2|3 C4 G4 2|4",
        ),
      );
    });
  });
});
