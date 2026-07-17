// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { type ClipContext } from "#src/notation/transform/helpers/transform-evaluator-helpers.ts";
import { splitNotes } from "#src/notation/transform/helpers/note-cut-helpers.ts";
import { type NoteOp } from "#src/notation/transform/parser/transform-parser.ts";
import { applyTransforms } from "#src/notation/transform/transform-evaluator.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import * as console from "#src/shared/v8-max-console.ts";
import {
  createTestNote,
  createTestNotes,
} from "./evaluator/transform-evaluator-test-helpers.ts";
import { expectNotePieces } from "./transform-test-helpers.ts";

// Build a split op whose args are bar|beat points given in absolute musical
// beats — mirrors what the grammar produces, for tests that exercise splitNotes
// directly (edge branches the final zero-duration sweep would otherwise hide).
function splitOp(...musicalBeats: number[]): NoteOp {
  return {
    kind: "noteOp",
    name: "split",
    args: musicalBeats.map((b) => ({ type: "barBeatPoint", musicalBeats: b })),
  };
}

// A note long enough to hold far more than the 64-piece cap, for the clamp tests.
function longNote(): NoteEvent {
  return {
    pitch: 60,
    start_time: 0,
    duration: 100,
    velocity: 100,
    probability: 1,
  };
}

// Interior cut points at beats 1..count.
function cutPointsAt(count: number): number[] {
  return Array.from({ length: count }, (_, i) => i + 1);
}

