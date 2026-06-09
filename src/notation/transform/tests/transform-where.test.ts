// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import {
  applyTransforms,
  evaluateTransform,
} from "#src/notation/transform/transform-evaluator.ts";
import * as console from "#src/shared/v8-max-console.ts";
import {
  createContext,
  createTestNotes,
} from "./evaluator/transform-evaluator-test-helpers.ts";

describe("where() predicate filtering", () => {
  describe("applyTransforms (selection path)", () => {
    it("deletes quiet notes with a < threshold", () => {
      const notes = createTestNotes([
        { start_time: 0, velocity: 30 },
        { start_time: 1, velocity: 100 },
      ]);

      applyTransforms(notes, "where(note.velocity < 40): velocity = 0", 4, 4);

      // The quiet note's velocity is set to 0, then removed by the deletion sweep.
      expect(notes).toHaveLength(1);
      expect(notes[0]!.velocity).toBe(100);
    });

    it("accents loud notes with a > threshold", () => {
      const notes = createTestNotes([
        { start_time: 0, velocity: 110 },
        { start_time: 1, velocity: 80 },
      ]);

      applyTransforms(
        notes,
        "where(note.velocity > 100): velocity += 20",
        4,
        4,
      );

      expect(notes[0]!.velocity).toBe(127); // 110 + 20, clamped
      expect(notes[1]!.velocity).toBe(80); // not loud → untouched
    });

    it("AND-combines a pitch selector with a predicate", () => {
      const notes = createTestNotes([
        { pitch: 60, start_time: 0, velocity: 100 }, // C3, loud
        { pitch: 64, start_time: 1, velocity: 100 }, // E3, loud (wrong pitch)
        { pitch: 60, start_time: 2, velocity: 50 }, // C3, quiet
      ]);

      applyTransforms(
        notes,
        "C3 where(note.velocity > 80): velocity = 64",
        4,
        4,
      );

      expect(notes[0]!.velocity).toBe(64); // C3 AND loud
      expect(notes[1]!.velocity).toBe(100); // loud but not C3
      expect(notes[2]!.velocity).toBe(50); // C3 but not loud
    });

    it("supports || across two pitch bands", () => {
      const notes = createTestNotes([
        { pitch: 36, start_time: 0, velocity: 100 }, // C1, low
        { pitch: 60, start_time: 1, velocity: 100 }, // C3, mid
        { pitch: 96, start_time: 2, velocity: 100 }, // C7, high
      ]);

      applyTransforms(
        notes,
        "where(note.pitch < 40 || note.pitch > 90): velocity = 64",
        4,
        4,
      );

      expect(notes[0]!.velocity).toBe(64); // low
      expect(notes[1]!.velocity).toBe(100); // mid → untouched
      expect(notes[2]!.velocity).toBe(64); // high
    });

    it("negates with !(...)", () => {
      const notes = createTestNotes([
        { start_time: 0, velocity: 110 },
        { start_time: 1, velocity: 50 },
      ]);

      applyTransforms(
        notes,
        "where(!(note.velocity > 80)): velocity += 10",
        4,
        4,
      );

      expect(notes[0]!.velocity).toBe(110); // loud → NOT matched
      expect(notes[1]!.velocity).toBe(60); // quiet → matched, +10
    });

    it("compares deviation as a plain scalar (!= operator)", () => {
      const notes = createTestNotes([
        { start_time: 0, velocity: 100, velocity_deviation: 40 },
        { start_time: 1, velocity: 100, velocity_deviation: 0 },
      ]);

      applyTransforms(
        notes,
        "where(note.deviation != 0): velocity += 10",
        4,
        4,
      );

      expect(notes[0]!.velocity).toBe(110); // has deviation
      expect(notes[1]!.velocity).toBe(100); // no deviation → untouched
    });

    it("matches an exact pitch with == against a pitch literal", () => {
      const notes = createTestNotes([
        { pitch: 60, start_time: 0, velocity: 100 },
        { pitch: 61, start_time: 1, velocity: 100 },
      ]);

      applyTransforms(notes, "where(note.pitch == C3): velocity = 64", 4, 4);

      expect(notes[0]!.velocity).toBe(64); // C3
      expect(notes[1]!.velocity).toBe(100); // C#3 → untouched
    });

    it("filters positionally on note.start (>= operator)", () => {
      const notes = createTestNotes([
        { start_time: 0, velocity: 100 },
        { start_time: 4, velocity: 100 },
      ]);

      applyTransforms(notes, "where(note.start >= 4): velocity = 64", 4, 4);

      expect(notes[0]!.velocity).toBe(100); // before beat 4
      expect(notes[1]!.velocity).toBe(64); // at/after beat 4
    });

    it("compares duration against a note value (<= operator)", () => {
      const notes = createTestNotes([
        { start_time: 0, duration: 0.25, velocity: 100 }, // < n/8 (0.5)
        { start_time: 1, duration: 1, velocity: 100 },
      ]);

      applyTransforms(
        notes,
        "where(note.duration <= n/8): velocity += 10",
        4,
        4,
      );

      expect(notes[0]!.velocity).toBe(110); // short note
      expect(notes[1]!.velocity).toBe(100); // long note → untouched
    });

    it("warns and excludes a note whose predicate property is unavailable", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const notes = createTestNotes([
        { start_time: 0, velocity: 100, probability: undefined },
      ]);

      applyTransforms(
        notes,
        "where(note.probability < .5): velocity = 64",
        4,
        4,
      );

      // probability is undefined → predicate eval throws → warn-and-exclude.
      expect(notes[0]!.velocity).toBe(100);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("where() predicate"),
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
