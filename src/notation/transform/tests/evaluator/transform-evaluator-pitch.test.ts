// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import * as console from "#src/shared/max/v8-max-console.ts";
import { applyTransforms } from "#src/notation/transform/transform-evaluator.ts";
import {
  createTestNote,
  createTestNotes,
} from "./transform-evaluator-test-helpers.ts";

describe("applyTransforms - pitch transforms", () => {
  describe("basic pitch operations", () => {
    it("applies pitch set transform", () => {
      const notes = createTestNote();

      applyTransforms(notes, "pitch = 72", 4, 4);
      expect(notes[0]!.pitch).toBe(72);
    });

    it("applies pitch add transform (transpose up)", () => {
      const notes = createTestNote();

      applyTransforms(notes, "pitch += 12", 4, 4);
      expect(notes[0]!.pitch).toBe(72);
    });

    it("applies pitch add transform (transpose down)", () => {
      const notes = createTestNote();

      applyTransforms(notes, "pitch += -12", 4, 4);
      expect(notes[0]!.pitch).toBe(48);
    });

    it("applies pitch to multiple notes", () => {
      const notes = createTestNotes([
        { pitch: 60, start_time: 0 },
        { pitch: 64, start_time: 1 },
        { pitch: 67, start_time: 2 },
      ]);

      applyTransforms(notes, "pitch += 12", 4, 4);
      expect(notes[0]!.pitch).toBe(72);
      expect(notes[1]!.pitch).toBe(76);
      expect(notes[2]!.pitch).toBe(79);
    });
  });

  describe("pitch literals", () => {
    it("applies pitch literal in expression", () => {
      const notes = createTestNote();

      applyTransforms(notes, "pitch = C4", 4, 4); // C4 = 72
      expect(notes[0]!.pitch).toBe(72);
    });

    it("applies pitch literal with arithmetic", () => {
      const notes = createTestNote();

      applyTransforms(notes, "pitch = F#3 + 7", 4, 4); // F#3 = 66, + 7 = 73
      expect(notes[0]!.pitch).toBe(73);
    });

    it("applies pitch literal C3 as middle C", () => {
      const notes = createTestNote({ pitch: 72 });

      applyTransforms(notes, "pitch = C3", 4, 4); // C3 = 60 (middle C)
      expect(notes[0]!.pitch).toBe(60);
    });
  });

  describe("clamping", () => {
    it("clamps pitch to minimum 0", () => {
      const notes = createTestNote({ pitch: 10 });

      applyTransforms(notes, "pitch += -50", 4, 4);
      expect(notes[0]!.pitch).toBe(0);
    });

    it("clamps pitch to maximum 127", () => {
      const notes = createTestNote({ pitch: 100 });

      applyTransforms(notes, "pitch += 50", 4, 4);
      expect(notes[0]!.pitch).toBe(127);
    });

    it("clamps pitch at 0 boundary with set operator", () => {
      const notes = createTestNote();

      applyTransforms(notes, "pitch = -10", 4, 4);
      expect(notes[0]!.pitch).toBe(0);
    });

    it("clamps pitch at 127 boundary with set operator", () => {
      const notes = createTestNote();

      applyTransforms(notes, "pitch = 200", 4, 4);
      expect(notes[0]!.pitch).toBe(127);
    });
  });

  describe("rounding", () => {
    it("rounds fractional pitch values up at 0.5", () => {
      const notes = createTestNote();

      applyTransforms(notes, "pitch = 60.7", 4, 4);
      expect(notes[0]!.pitch).toBe(61);
    });

    it("rounds down when below 0.5", () => {
      const notes = createTestNote();

      applyTransforms(notes, "pitch = 60.3", 4, 4);
      expect(notes[0]!.pitch).toBe(60);
    });

    it("rounds at exactly 0.5", () => {
      const notes = createTestNote();

      applyTransforms(notes, "pitch = 60.5", 4, 4);
      expect(notes[0]!.pitch).toBe(61); // Math.round rounds 0.5 up
    });

    it("rounds fractional pitch values from note.velocity", () => {
      const notes = createTestNote();

      applyTransforms(notes, "pitch = note.velocity / 2", 4, 4); // 100/2 = 50
      expect(notes[0]!.pitch).toBe(50);
    });
  });

  describe("filtering", () => {
    it("applies pitch transform with pitch range filter", () => {
      const notes = createTestNotes([
        { pitch: 60, start_time: 0 },
        { pitch: 72, start_time: 1 },
      ]);

      applyTransforms(notes, "C3: pitch += 12", 4, 4); // Only transpose C3 (60)
      expect(notes[0]!.pitch).toBe(72); // Was 60, now 72
      expect(notes[1]!.pitch).toBe(72); // Unchanged (wasn't in C3 range)
    });

    it("applies pitch transform with time range filter", () => {
      const notes = createTestNotes([
        { pitch: 60, start_time: 0 },
        { pitch: 60, start_time: 4 },
      ]);

      applyTransforms(notes, "1|1-1|4: pitch += 12", 4, 4);
      expect(notes[0]!.pitch).toBe(72); // In time range
      expect(notes[1]!.pitch).toBe(60); // Out of time range
    });
  });

  describe("note variables", () => {
    it("applies pitch transform using note.pitch variable", () => {
      const notes = createTestNote();

      applyTransforms(notes, "pitch = note.pitch + 7", 4, 4);
      expect(notes[0]!.pitch).toBe(67);
    });

    it("uses note.velocity in pitch expression", () => {
      const notes = createTestNote({ velocity: 64 });

      applyTransforms(notes, "pitch = note.velocity", 4, 4);
      expect(notes[0]!.pitch).toBe(64);
    });
  });

  describe("bare pitch literal as non-pitch value (M2)", () => {
    it("warns and skips when a pitch name is assigned to velocity", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const notes = createTestNote({ velocity: 100 });

      applyTransforms(notes, "velocity = b2", 4, 4); // b2 = MIDI 59

      expect(notes[0]!.velocity).toBe(100); // unchanged — skipped
      // `b2` canonicalizes to the note name `B2` in the warning
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(`note name "B2" isn't a value for velocity`),
      );
      warn.mockRestore();
    });

    it("warns and skips when a pitch name is assigned to duration", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const notes = createTestNote({ duration: 1 });

      applyTransforms(notes, "duration = C3", 4, 4); // C3 = MIDI 60

      expect(notes[0]!.duration).toBe(1); // unchanged — skipped
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("isn't a value for duration"),
      );
      warn.mockRestore();
    });

    it("warns and skips for any non-pitch MIDI parameter (only pitch is exempt)", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const notes = createTestNote();

      applyTransforms(notes, "deviation = C3", 4, 4);

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("isn't a value for deviation"),
      );
      warn.mockRestore();
    });

    it("does NOT warn for pitch = C4 (full form sets pitch)", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const notes = createTestNote();

      applyTransforms(notes, "pitch = C4", 4, 4); // C4 = 72

      expect(notes[0]!.pitch).toBe(72);
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it("does NOT warn for the C4 remap shorthand", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const notes = createTestNote({ pitch: 60 });

      applyTransforms(notes, "C4", 4, 4); // bare-pitch shorthand remaps to C4 = 72

      expect(notes[0]!.pitch).toBe(72);
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it("does NOT warn for a C3: pitch-selected velocity transform", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const notes = createTestNotes([
        { pitch: 60, start_time: 0, velocity: 100 },
        { pitch: 72, start_time: 1, velocity: 100 },
      ]);

      applyTransforms(notes, "C3: v80", 4, 4); // selector + velocity shorthand

      expect(notes[0]!.velocity).toBe(80); // C3 (60) matched
      expect(notes[1]!.velocity).toBe(100); // C5 (72) untouched
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it("evaluates pitch literals as numbers inside function arguments", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const notes = createTestNotes([
        { pitch: 48, start_time: 0 }, // below C3
        { pitch: 90, start_time: 1 }, // above C5
        { pitch: 64, start_time: 2 }, // inside
      ]);

      // wrap(note.pitch + 5, C3, C5): C3 = 60, C5 = 84, closed range size 25
      applyTransforms(notes, "pitch = wrap(note.pitch + 5, C3, C5)", 4, 4);

      // 48 + 5 = 53 → ((53-60) mod 25) + 60 = 18 + 60 = 78
      expect(notes[0]!.pitch).toBe(78);
      // 90 + 5 = 95 → ((95-60) mod 25) + 60 = 10 + 60 = 70
      expect(notes[1]!.pitch).toBe(70);
      // 64 + 5 = 69 → inside [60,84]
      expect(notes[2]!.pitch).toBe(69);
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it("evaluates min(C3, C5) / clamp(...) pitch-literal args correctly", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const minNotes = createTestNote({ pitch: 100 });

      applyTransforms(minNotes, "pitch = min(C3, C5)", 4, 4); // min(60, 84) = 60
      expect(minNotes[0]!.pitch).toBe(60);

      const clampNotes = createTestNote({ pitch: 30 });

      // clamp(note.pitch, C1, C7): C1 = 36, C7 = 108 → 30 clamps up to 36
      applyTransforms(clampNotes, "pitch = clamp(note.pitch, C1, C7)", 4, 4);
      expect(clampNotes[0]!.pitch).toBe(36);

      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });
  });
});
