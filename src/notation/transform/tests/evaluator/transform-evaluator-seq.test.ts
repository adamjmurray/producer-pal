// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as parser from "#src/notation/transform/parser/transform-parser.ts";
import { parseAssignments } from "#src/notation/transform/tests/parser/parse-test-helpers.ts";
import {
  applyTransforms,
  evaluateTransform,
} from "#src/notation/transform/transform-evaluator.ts";
import {
  createContext,
  createTestNotes,
} from "./transform-evaluator-test-helpers.ts";

describe("Transform - seq function", () => {
  beforeEach(() => {
    vi.mocked(outlet).mockClear();
  });

  describe("parser", () => {
    it("parses seq with multiple arguments", () => {
      const result = parseAssignments("velocity = seq(60, 80, 100)");

      expect(result[0]!.expression).toStrictEqual({
        type: "function",
        name: "seq",
        args: [60, 80, 100],
        sync: false,
        raw: false,
      });
    });

    it("rejects sync on seq", () => {
      expect(() => parser.parse("velocity += seq(1, 2, sync)")).toThrow(
        'but "v" found',
      );
    });
  });

  describe("evaluator", () => {
    it("evaluates seq with single value", () => {
      const result = evaluateTransform("velocity = seq(42)", createContext(), {
        index: 0,
      });

      expect(result.velocity!.value).toBe(42);
    });

    it("cycles through values based on note.index", () => {
      const expected = [60, 80, 100, 60, 80];

      for (let i = 0; i < expected.length; i++) {
        const result = evaluateTransform(
          "velocity = seq(60, 80, 100)",
          createContext({ position: i }),
          { index: i, count: 5 },
        );

        expect(result.velocity!.value).toBe(expected[i]);
      }
    });

    it("wraps around with modulo", () => {
      const result = evaluateTransform(
        "velocity = seq(10, 20)",
        createContext(),
        { index: 4, count: 5 },
      );

      expect(result.velocity!.value).toBe(10); // 4 % 2 = 0
    });

    it("supports nested seq", () => {
      // seq(seq(1,2), seq(3,4)) with index 0: outer[0] → seq(1,2)[0] → 1
      const result0 = evaluateTransform(
        "velocity = seq(seq(1, 2), seq(3, 4))",
        createContext(),
        { index: 0, count: 4 },
      );

      expect(result0.velocity!.value).toBe(1);

      // index 1: outer[1] → seq(3,4)[1] → 4
      const result1 = evaluateTransform(
        "velocity = seq(seq(1, 2), seq(3, 4))",
        createContext(),
        { index: 1, count: 4 },
      );

      expect(result1.velocity!.value).toBe(4);
    });

    it("selects correct argument per index", () => {
      const result = evaluateTransform(
        "velocity = seq(42, 99)",
        createContext(),
        { index: 0, count: 2 },
      );

      expect(result.velocity!.value).toBe(42);

      const result2 = evaluateTransform(
        "velocity = seq(42, 99)",
        createContext(),
        { index: 1, count: 2 },
      );

      expect(result2.velocity!.value).toBe(99);
    });

    it("warns and returns first value when no axis is in scope", () => {
      const result = evaluateTransform(
        "velocity = seq(60, 80, 100)",
        createContext(),
      );

      expect(result.velocity!.value).toBe(60);
      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("seq() needs note.index"),
      );
    });

    it("falls back to clip.index when note.index is absent", () => {
      // Clip-granular properties (gain/pitchShift) have no note.index — the clip
      // axis is the only meaningful one there, so seq() cycles by clip:index
      // (equivalent to clipseq() for those). Note properties always carry
      // note.index in practice, so this fallback only ever bites clip-granular
      // ones.
      const result = evaluateTransform(
        "velocity = seq(10, 20, 30)",
        createContext(),
        { "clip:index": 2, "clip:count": 3 },
      );

      expect(result.velocity!.value).toBe(30);
      expect(outlet).not.toHaveBeenCalled();
    });

    it("prefers note.index over clip.index when both axes are in scope", () => {
      // The mirror of clipseq's "ignores note.index" test: with both axes
      // present (typical MIDI scenario), seq() picks by note.index, not
      // clip:index. note.index=0 → 10; if it used clip:index=2 it would be 30.
      const result = evaluateTransform(
        "velocity = seq(10, 20, 30)",
        createContext(),
        { index: 0, "clip:index": 2, "clip:count": 3 },
      );

      expect(result.velocity!.value).toBe(10);
    });
  });

  describe("pitch-range-filtered index in applyTransforms", () => {
    it("counts only matching notes for note.index with pitch range", () => {
      // Mix of pitches: C3(60), E3(64), C3, E3, C3, E3
      const notes = createTestNotes([
        { pitch: 60, start_time: 0 },
        { pitch: 64, start_time: 1 },
        { pitch: 60, start_time: 2 },
        { pitch: 64, start_time: 3 },
        { pitch: 60, start_time: 4 },
        { pitch: 64, start_time: 5 },
      ]);

      // seq cycles through values based on filtered index (C3 notes only)
      // C3 note indices: 0, 1, 2 → seq(40, 80, 120) cycles: 40, 80, 120
      applyTransforms(notes, "C3: velocity = seq(40, 80, 120)", 4, 4);
      expect(notes[0]!.velocity).toBe(40); // C3 filtered index 0
      expect(notes[1]!.velocity).toBe(100); // E3 unchanged
      expect(notes[2]!.velocity).toBe(80); // C3 filtered index 1
      expect(notes[3]!.velocity).toBe(100); // E3 unchanged
      expect(notes[4]!.velocity).toBe(120); // C3 filtered index 2
      expect(notes[5]!.velocity).toBe(100); // E3 unchanged
    });

    it("provides filtered note.count with pitch range", () => {
      const notes = createTestNotes([
        { pitch: 60, start_time: 0 },
        { pitch: 64, start_time: 1 },
        { pitch: 60, start_time: 2 },
      ]);

      // note.count should be 2 (only C3 notes), not 3 (all notes)
      applyTransforms(notes, "C3: velocity = note.count * 10", 4, 4);
      expect(notes[0]!.velocity).toBe(20); // 2 * 10
      expect(notes[1]!.velocity).toBe(100); // E3 unchanged
      expect(notes[2]!.velocity).toBe(20); // 2 * 10
    });

    it("uses global index when no pitch range is active", () => {
      const notes = createTestNotes([
        { pitch: 60, start_time: 0 },
        { pitch: 64, start_time: 1 },
        { pitch: 67, start_time: 2 },
      ]);

      applyTransforms(notes, "velocity = seq(40, 80, 120)", 4, 4);
      expect(notes[0]!.velocity).toBe(40); // global index 0
      expect(notes[1]!.velocity).toBe(80); // global index 1
      expect(notes[2]!.velocity).toBe(120); // global index 2
    });

    it("supports stacked pitch transforms (second sees mutations from first)", () => {
      // 6 notes all at C3(60)
      const notes = createTestNotes([
        { pitch: 60, start_time: 0 },
        { pitch: 60, start_time: 1 },
        { pitch: 60, start_time: 2 },
        { pitch: 60, start_time: 3 },
        { pitch: 60, start_time: 4 },
        { pitch: 60, start_time: 5 },
      ]);

      // First line: every 3rd C3 → E3(64)
      // Second line: every 2nd remaining C3 → G3(67)
      const transforms = [
        "C3: pitch = seq(C3, C3, E3)",
        "C3: pitch = seq(C3, G3)",
      ].join("\n");

      applyTransforms(notes, transforms, 4, 4);

      // First pass (all 6 are C3, filtered indices 0-5):
      //   seq(C3,C3,E3): 0→C3, 1→C3, 2→E3, 3→C3, 4→C3, 5→E3
      //   Notes: C3, C3, E3, C3, C3, E3
      //
      // Second pass (4 remaining C3, filtered indices 0-3):
      //   seq(C3,G3): 0→C3, 1→G3, 2→C3, 3→G3
      //   Notes: C3, G3, E3, C3, G3, E3
      expect(notes[0]!.pitch).toBe(60); // C3
      expect(notes[1]!.pitch).toBe(67); // G3
      expect(notes[2]!.pitch).toBe(64); // E3 (from first pass)
      expect(notes[3]!.pitch).toBe(60); // C3
      expect(notes[4]!.pitch).toBe(67); // G3
      expect(notes[5]!.pitch).toBe(64); // E3 (from first pass)
    });

    it("handles every-Nth pattern with seq for drum replacement", () => {
      // Simulates the closed hat → open hat use case
      // 7 closed hat notes (Gb1 = 42)
      const notes = createTestNotes(
        Array.from({ length: 7 }, (_, i) => ({
          pitch: 42,
          start_time: i,
        })),
      );

      // Every 3rd hat → open hat (Ab1 = 44)
      applyTransforms(notes, "Gb1: pitch = seq(Gb1, Gb1, Ab1)", 4, 4);

      expect(notes[0]!.pitch).toBe(42); // Gb1
      expect(notes[1]!.pitch).toBe(42); // Gb1
      expect(notes[2]!.pitch).toBe(44); // Ab1 (index 2)
      expect(notes[3]!.pitch).toBe(42); // Gb1
      expect(notes[4]!.pitch).toBe(42); // Gb1
      expect(notes[5]!.pitch).toBe(44); // Ab1 (index 5)
      expect(notes[6]!.pitch).toBe(42); // Gb1
    });
  });

  describe("time-range-scoped index in applyTransforms", () => {
    it("indexes seq from 0 over the time-selected subset, not the whole pitch run", () => {
      // 6 C3 notes across two 4/4 bars: starts 0..3 in bar 1, 4..5 in bar 2.
      // A bar-2 selector picks only the last two; seq must start at index 0 for
      // them (40, 80), not continue the clip-wide count (which would give 80,
      // 120 from cursor 4, 5). This is the ratcheted-burst sub-range bug.
      const notes = createTestNotes(
        Array.from({ length: 6 }, (_, i) => ({ pitch: 60, start_time: i })),
      );

      applyTransforms(notes, "C3 2|1-<3|1: velocity = seq(40, 80, 120)", 4, 4);

      expect(notes[0]!.velocity).toBe(100); // bar 1 — not selected
      expect(notes[1]!.velocity).toBe(100);
      expect(notes[2]!.velocity).toBe(100);
      expect(notes[3]!.velocity).toBe(100);
      expect(notes[4]!.velocity).toBe(40); // selection index 0
      expect(notes[5]!.velocity).toBe(80); // selection index 1
    });

    it("provides note.count scoped to the time-selected subset", () => {
      const notes = createTestNotes(
        Array.from({ length: 6 }, (_, i) => ({ pitch: 60, start_time: i })),
      );

      // Only the two bar-2 notes are selected → note.count is 2, not 6.
      applyTransforms(notes, "C3 2|1-<3|1: velocity = note.count * 10", 4, 4);

      expect(notes[0]!.velocity).toBe(100); // not selected
      expect(notes[4]!.velocity).toBe(20); // 2 * 10
      expect(notes[5]!.velocity).toBe(20);
    });

    it("scopes index to the time window even without a pitch range", () => {
      // Mixed pitches, no pitch filter. Bar-2 selector picks starts 4 and 5
      // (sorted indices 2 and 3). Selection-local index → 40, 80; the old
      // global index (i=2, 3) would have produced 120, 40.
      const notes = createTestNotes([
        { pitch: 60, start_time: 0 },
        { pitch: 62, start_time: 1 },
        { pitch: 64, start_time: 4 },
        { pitch: 67, start_time: 5 },
      ]);

      applyTransforms(notes, "2|1-<3|1: velocity = seq(40, 80, 120)", 4, 4);

      expect(notes[0]!.velocity).toBe(100); // bar 1 — not selected
      expect(notes[1]!.velocity).toBe(100);
      expect(notes[2]!.velocity).toBe(40); // selection index 0
      expect(notes[3]!.velocity).toBe(80); // selection index 1
    });
  });
});

