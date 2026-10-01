// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { applyTransforms } from "#src/notation/transform/transform-evaluator.ts";
import {
  createTestNote,
  createTestNotes,
  testNote,
} from "../evaluator/transform-evaluator-test-helpers.ts";
import {
  TOUCHING_C3_PAIR,
  warnSpyWithNote,
  warnSpyWithNotes,
} from "../transform-test-helpers.ts";

// Asserts a repeat is rejected: the lone note passes through unchanged and a
// warning containing `message` is emitted.
function expectRepeatWarnsAndSkips(transform: string, message: string): void {
  const { warn, notes } = warnSpyWithNote({ start_time: 0, duration: 1 });

  applyTransforms(notes, transform, 4, 4);

  expect(notes).toHaveLength(1);
  expect(notes[0]).toStrictEqual(testNote({ start_time: 0, duration: 1 }));
  expect(warn).toHaveBeenCalledWith(expect.stringContaining(message));
  warn.mockRestore();
}

describe("note-count operation: repeat", () => {
  it("echoes a note one bar later with repeat(1bar) in 4/4", () => {
    const notes = createTestNote({ start_time: 0, duration: 1 });

    // Default copy count is 1 — a single echo.
    applyTransforms(notes, "repeat(1bar)", 4, 4);

    expect(notes).toStrictEqual([
      testNote({ start_time: 0, duration: 1 }),
      testNote({ start_time: 4, duration: 1 }),
    ]);
  });

  it("emits `copies` copies, each a further offset apart", () => {
    const notes = createTestNote({ start_time: 0, duration: 0.5 });

    // repeat(n/8, 2) -> original + 2 copies at +0.5 and +1 Ableton beats.
    applyTransforms(notes, "repeat(n/8, 2)", 4, 4);

    expect(notes.map((n) => n.start_time)).toStrictEqual([0, 0.5, 1]);
    // Duration is unchanged — repeat translates, it does not resize notes.
    expect(notes.every((n) => n.duration === 0.5)).toBe(true);
  });

  it("inherits velocity, probability, and deviation from the source note", () => {
    const notes = createTestNote({
      start_time: 0,
      duration: 1,
      velocity: 90,
      probability: 0.7,
      velocity_deviation: 12,
    });

    applyTransforms(notes, "repeat(n/4)", 4, 4);

    expect(notes).toHaveLength(2);
    expect(notes[1]).toStrictEqual(
      testNote({
        start_time: 1,
        duration: 1,
        velocity: 90,
        probability: 0.7,
        velocity_deviation: 12,
      }),
    );
  });

  it("echoes every matched note", () => {
    const notes = createTestNotes([
      { pitch: 60, start_time: 0, duration: 1 },
      { pitch: 64, start_time: 2, duration: 1 },
    ]);

    applyTransforms(notes, "repeat(1bar)", 4, 4);

    expect(notes.map((n) => [n.pitch, n.start_time])).toStrictEqual([
      [60, 0],
      [64, 2],
      [60, 4],
      [64, 6],
    ]);
  });

  it("emits copies past the clip end (transforms never resize)", () => {
    // A note near the end echoed forward lands well past any current clip
    // length; the copies are still emitted (hidden in Live until lengthened).
    const notes = createTestNote({ start_time: 6, duration: 1 });

    applyTransforms(notes, "repeat(1bar, 2)", 4, 4);

    expect(notes.map((n) => n.start_time)).toStrictEqual([6, 10, 14]);
  });

  it("rounds a fractional copy count", () => {
    const notes = createTestNote({ start_time: 0, duration: 1 });

    // round(2.4) -> 2 copies -> 3 instances.
    applyTransforms(notes, "repeat(n/4, 2.4)", 4, 4);

    expect(notes).toHaveLength(3);
  });

  it("accepts an arithmetic copy-count expression", () => {
    const notes = createTestNote({ start_time: 0, duration: 1 });

    // 1 + 2 = 3 copies -> 4 instances.
    applyTransforms(notes, "repeat(n/4, 1 + 2)", 4, 4);

    expect(notes.map((n) => n.start_time)).toStrictEqual([0, 1, 2, 3]);
  });

  describe("selector scoping", () => {
    it("only echoes notes matching a pitch selector", () => {
      const notes = createTestNotes([
        { pitch: 60, start_time: 0, duration: 1 }, // C3
        { pitch: 62, start_time: 0, duration: 1 }, // D3
      ]);

      applyTransforms(notes, "C3: repeat(n/4)", 4, 4);

      // C3 echoes (2 instances), D3 untouched (1).
      expect(notes.filter((n) => n.pitch === 60)).toHaveLength(2);
      expect(notes.filter((n) => n.pitch === 62)).toHaveLength(1);
    });

    it("only echoes notes inside a time-range selector", () => {
      const notes = createTestNotes([
        { pitch: 60, start_time: 0, duration: 1 }, // bar 1
        { pitch: 60, start_time: 4, duration: 1 }, // bar 2
      ]);

      // Select only bar 1 (1|1-<2|1) and echo a quarter later.
      applyTransforms(notes, "1|1-<2|1: repeat(n/4)", 4, 4);

      expect(
        notes.map((n) => n.start_time).toSorted((a, b) => a - b),
      ).toStrictEqual([0, 1, 4]);
    });
  });

  describe("composition (document order)", () => {
    it("repeat then merge collapses the echoes (non-commuting)", () => {
      const notes = createTestNotes([
        { pitch: 60, start_time: 0, duration: 1 },
        { pitch: 60, start_time: 2, duration: 1 },
      ]);

      // Echo one bar later, then span all same-pitch into one sustained note.
      applyTransforms(notes, "repeat(1bar)\nmerge()", 4, 4);

      expect(notes).toHaveLength(1);
      // Spans from first onset (0) to the last echo's offset (6 + 1).
      expect(notes[0]).toStrictEqual(
        testNote({ start_time: 0, duration: expect.closeTo(7) }),
      );
    });

    it("merge then repeat echoes the merged note (non-commuting)", () => {
      const notes = createTestNotes([
        { pitch: 60, start_time: 0, duration: 1 },
        { pitch: 60, start_time: 2, duration: 1 },
      ]);

      applyTransforms(notes, "merge()\nrepeat(1bar)", 4, 4);

      // One long note (0..3), echoed one bar later -> two long notes.
      expect(notes).toHaveLength(2);
      expect(notes).toStrictEqual([
        testNote({ start_time: 0, duration: expect.closeTo(3) }),
        testNote({ start_time: 4, duration: expect.closeTo(3) }),
      ]);
    });
  });

  describe("meter awareness", () => {
    it("a bar offset tracks the meter (6/8)", () => {
      const notes = createTestNote({ start_time: 0, duration: 1 });

      // 6/8: one bar = 6 eighth notes = 3 Ableton (quarter) beats.
      applyTransforms(notes, "repeat(1bar)", 6, 8);

      expect(notes.map((n) => n.start_time)).toStrictEqual([0, 3]);
    });
  });

  describe("onset collisions", () => {
    it("stays quiet: the write path reports the drop on the clip's entry", () => {
      const { warn, notes } = warnSpyWithNotes(TOUCHING_C3_PAIR);

      // The copy of the beat-0 note lands on the existing beat-1 note.
      applyTransforms(notes, "repeat(n/4)", 4, 4);

      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });
  });

  // A bad count that the up-front checks can't see (it uses a variable or a
  // random function) is still caught as the op runs.
  describe("warn-and-skip at run time", () => {
    it("skips a copy count that comes out below 1", () => {
      expectRepeatWarnsAndSkips(
        "repeat(n/8, rand(0, 0))",
        "needs a copy count of 1 or more",
      );
    });

    it("skips a copy count that overflows to non-finite", () => {
      const big = "9".repeat(62);

      expectRepeatWarnsAndSkips(
        `repeat(n/8, rand(1, 1) * ${big} * ${big} * ${big} * ${big} * ${big} * ${big})`,
        "copy count must be a finite number",
      );
    });

    it("skips a copy count that fails to evaluate (audio var in note context)", () => {
      expectRepeatWarnsAndSkips(
        "repeat(n/4, audio.gain)",
        "copy count could not be evaluated",
      );
    });

    it("clamps a copy count above the cap and still echoes", () => {
      const { warn, notes } = warnSpyWithNote({ start_time: 0, duration: 0.1 });

      applyTransforms(notes, "repeat(n/16, 100)", 4, 4);

      // 64 copies + the original = 65 instances.
      expect(notes).toHaveLength(65);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("clamped to the max"),
      );
      warn.mockRestore();
    });
  });
});