describe("note-count operation: split", () => {
  it("cuts a note at explicit clip bar|beat positions", () => {
    // One note spanning bars 1-2 (8 Ableton beats); cut at 2|1 (beat 4) and
    // 2|3 (beat 6).
    const notes = createTestNote({ start_time: 0, duration: 8 });

    applyTransforms(notes, "split(2|1, 2|3)", 4, 4);

    expectNotePieces(notes, [
      [0, 4],
      [4, 2],
      [6, 2],
    ]);
  });

  it("cuts at a sub-beat position", () => {
    const notes = createTestNote({ start_time: 0, duration: 1 });

    applyTransforms(notes, "split(1|1.5)", 4, 4);

    expectNotePieces(notes, [
      [0, 0.5],
      [0.5, 0.5],
    ]);
  });

  it("inherits velocity, probability, and deviation from the parent", () => {
    const notes = createTestNote({
      start_time: 0,
      duration: 2,
      velocity: 90,
      probability: 0.7,
      velocity_deviation: 12,
    });

    applyTransforms(notes, "split(1|2)", 4, 4);

    for (const note of notes) {
      expect(note).toMatchObject({
        velocity: 90,
        probability: 0.7,
        velocity_deviation: 12,
      });
    }
  });

  it("shares absolute positions across every matched note", () => {
    const notes = createTestNotes([
      { pitch: 60, start_time: 0, duration: 2 },
      { pitch: 62, start_time: 2, duration: 2 },
    ]);

    // Each position cuts whichever note contains it: 1|2 (beat 1) lands inside
    // the first note, 1|4 (beat 3) inside the second.
    applyTransforms(notes, "split(1|2, 1|4)", 4, 4);

    expect(notes).toStrictEqual([
      expect.objectContaining({ pitch: 60, start_time: 0, duration: 1 }),
      expect.objectContaining({ pitch: 60, start_time: 1, duration: 1 }),
      expect.objectContaining({ pitch: 62, start_time: 2, duration: 1 }),
      expect.objectContaining({ pitch: 62, start_time: 3, duration: 1 }),
    ]);
  });

  it("only splits notes matching a pitch selector", () => {
    const notes = createTestNotes([
      { pitch: 36, start_time: 0, duration: 2 },
      { pitch: 60, start_time: 0, duration: 2 },
    ]);

    applyTransforms(notes, "C1: split(1|2)", 4, 4);

    // Rebuilt list is sorted by start_time then pitch, so the untouched C3 at
    // beat 0 sorts between the two kick pieces.
    expect(notes).toStrictEqual([
      expect.objectContaining({ pitch: 36, start_time: 0, duration: 1 }),
      expect.objectContaining({ pitch: 60, start_time: 0, duration: 2 }),
      expect.objectContaining({ pitch: 36, start_time: 1, duration: 1 }),
    ]);
  });

  it("only splits notes matching a time selector", () => {
    const notes = createTestNotes([
      { start_time: 0, duration: 4 },
      { start_time: 4, duration: 4 },
    ]);

    // Selector limits to bar 2; only the second note is cut at 2|3 (beat 6).
    applyTransforms(notes, "2|*: split(2|3)", 4, 4);

    expectNotePieces(notes, [
      [0, 4],
      [4, 2],
      [6, 2],
    ]);
  });

  it("resolves positions in the clip's meter (6/8)", () => {
    // One bar in 6/8 is 3 Ableton beats, so 2|1 is at Ableton beat 3.
    const notes = createTestNote({ start_time: 0, duration: 6 });

    applyTransforms(notes, "split(2|1)", 6, 8);

    expectNotePieces(notes, [
      [0, 3],
      [3, 3],
    ]);
  });

  it("de-duplicates repeated positions (no zero-width sliver)", () => {
    const notes = createTestNote({ start_time: 0, duration: 2 });

    applyTransforms(notes, "split(1|2, 1|2)", 4, 4);

    expectNotePieces(notes, [
      [0, 1],
      [1, 1],
    ]);
  });

  it("de-duplicates positions when splitting directly (zero-width sliver, normally hidden by the evaluator sweep)", () => {
    // applyTransforms' final zero-duration sweep would delete a missed-dedupe
    // sliver before it could be observed, so exercise splitNotes directly. Beat
    // 4 is repeated; a correct dedupe yields three pieces, not a fourth 0-width.
    const result = splitNotes(
      createTestNote({ start_time: 0, duration: 8 }),
      splitOp(4, 4, 6),
      4,
    );

    expectNotePieces(result, [
      [0, 4],
      [4, 2],
      [6, 2],
    ]);
  });

  it("sorts unordered positions before cutting", () => {
    // Positions given descending (6 then 4); without the sort the boundaries run
    // [0, 6, 4, 8] and produce a negative-duration middle piece.
    const result = splitNotes(
      createTestNote({ start_time: 0, duration: 8 }),
      splitOp(6, 4),
      4,
    );

    expectNotePieces(result, [
      [0, 4],
      [4, 2],
      [6, 2],
    ]);
  });

  it("treats a position on the note's own boundary as not a cut", () => {
    const notes = createTestNote({ start_time: 0, duration: 1 });

    // 1|1 is the note's onset and 1|2 its offset — both boundaries, not cuts.
    applyTransforms(notes, "split(1|1, 1|2)", 4, 4);

    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ start_time: 0, duration: 1 });
  });

  it("re-derives note.index for a transform after the split", () => {
    const notes = createTestNote({ start_time: 0, duration: 4 });

    applyTransforms(
      notes,
      "split(1|2, 1|3, 1|4)\nvelocity = 50 + note.index * 10",
      4,
      4,
    );

    expect(notes.map((n) => n.velocity)).toStrictEqual([50, 60, 70, 80]);
  });

  it("leaves a note containing none of the positions unchanged (with a warning)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const notes = createTestNote({ start_time: 0, duration: 1 });

    applyTransforms(notes, "split(2|1)", 4, 4);

    expect(notes).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("contained none of the given positions"),
    );
    warn.mockRestore();
  });

  it("warns and skips when no positions are given", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const notes = createTestNote({ start_time: 0, duration: 1 });

    applyTransforms(notes, "split()", 4, 4);

    expect(notes).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("needs one or more bar|beat positions"),
    );
    warn.mockRestore();
  });

  it("leaves a zero/negative-duration note unchanged", () => {
    // Exercised via splitNotes directly: the final evaluator sweep would delete
    // a zero-duration note before it could be observed here.
    const note: NoteEvent = {
      pitch: 60,
      start_time: 0,
      duration: 0,
      velocity: 100,
      probability: 1,
    };

    const result = splitNotes([note], splitOp(0.5), 4);

    expect(result).toStrictEqual([note]);
  });

  describe("sync (arrangement-aligned positions)", () => {
    // An arrangement clip whose origin sits at bar 5 (4 musical beats/bar →
    // arrangementStart = 16 musical beats). A note at clip-relative 0 spans the
    // clip's first two bars.
    const arrangementCtx: ClipContext = {
      clipDuration: 8,
      clipIndex: 0,
      clipCount: 1,
      barDuration: 4,
      arrangementStart: 16,
    };

    it("interprets positions against the arrangement timeline", () => {
      const notes = createTestNote({ start_time: 0, duration: 8 });

      // 6|1 is arrangement musical beat 20; the clip starts at beat 16, so the
      // cut lands at clip-relative beat 4.
      applyTransforms(notes, "split(6|1, sync)", 4, 4, arrangementCtx);

      expectNotePieces(notes, [
        [0, 4],
        [4, 4],
      ]);
    });

    it("falls back to clip-relative (with a warning) on a session clip", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const sessionCtx: ClipContext = {
        clipDuration: 8,
        clipIndex: 0,
        clipCount: 1,
        barDuration: 4,
      };
      const notes = createTestNote({ start_time: 0, duration: 8 });

      // No arrangement origin: 1|3 is treated clip-relative (beat 2).
      applyTransforms(notes, "split(1|3, sync)", 4, 4, sessionCtx);

      expectNotePieces(notes, [
        [0, 2],
        [2, 6],
      ]);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("sync ignored on session clip"),
      );
      warn.mockRestore();
    });
  });

  it("keeps the maximum pieces without clamping at the boundary", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    // 63 interior cuts produce exactly 64 pieces — the cap, not past it — so
    // there is no clamp and no warning.
    const result = splitNotes([longNote()], splitOp(...cutPointsAt(63)), 4);

    expect(result).toHaveLength(64);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("clamps one cut past the cap to the maximum pieces and warns", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    // 64 interior cuts would make 65 pieces (one past the cap); the op keeps 64.
    const result = splitNotes([longNote()], splitOp(...cutPointsAt(64)), 4);

    expect(result).toHaveLength(64);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("clamped"));
    warn.mockRestore();
  });

  it("clamps an excessive number of pieces and warns", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    // A long note and 70 interior cut points (beats 1..70) exceed the 64-piece
    // cap; the op keeps 64 pieces (63 cuts) and warns.
    const result = splitNotes([longNote()], splitOp(...cutPointsAt(70)), 4);

    expect(result).toHaveLength(64);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("clamped"));
    warn.mockRestore();
  });
});
