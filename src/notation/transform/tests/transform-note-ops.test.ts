// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { applyTransforms } from "#src/notation/transform/transform-evaluator.ts";
import * as console from "#src/shared/v8-max-console.ts";
import {
  createTestNote,
  createTestNotes,
} from "./evaluator/transform-evaluator-test-helpers.ts";

// Asserts a merge tolerance is rejected: the two well-separated notes pass
// through unchanged and a warning containing `message` is emitted.
function expectMergeWarnsAndSkips(transform: string, message: string): void {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const notes = createTestNotes([
    { pitch: 60, start_time: 0, duration: 1 },
    { pitch: 60, start_time: 3, duration: 1 },
  ]);

  applyTransforms(notes, transform, 4, 4);

  expect(notes).toHaveLength(2);
  expect(warn).toHaveBeenCalledWith(expect.stringContaining(message));
  warn.mockRestore();
}

describe("note-count operations (ratchet/merge)", () => {
  describe("ratchet", () => {
    it("divides a note into N equal end-to-end pieces", () => {
      const notes = createTestNote({ start_time: 0, duration: 1 });

      applyTransforms(notes, "ratchet(2)", 4, 4);

      expect(notes).toStrictEqual([
        expect.objectContaining({ start_time: 0, duration: 0.5, pitch: 60 }),
        expect.objectContaining({ start_time: 0.5, duration: 0.5, pitch: 60 }),
      ]);
    });

    it("produces a triplet from ratchet(3)", () => {
      const notes = createTestNote({ start_time: 0, duration: 1 });

      applyTransforms(notes, "ratchet(3)", 4, 4);

      expect(notes).toHaveLength(3);
      expect(notes[1]!.start_time).toBeCloseTo(1 / 3);
      expect(notes[2]!.start_time).toBeCloseTo(2 / 3);
      expect(notes[0]!.duration).toBeCloseTo(1 / 3);
    });

    it("inherits velocity, probability, and deviation from the parent", () => {
      const notes = createTestNote({
        duration: 1,
        velocity: 90,
        probability: 0.7,
        velocity_deviation: 12,
      });

      applyTransforms(notes, "ratchet(2)", 4, 4);

      for (const note of notes) {
        expect(note).toMatchObject({
          velocity: 90,
          probability: 0.7,
          velocity_deviation: 12,
        });
      }
    });

    it("only ratchets notes matching a pitch selector", () => {
      const notes = createTestNotes([
        { pitch: 60, start_time: 0, duration: 1 },
        { pitch: 67, start_time: 1, duration: 1 },
      ]);

      applyTransforms(notes, "C3: ratchet(2)", 4, 4);

      // C3 (60) split into 2; G3 (67) untouched
      expect(notes).toHaveLength(3);
      expect(notes.filter((n) => n.pitch === 60)).toHaveLength(2);
      expect(notes.filter((n) => n.pitch === 67)).toHaveLength(1);
    });

    it("only ratchets notes matching a time selector", () => {
      const notes = createTestNotes([
        { pitch: 60, start_time: 0, duration: 1 }, // bar 1
        { pitch: 60, start_time: 4, duration: 1 }, // bar 2
      ]);

      applyTransforms(notes, "2|*: ratchet(2)", 4, 4);

      expect(notes).toHaveLength(3);
      // The bar-1 note is unchanged; the bar-2 note is split
      expect(notes.filter((n) => n.start_time < 4)).toHaveLength(1);
      expect(notes.filter((n) => n.start_time >= 4)).toHaveLength(2);
    });

    it("only ratchets the note starting at an exact time point", () => {
      // The user's real case: a bare bar|beat point targets just the one note
      // that starts there, leaving an adjacent note at a nearby time alone.
      const notes = createTestNotes([
        { pitch: 60, start_time: 4, duration: 0.5 }, // bar 2, beat 1
        { pitch: 60, start_time: 6, duration: 0.5 }, // bar 2, beat 3 — the target
      ]);

      applyTransforms(notes, "2|3: ratchet(4)", 4, 4);

      // Only the beat-3 note is split into 4; the beat-1 note is untouched.
      expect(notes).toHaveLength(5);
      expect(notes.filter((n) => n.start_time < 6)).toHaveLength(1);
      expect(notes.filter((n) => n.start_time >= 6)).toHaveLength(4);
    });

    it("cuts a grid-aligned note on the note-value grid", () => {
      const notes = createTestNote({ start_time: 0, duration: 1 }); // a quarter

      applyTransforms(notes, "ratchet(n/8)", 4, 4); // 8th-note grid

      expect(notes).toHaveLength(2);
      expect(notes[0]!.duration).toBeCloseTo(0.5);
    });

    it("aligns cuts to the absolute grid for an off-grid note (slivers at the ends)", () => {
      // Note from beat 0.5 to 2.5 (Ableton beats), quarter-note grid → cut at the
      // grid lines 1 and 2, NOT into equal thirds. End pieces are partial.
      const notes = createTestNote({ start_time: 0.5, duration: 2 });

      applyTransforms(notes, "ratchet(n/4)", 4, 4);

      expect(notes).toStrictEqual([
        expect.objectContaining({ start_time: 0.5, duration: 0.5 }), // 0.5 → 1
        expect.objectContaining({ start_time: 1, duration: 1 }), //     1 → 2
        expect.objectContaining({ start_time: 2, duration: 0.5 }), //   2 → 2.5
      ]);
    });

    it("count form stays equal subdivisions for the same off-grid note", () => {
      // Contrast with the grid form above: ratchet(2) ignores grid position.
      const notes = createTestNote({ start_time: 0.5, duration: 2 });

      applyTransforms(notes, "ratchet(2)", 4, 4);

      expect(notes).toStrictEqual([
        expect.objectContaining({ start_time: 0.5, duration: 1 }),
        expect.objectContaining({ start_time: 1.5, duration: 1 }),
      ]);
    });

    it("leaves a note that spans no grid line unchanged (with a warning)", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const notes = createTestNote({ start_time: 0, duration: 0.25 }); // a 16th

      applyTransforms(notes, "ratchet(n/4)", 4, 4); // quarter grid > note

      expect(notes).toHaveLength(1);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("spanned no grid line"),
      );
      warn.mockRestore();
    });

    it("warns and skips a count below 2", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const notes = createTestNote({ duration: 1 });

      applyTransforms(notes, "ratchet(1)", 4, 4);

      expect(notes).toHaveLength(1);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("count of 2 or more"),
      );
      warn.mockRestore();
    });

    it("clamps an excessive count and warns", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const notes = createTestNote({ duration: 1 });

      applyTransforms(notes, "ratchet(500)", 4, 4);

      expect(notes).toHaveLength(64);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("clamped"));
      warn.mockRestore();
    });

    it("warns and skips when no argument is given", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const notes = createTestNote({ duration: 1 });

      applyTransforms(notes, "ratchet()", 4, 4);

      expect(notes).toHaveLength(1);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("needs a count or note value"),
      );
      warn.mockRestore();
    });

    it("warns and uses the first argument when given more than one", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const notes = createTestNote({ duration: 1 });

      applyTransforms(notes, "ratchet(2, 3)", 4, 4);

      expect(notes).toHaveLength(2); // used the first arg (2), not 3
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("single count or note value"),
      );
      warn.mockRestore();
    });

    it("leaves a zero-duration note alone (it is later deleted)", () => {
      const notes = createTestNotes([
        { pitch: 60, start_time: 0, duration: 1 },
        { pitch: 62, start_time: 1, duration: 0 },
      ]);

      applyTransforms(notes, "ratchet(2)", 4, 4);

      // dur-1 note split into 2; the dur-0 note is dropped by the deletion sweep
      expect(notes).toHaveLength(2);
      expect(notes.every((n) => n.pitch === 60)).toBe(true);
    });

    it("warns and skips when the argument is not a usable number", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const notes = createTestNote({ duration: 1 });

      // clip.index has no value without clip context -> not a usable count
      applyTransforms(notes, "ratchet(clip.index)", 4, 4);

      expect(notes).toHaveLength(1);
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    it("warns and skips a bare pitch literal instead of coercing to MIDI", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const notes = createTestNote({ duration: 1 });

      // ratchet(C2) would silently coerce to MIDI 36 pieces — reject it instead
      applyTransforms(notes, "ratchet(C2)", 4, 4);

      expect(notes).toHaveLength(1);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("isn't a valid ratchet count"),
      );
      warn.mockRestore();
    });

    it("still resolves a pitch literal nested in arithmetic to a count", () => {
      const notes = createTestNote({ duration: 1 });

      // C2 - C1 = 36 - 24 = 12 -> a usable count (nested, not bare)
      applyTransforms(notes, "ratchet(C2 - C1)", 4, 4);

      expect(notes).toHaveLength(12);
    });

    it("re-derives note.index for a transform after the ratchet", () => {
      const notes = createTestNote({ start_time: 0, duration: 1, velocity: 0 });

      // ratchet first, then ramp velocity across the new 4-note grid
      applyTransforms(
        notes,
        "ratchet(4)\nvelocity = 50 + note.index * 10",
        4,
        4,
      );

      expect(notes.map((n) => n.velocity)).toStrictEqual([50, 60, 70, 80]);
    });
  });

  describe("merge", () => {
    it("spans consecutive same-pitch notes into one", () => {
      const notes = createTestNotes([
        { pitch: 60, start_time: 0, duration: 1 },
        { pitch: 60, start_time: 1, duration: 1 },
      ]);

      applyTransforms(notes, "merge()", 4, 4);

      expect(notes).toStrictEqual([
        expect.objectContaining({ pitch: 60, start_time: 0, duration: 2 }),
      ]);
    });

    it("spans across gaps between same-pitch notes (span-all)", () => {
      const notes = createTestNotes([
        { pitch: 60, start_time: 0, duration: 1 },
        { pitch: 60, start_time: 3, duration: 1 }, // gap from 1..3
      ]);

      applyTransforms(notes, "merge()", 4, 4);

      // one note spanning the earliest onset to the latest offset
      expect(notes).toStrictEqual([
        expect.objectContaining({ pitch: 60, start_time: 0, duration: 4 }),
      ]);
    });

    it("spans overlapping same-pitch notes", () => {
      const notes = createTestNotes([
        { pitch: 60, start_time: 0, duration: 2 },
        { pitch: 60, start_time: 1, duration: 2 }, // overlaps, ends at 3
      ]);

      applyTransforms(notes, "merge()", 4, 4);

      expect(notes).toStrictEqual([
        expect.objectContaining({ pitch: 60, start_time: 0, duration: 3 }),
      ]);
    });

    it("keeps different pitches independent", () => {
      const notes = createTestNotes([
        { pitch: 60, start_time: 0, duration: 1 },
        { pitch: 64, start_time: 0, duration: 1 },
      ]);

      applyTransforms(notes, "merge()", 4, 4);

      expect(notes).toHaveLength(2);
      expect(notes.map((n) => n.pitch).sort((a, b) => a - b)).toStrictEqual([
        60, 64,
      ]);
    });

    it("takes dynamics from the earliest note in each group", () => {
      const notes = createTestNotes([
        { pitch: 60, start_time: 1, duration: 1, velocity: 80 },
        { pitch: 60, start_time: 0, duration: 1, velocity: 100 },
      ]);

      applyTransforms(notes, "merge()", 4, 4);

      expect(notes).toStrictEqual([
        expect.objectContaining({ start_time: 0, velocity: 100, duration: 2 }),
      ]);
    });

    it("merges only notes matching a selector, leaving the rest alone", () => {
      const notes = createTestNotes([
        { pitch: 60, start_time: 0, duration: 1 },
        { pitch: 60, start_time: 1, duration: 1 },
        { pitch: 62, start_time: 0, duration: 1 },
        { pitch: 62, start_time: 1, duration: 1 },
      ]);

      applyTransforms(notes, "C3: merge()", 4, 4);

      // C3 (60) merged into one spanning note; D3 (62) pair untouched
      expect(notes.filter((n) => n.pitch === 60)).toHaveLength(1);
      expect(notes.filter((n) => n.pitch === 62)).toHaveLength(2);
    });

    it("keeps the run end when a later note is fully contained", () => {
      const notes = createTestNotes([
        { pitch: 60, start_time: 0, duration: 3 },
        { pitch: 60, start_time: 1, duration: 1 }, // sits inside the first
      ]);

      applyTransforms(notes, "merge()", 4, 4);

      expect(notes).toStrictEqual([
        expect.objectContaining({ pitch: 60, start_time: 0, duration: 3 }),
      ]);
    });

    describe("gap tolerance", () => {
      it("merge(0) glues touching notes and splits on a gap", () => {
        const notes = createTestNotes([
          { pitch: 60, start_time: 0, duration: 1 },
          { pitch: 60, start_time: 1, duration: 1 }, // touches the first
          { pitch: 60, start_time: 3, duration: 1 }, // gap from 2..3
        ]);

        applyTransforms(notes, "merge(0)", 4, 4);

        expect(notes).toStrictEqual([
          expect.objectContaining({ pitch: 60, start_time: 0, duration: 2 }),
          expect.objectContaining({ pitch: 60, start_time: 3, duration: 1 }),
        ]);
      });

      it("merge(0) still merges overlapping notes", () => {
        const notes = createTestNotes([
          { pitch: 60, start_time: 0, duration: 2 },
          { pitch: 60, start_time: 1, duration: 2 }, // overlaps, ends at 3
        ]);

        applyTransforms(notes, "merge(0)", 4, 4);

        expect(notes).toStrictEqual([
          expect.objectContaining({ pitch: 60, start_time: 0, duration: 3 }),
        ]);
      });

      it("merge(n/8) glues notes within an eighth-note gap, splits on a wider gap", () => {
        const notes = createTestNotes([
          { pitch: 60, start_time: 0, duration: 1 }, // ends at 1
          { pitch: 60, start_time: 1.5, duration: 1 }, // gap 0.5 (an 8th) -> merges, ends 2.5
          { pitch: 60, start_time: 4, duration: 1 }, // gap 1.5 -> new run
        ]);

        applyTransforms(notes, "merge(n/8)", 4, 4);

        expect(notes).toStrictEqual([
          expect.objectContaining({ pitch: 60, start_time: 0, duration: 2.5 }),
          expect.objectContaining({ pitch: 60, start_time: 4, duration: 1 }),
        ]);
      });

      it("merge(n/8) tolerance is meter-invariant (same eighth in 6/8)", () => {
        // n/8 is 0.5 Ableton beats in any meter; a 0.5-beat gap still merges in 6/8.
        const notes = createTestNotes([
          { pitch: 60, start_time: 0, duration: 1 }, // ends at 1
          { pitch: 60, start_time: 1.5, duration: 0.5 }, // gap 0.5 -> merges, ends 2
          { pitch: 60, start_time: 3, duration: 1 }, // gap 1 -> new run
        ]);

        applyTransforms(notes, "merge(n/8)", 6, 8);

        expect(notes).toStrictEqual([
          expect.objectContaining({ pitch: 60, start_time: 0, duration: 2 }),
          expect.objectContaining({ pitch: 60, start_time: 3, duration: 1 }),
        ]);
      });

      it("warns and skips a non-zero bare-number tolerance", () => {
        expectMergeWarnsAndSkips("merge(0.25)", "note value");
      });

      it("warns and skips an integer beat-count tolerance", () => {
        expectMergeWarnsAndSkips("merge(2)", "note value");
      });

      it("warns and skips a bar-value tolerance (Nbar not accepted)", () => {
        expectMergeWarnsAndSkips("merge(1bar)", "Nbar");
      });

      it("warns about extra arguments and uses the first", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const notes = createTestNotes([
          { pitch: 60, start_time: 0, duration: 1 },
          { pitch: 60, start_time: 1, duration: 1 }, // touches -> merges under merge(0)
        ]);

        applyTransforms(notes, "merge(0, n/8)", 4, 4);

        expect(notes).toStrictEqual([
          expect.objectContaining({ pitch: 60, start_time: 0, duration: 2 }),
        ]);
        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining("using the first argument"),
        );
        warn.mockRestore();
      });
    });
  });

  describe("meter correctness", () => {
    // start_time/duration are Ableton (quarter-note) beats; a note-value grid is
    // meter-invariant in absolute time, so the count must come out right whatever
    // the meter. A dotted quarter is 1.5 Ableton beats = three 8th notes.
    it("ratchet(n/8) chops a dotted quarter into 3 eighths in 6/8", () => {
      const notes = createTestNote({ start_time: 0, duration: 1.5 });

      applyTransforms(notes, "ratchet(n/8)", 6, 8);

      expect(notes).toHaveLength(3);

      for (const note of notes) {
        expect(note.duration).toBeCloseTo(0.5); // an 8th = 0.5 Ableton beats
      }
    });

    it("ratchet(count) is meter-agnostic (same result via count form)", () => {
      const notes = createTestNote({ start_time: 0, duration: 1.5 });

      applyTransforms(notes, "ratchet(3)", 6, 8);

      expect(notes).toHaveLength(3);
      expect(notes[0]!.duration).toBeCloseTo(0.5);
    });

    it("honors a time selector against the meter's bar in 6/8", () => {
      // In 6/8 a bar is 3 Ableton beats. Bar-1 note at 0, bar-2 note at 3.
      const notes = createTestNotes([
        { pitch: 60, start_time: 0, duration: 1 },
        { pitch: 60, start_time: 3, duration: 1 },
      ]);

      applyTransforms(notes, "2|*: ratchet(2)", 6, 8);

      expect(notes.filter((n) => n.start_time < 3)).toHaveLength(1); // bar 1 untouched
      expect(notes.filter((n) => n.start_time >= 3)).toHaveLength(2); // bar 2 split
    });
  });

  describe("composition with later statements", () => {
    it("a ratchet after a ratchet stacks (2 then 2 = 4 pieces)", () => {
      const notes = createTestNote({ start_time: 0, duration: 1 });

      applyTransforms(notes, "ratchet(2)\nratchet(2)", 4, 4);

      expect(notes).toHaveLength(4);
      expect(notes[0]!.duration).toBeCloseTo(0.25);
    });

    it("merge after ratchet round-trips back to one note", () => {
      const notes = createTestNote({ start_time: 0, duration: 1 });

      applyTransforms(notes, "ratchet(4)\nmerge()", 4, 4);

      expect(notes).toStrictEqual([
        expect.objectContaining({ pitch: 60, start_time: 0, duration: 1 }),
      ]);
    });

    it("a transform after merge sees the rebuilt note.count", () => {
      const notes = createTestNotes([
        { pitch: 60, start_time: 0, duration: 1 },
        { pitch: 60, start_time: 1, duration: 1 },
        { pitch: 60, start_time: 2, duration: 1 },
      ]);

      // 3 same-pitch notes merge to 1, so note.count is 1 afterward
      applyTransforms(notes, "merge()\nvelocity = note.count * 10", 4, 4);

      expect(notes).toHaveLength(1);
      expect(notes[0]!.velocity).toBe(10);
    });

    it("legato after a ratchet resolves next-note gaps over the rebuilt list", () => {
      // Ratchet only the C3 (into 2), leave the E3; then legato so each note
      // extends to the next distinct start over the NEW (rebuilt) note list.
      const notes = createTestNotes([
        { pitch: 60, start_time: 0, duration: 0.5 },
        { pitch: 64, start_time: 4, duration: 1 },
      ]);

      applyTransforms(notes, "C3: ratchet(2)\nduration = legato()", 4, 4);

      // ratchet -> C3 children at 0 and 0.25; legato extends child0 to 0.25,
      // child1 to 4 (next distinct start, the E3); the E3 is last and keeps its
      // duration (no clip length to fill to).
      expect(notes).toHaveLength(3);
      expect(notes[0]!.duration).toBeCloseTo(0.25); // 0 -> next start 0.25
      expect(notes[1]!.duration).toBeCloseTo(3.75); // 0.25 -> next start 4
    });
  });
});
