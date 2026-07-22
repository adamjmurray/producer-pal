// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { evaluateTransform } from "#src/notation/transform/transform-evaluator.ts";
import * as console from "#src/shared/v8-max-console.ts";
import { createContext } from "./evaluator/transform-evaluator-test-helpers.ts";
import { expectVelocitiesAfter } from "./transform-test-helpers.ts";

// One quiet note and one loud note — the minimal pair for a velocity threshold.
const QUIET_AND_LOUD_NOTES = [
  { start_time: 0, velocity: 30 },
  { start_time: 1, velocity: 100 },
];

// C3 loud / E3 loud / C3 quiet — separates a pitch match from a velocity match,
// so a predicate that ignores either half is caught.
const PITCH_AND_VELOCITY_NOTES = [
  { pitch: 60, start_time: 0, velocity: 100 }, // C3, loud
  { pitch: 64, start_time: 1, velocity: 100 }, // E3, loud (wrong pitch)
  { pitch: 60, start_time: 2, velocity: 50 }, // C3, quiet
];

describe("where() predicate filtering", () => {
  describe("applyTransforms (selection path)", () => {
    it("deletes quiet notes with a < threshold", () => {
      // The quiet note's velocity is set to 0, then removed by the deletion sweep.
      expectVelocitiesAfter(
        QUIET_AND_LOUD_NOTES,
        "where(note.velocity < 40): velocity = 0",
        [100],
      );
    });

    it("deletes matched notes via the `delete` shorthand (alias for v0)", () => {
      // `delete` desugars to velocity = 0, so the quiet note is swept out.
      expectVelocitiesAfter(
        QUIET_AND_LOUD_NOTES,
        "where(note.velocity < 40): delete",
        [100],
      );
    });

    it("accents loud notes with a > threshold", () => {
      expectVelocitiesAfter(
        [
          { start_time: 0, velocity: 110 },
          { start_time: 1, velocity: 80 },
        ],
        "where(note.velocity > 100): velocity += 20",
        [
          127, // 110 + 20, clamped
          80, // not loud → untouched
        ],
      );
    });

    it("AND-combines a pitch selector with a predicate", () => {
      expectVelocitiesAfter(
        PITCH_AND_VELOCITY_NOTES,
        "C3 where(note.velocity > 80): velocity = 64",
        [
          64, // C3 AND loud
          100, // loud but not C3
          50, // C3 but not loud
        ],
      );
    });

    it("supports || across two pitch bands", () => {
      expectVelocitiesAfter(
        [
          { pitch: 36, start_time: 0, velocity: 100 }, // C1, low
          { pitch: 60, start_time: 1, velocity: 100 }, // C3, mid
          { pitch: 96, start_time: 2, velocity: 100 }, // C7, high
        ],
        "where(note.pitch < 40 || note.pitch > 90): velocity = 64",
        [
          64, // low
          100, // mid → untouched
          64, // high
        ],
      );
    });

    it("AND-combines two predicates with && (both sides must hold)", () => {
      expectVelocitiesAfter(
        PITCH_AND_VELOCITY_NOTES,
        "where(note.pitch == C3 && note.velocity > 80): velocity = 64",
        [
          64, // C3 AND loud
          100, // not C3 → right never evaluated (short-circuit)
          50, // C3 but not loud
        ],
      );
    });

    it("negates with !(...)", () => {
      expectVelocitiesAfter(
        [
          { start_time: 0, velocity: 110 },
          { start_time: 1, velocity: 50 },
        ],
        "where(!(note.velocity > 80)): velocity += 10",
        [
          110, // loud → NOT matched
          60, // quiet → matched, +10
        ],
      );
    });

    it("compares deviation as a plain scalar (!= operator)", () => {
      expectVelocitiesAfter(
        [
          { start_time: 0, velocity: 100, velocity_deviation: 40 },
          { start_time: 1, velocity: 100, velocity_deviation: 0 },
        ],
        "where(note.deviation != 0): velocity += 10",
        [
          110, // has deviation
          100, // no deviation → untouched
        ],
      );
    });

    it("matches an exact pitch with == against a pitch literal", () => {
      expectVelocitiesAfter(
        [
          { pitch: 60, start_time: 0, velocity: 100 },
          { pitch: 61, start_time: 1, velocity: 100 },
        ],
        "where(note.pitch == C3): velocity = 64",
        [
          64, // C3
          100, // C#3 → untouched
        ],
      );
    });

    it("filters positionally on note.start (>= operator)", () => {
      expectVelocitiesAfter(
        [
          { start_time: 0, velocity: 100 },
          { start_time: 4, velocity: 100 },
        ],
        "where(note.start >= 4): velocity = 64",
        [
          100, // before beat 4
          64, // at/after beat 4
        ],
      );
    });

    it("compares duration against a note value (<= operator)", () => {
      expectVelocitiesAfter(
        [
          { start_time: 0, duration: 0.25, velocity: 100 }, // < n/8 (0.5)
          { start_time: 1, duration: 1, velocity: 100 },
        ],
        "where(note.duration <= n/8): velocity += 10",
        [
          110, // short note
          100, // long note → untouched
        ],
      );
    });

    it("selects either side of a beat with abs()", () => {
      expectVelocitiesAfter(
        [
          { start_time: 3.5, velocity: 100 }, // |3.5 - 4| = 0.5 < 1 → near
          { start_time: 4.5, velocity: 100 }, // |4.5 - 4| = 0.5 < 1 → near
          { start_time: 8, velocity: 100 }, // far
        ],
        "where(abs(note.start - 4) < 1): velocity += 20",
        [
          120, // before beat 4, within 1
          120, // after beat 4, within 1
          100, // far → untouched
        ],
      );
    });

    it("gates on the smaller of two properties with min()", () => {
      expectVelocitiesAfter(
        [
          { start_time: 0, velocity: 100, velocity_deviation: 90 }, // min 90 > 80
          { start_time: 1, velocity: 100, velocity_deviation: 50 }, // min 50
          { start_time: 2, velocity: 70, velocity_deviation: 90 }, // min 70
        ],
        "where(min(note.velocity, note.deviation) > 80): velocity = 64",
        [
          64, // both high
          100, // low deviation → untouched
          70, // low velocity → untouched
        ],
      );
    });

    it("selects with a periodic waveform predicate", () => {
      // sin(n/4) over a 4/4 clip: positive on the first half of each beat.
      expectVelocitiesAfter(
        [
          { start_time: 0.25, velocity: 100 }, // sin phase 0.25 → +1 > 0
          { start_time: 0.75, velocity: 100 }, // sin phase 0.75 → -1 < 0
        ],
        "where(sin(n/4) > 0): velocity = 64",
        [
          64, // on the rising half
          100, // on the falling half → untouched
        ],
      );
    });

    it("normalizes a ramp() predicate over the line's selector bounds", () => {
      // Time selector 1|1-3|1 → musical beats [0, 8). ramp(0, 100) is then
      // 100 * position/8, so the predicate ramp(0,100) > 50 selects the second
      // half of the window (position > 4) — proving the predicate uses the
      // selector bounds, not the whole-clip range, for phase normalization.
      expectVelocitiesAfter(
        [
          { start_time: 2, velocity: 100 }, // phase 0.25 → ramp 25
          { start_time: 6, velocity: 100 }, // phase 0.75 → ramp 75
          { start_time: 10, velocity: 100 }, // outside the time selector
        ],
        "1|1-3|1 where(ramp(0, 100) > 50): velocity = 64",
        [
          100, // first half of window → untouched
          64, // second half → selected
          100, // outside selector → untouched
        ],
      );
    });

    // where() comparisons over note.start / note.duration carry the same
    // SELECTOR_EPSILON tolerance as the time selector (the time-selector fix is
    // guarded by transform-note-ops "selector float tolerance over a ratcheted
    // burst"). note-ops like ratchet generate positions/durations via float
    // division that can land ~1 ULP off the round beat a note-value literal
    // names, so an exact comparison would silently drop a note on the boundary.
    // These reproduce that drift deterministically with a value 1 ULP off the
    // bound; the realistic ratchet round-trip is covered in
    // e2e/mcp/clip/transforms/ppal-clip-transforms-where.test.ts.
    it("includes a note 1 ULP below the bound via where(note.start >= n/8)", () => {
      // n/8 = 0.5 musical beats. justBelowHalf is the next float down from 0.5.
      const justBelowHalf = 0.5 - Number.EPSILON / 2;

      // The drifted note names beat 0.5; tolerance keeps it in. Exact float
      // comparison (0.4999… >= 0.5 is false) would leave it untouched at 100.
      expectVelocitiesAfter(
        [{ start_time: justBelowHalf, velocity: 100 }],
        "where(note.start >= n/8): velocity = 64",
        [64],
      );
    });

    it("includes a note 1 ULP above the bound via where(note.duration <= n/16)", () => {
      // n/16 = 0.25 musical beats. justAboveQuarter is the next float up.
      const justAboveQuarter = 0.25 + Number.EPSILON / 4;

      // The drifted duration names an n/16; tolerance keeps it in. Exact float
      // comparison (0.2500…06 <= 0.25 is false) would leave it untouched at 100.
      expectVelocitiesAfter(
        [{ start_time: 0, duration: justAboveQuarter, velocity: 100 }],
        "where(note.duration <= n/16): velocity = 64",
        [64],
      );
    });

    it("matches a near-boundary note with where(note.start == n/8)", () => {
      // Tolerant equality: a note 1 ULP off the 0.5-beat bound still satisfies
      // `== n/8`. Exact float == would miss it, leaving velocity at 100.
      const justBelowHalf = 0.5 - Number.EPSILON / 2;

      expectVelocitiesAfter(
        [{ start_time: justBelowHalf, velocity: 100 }],
        "where(note.start == n/8): velocity = 64",
        [64],
      );
    });

    it("warns and excludes a note whose predicate property is unavailable", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      // probability is undefined → predicate eval throws → warn-and-exclude.
      expectVelocitiesAfter(
        [{ start_time: 0, velocity: 100, probability: undefined }],
        "where(note.probability < .5): velocity = 64",
        [100],
      );

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("where() predicate"),
      );
      warnSpy.mockRestore();
    });

    it("warns and skips a duplicate-selector line but applies the others", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      // First line has two pitch selectors (invalid) — it is warned-and-skipped.
      // The second line is well-formed and still applies, proving one bad line
      // does not abort the whole transforms string.
      expectVelocitiesAfter(
        [{ start_time: 0, velocity: 50 }],
        "C3: E3: velocity = 120\nvelocity += 10",
        [60], // only the second line ran (50 + 10)
      );

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("duplicate pitch selector"),
      );
      warnSpy.mockRestore();
    });
  });

  describe("evaluateTransform (scalar path)", () => {
    it("applies the assignment when the predicate is satisfied", () => {
      const result = evaluateTransform(
        "where(note.velocity > 80): velocity = 64",
        createContext(),
        { velocity: 100 },
      );

      expect(result.velocity).toStrictEqual({ operator: "set", value: 64 });
    });

    it("skips the assignment when the predicate is not satisfied", () => {
      const result = evaluateTransform(
        "where(note.velocity > 80): velocity = 64",
        createContext(),
        { velocity: 50 },
      );

      expect(result).toStrictEqual({});
    });

    it("skips (with a warning) when a predicate property is missing", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = evaluateTransform(
        "where(note.velocity > 80): velocity = 64",
        createContext(),
        {},
      );

      expect(result).toStrictEqual({});
      warnSpy.mockRestore();
    });
  });
});
