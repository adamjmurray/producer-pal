// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import * as parser from "#src/notation/transform/parser/transform-parser.ts";
import {
  applyTransforms,
  evaluateTransform,
} from "#src/notation/transform/transform-evaluator.ts";
import { createTestNotes } from "./transform-evaluator-test-helpers.ts";

describe("Transform - seq function", () => {
  describe("parser", () => {
    it("parses seq with multiple arguments", () => {
      const result = parser.parse("velocity = seq(60, 80, 100)");

      expect(result[0]!.expression).toStrictEqual({
        type: "function",
        name: "seq",
        args: [60, 80, 100],
        sync: false,
      });
    });

    it("rejects sync on seq", () => {
      expect(() => parser.parse("velocity += seq(1, 2, sync)")).toThrow();
    });
  });

  describe("evaluator", () => {
    it("evaluates seq with single value", () => {
      const result = evaluateTransform("velocity = seq(42)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBe(42);
    });

    it("cycles through values based on note.index", () => {
      const expected = [60, 80, 100, 60, 80];

      for (let i = 0; i < expected.length; i++) {
        const result = evaluateTransform(
          "velocity = seq(60, 80, 100)",
          {
            position: i,
            timeSig: { numerator: 4, denominator: 4 },
          },
          { index: i, count: 5 },
        );

        expect(result.velocity!.value).toBe(expected[i]);
      }
    });

    it("wraps around with modulo", () => {
      const result = evaluateTransform(
        "velocity = seq(10, 20)",
        {
          position: 0,
          timeSig: { numerator: 4, denominator: 4 },
        },
        { index: 4, count: 5 },
      );

      expect(result.velocity!.value).toBe(10); // 4 % 2 = 0
    });

    it("supports nested seq", () => {
      // seq(seq(1,2), seq(3,4)) with index 0: outer[0] → seq(1,2)[0] → 1
      const result0 = evaluateTransform(
        "velocity = seq(seq(1, 2), seq(3, 4))",
        { position: 0, timeSig: { numerator: 4, denominator: 4 } },
        { index: 0, count: 4 },
      );

      expect(result0.velocity!.value).toBe(1);

      // index 1: outer[1] → seq(3,4)[1] → 4
      const result1 = evaluateTransform(
        "velocity = seq(seq(1, 2), seq(3, 4))",
        { position: 0, timeSig: { numerator: 4, denominator: 4 } },
        { index: 1, count: 4 },
      );

      expect(result1.velocity!.value).toBe(4);
    });

    it("selects correct argument per index", () => {
      const result = evaluateTransform(
        "velocity = seq(42, 99)",
        { position: 0, timeSig: { numerator: 4, denominator: 4 } },
        { index: 0, count: 2 },
      );

      expect(result.velocity!.value).toBe(42);

      const result2 = evaluateTransform(
        "velocity = seq(42, 99)",
        { position: 0, timeSig: { numerator: 4, denominator: 4 } },
        { index: 1, count: 2 },
      );

      expect(result2.velocity!.value).toBe(99);
    });

    it("defaults to index 0 when no note properties", () => {
      const result = evaluateTransform("velocity = seq(60, 80, 100)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBe(60);
    });

    it("uses clip.index when note.index is not available", () => {
      const result = evaluateTransform(
        "velocity = seq(10, 20, 30)",
        { position: 0, timeSig: { numerator: 4, denominator: 4 } },
        { "clip:index": 2, "clip:count": 3 },
      );

      expect(result.velocity!.value).toBe(30);
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
});