describe("Transform - clipseq function", () => {
  beforeEach(() => {
    vi.mocked(outlet).mockClear();
  });

  describe("parser", () => {
    it("parses clipseq with multiple arguments", () => {
      const result = parseAssignments("pitch += clipseq(0, 5, 7)");

      expect(result[0]!.expression).toStrictEqual({
        type: "function",
        name: "clipseq",
        args: [0, 5, 7],
        sync: false,
        raw: false,
      });
    });

    it("rejects sync on clipseq", () => {
      expect(() => parser.parse("pitch += clipseq(1, 2, sync)")).toThrow(
        'but "p" found',
      );
    });
  });

  describe("evaluator", () => {
    it("cycles through values based on clip.index", () => {
      const expected = [10, 20, 30, 10, 20];

      for (let i = 0; i < expected.length; i++) {
        const result = evaluateTransform(
          "velocity = clipseq(10, 20, 30)",
          createContext(),
          { "clip:index": i, "clip:count": 5 },
        );

        expect(result.velocity!.value).toBe(expected[i]);
      }
    });

    it("ignores note.index — uses clip.index axis only", () => {
      // Both axes in scope (typical MIDI scenario): clipseq must still pick
      // by clip:index, not by note.index. Otherwise it would just be seq().
      const result = evaluateTransform(
        "velocity = clipseq(10, 20, 30)",
        createContext(),
        { index: 0, "clip:index": 2, "clip:count": 3 },
      );

      expect(result.velocity!.value).toBe(30);
    });

    it("wraps around with modulo", () => {
      const result = evaluateTransform(
        "velocity = clipseq(10, 20)",
        createContext(),
        { "clip:index": 5, "clip:count": 6 },
      );

      expect(result.velocity!.value).toBe(20); // 5 % 2 = 1
    });

    it("warns and returns first value when clip.index is missing", () => {
      const result = evaluateTransform(
        "velocity = clipseq(60, 80, 100)",
        createContext(),
      );

      expect(result.velocity!.value).toBe(60);
      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("clipseq() needs clip.index"),
      );
    });

    it("does not fall back to note.index (use seq() instead)", () => {
      const result = evaluateTransform(
        "velocity = clipseq(10, 20, 30)",
        createContext(),
        { index: 2, count: 3 },
      );

      expect(result.velocity!.value).toBe(10);
      expect(outlet).toHaveBeenCalledWith(1, expect.stringContaining("seq()"));
    });

    it("warns when called with no arguments (via applyTransforms catch)", () => {
      const notes = createTestNotes([{ pitch: 60, start_time: 0 }]);

      applyTransforms(notes, "velocity = clipseq()", 4, 4, {
        clipIndex: 0,
        clipCount: 1,
        clipDuration: 4,
        barDuration: 4,
      });

      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("clipseq() requires at least 1 argument"),
      );
    });
  });

  describe("integrated with applyTransforms (MIDI per-clip variation)", () => {
    it("varies notes across clips by clip.index", () => {
      const notes = createTestNotes([{ pitch: 60, start_time: 0 }]);

      // clip 1 of 3 → +5 semitones
      applyTransforms(notes, "pitch += clipseq(0, 5, 7)", 4, 4, {
        clipIndex: 1,
        clipCount: 3,
        clipDuration: 4,
        barDuration: 4,
      });

      expect(notes[0]!.pitch).toBe(65);
    });

    it("applies the same value to every note in a clip (per-clip, not per-note)", () => {
      const notes = createTestNotes([
        { pitch: 60, start_time: 0 },
        { pitch: 62, start_time: 1 },
        { pitch: 64, start_time: 2 },
      ]);

      // clip.index = 2 picks the third value (7) regardless of how many notes
      applyTransforms(notes, "pitch += clipseq(0, 5, 7)", 4, 4, {
        clipIndex: 2,
        clipCount: 3,
        clipDuration: 4,
        barDuration: 4,
      });

      expect(notes[0]!.pitch).toBe(67);
      expect(notes[1]!.pitch).toBe(69);
      expect(notes[2]!.pitch).toBe(71);
    });
  });
});
