// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import { type ClipContext } from "#src/notation/transform/helpers/transform-context.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import {
  type ClipReasons,
  newClipReasons,
} from "../../../helpers/entries/clip-reasons.ts";
import { reportCodeWriteEffects } from "../../../helpers/notes/muted-note-effects.ts";
import { applyTransformsToExistingNotes } from "../../../helpers/notes/note-transforms.ts";
import { handleNoteUpdates } from "../../../helpers/notes/note-updates.ts";
import { held, type HeldNote, liveClip } from "../notes-mock-test-helpers.ts";

const C3 = 60;
const E3 = 64;
const SHORTENED = "shortened by the next note at the same pitch";

const ctx: ClipContext = {
  clipDuration: 4,
  clipIndex: 0,
  clipCount: 1,
  barDuration: 4,
  timeSigDenominator: 4,
};

describe("notes Live cut short at one pitch", () => {
  let reasons: ClipReasons;

  beforeEach(() => {
    reasons = newClipReasons();
  });

  /**
   * Run a notes update on a clip that cuts overlaps the way Live does.
   * @param existing - The clip's notes
   * @param notes - The new notes
   * @param meter - Time signature [numerator, denominator]
   * @returns The clip and what its entry would say
   */
  function update(
    existing: HeldNote[],
    notes: string,
    meter: [number, number] = [4, 4],
  ): { clip: LiveAPI; said: string | undefined } {
    const clip = liveClip(existing);

    handleNoteUpdates(
      clip,
      reasons,
      notes,
      undefined,
      undefined,
      meter[0],
      meter[1],
      ctx,
      undefined,
    );

    return { clip, said: reasons.said.get("123")?.join("; ") };
  }

  describe("a notes write", () => {
    it("counts the notes the next note cut, in 6/8 as in 4/4", () => {
      // In 6/8 a quarter note is two beats long, so notes one beat apart overlap
      const { said } = update([], "n/4 C1 1|1,2,3", [6, 8]);

      expect(said).toBe(`2 notes ${SHORTENED}`);
    });

    it("says 1 note, not 1 notes", () => {
      expect(update([], "n/2 C3 1|1,2").said).toBe(`1 note ${SHORTENED}`);
    });

    it("counts a note a new one cut that was already in the clip", () => {
      expect(update([held(C3, 0, { duration: 2 })], "C3 1|2").said).toBe(
        `1 note ${SHORTENED}`,
      );
    });

    it("says nothing, and reads nothing back, when notes don't overlap", () => {
      const { clip, said } = update([], "n/8 C3 1|1,2,3", [6, 8]);
      const reads = vi
        .mocked(clip.call)
        .mock.calls.filter(([method]) => method === "get_notes_extended");

      expect(said).toBeUndefined();
      // One read before the write and one for the count
      expect(reads).toHaveLength(2);
    });

    it("says nothing for overlapping notes at different pitches", () => {
      expect(update([], "n/2 C3 1|1 E3 1|2").said).toBeUndefined();
    });

    it("says nothing about a muted note's cut, which has its own note", () => {
      const { said } = update([held(E3, 1, { mute: 1 })], "n/2 E3 1|1");

      expect(said).toBe("1 note shortened by an overlapping muted note");
    });

    it("counts a muted cut and a plain one apart", () => {
      const { said } = update(
        [held(E3, 1, { mute: 1 })],
        "n/2 E3 1|1 n/2 C3 2|1,2",
      );

      expect(said).toBe(
        `1 note ${SHORTENED}; 1 note shortened by an overlapping muted note`,
      );
    });
  });

  describe("a write with no new notes", () => {
    it("counts the notes a transform made overlap", () => {
      const clip = liveClip([held(C3, 0), held(C3, 1)]);

      applyTransformsToExistingNotes(
        clip,
        reasons,
        undefined,
        "duration = 3",
        4,
        4,
        ctx,
      );

      expect(reasons.said.get("123")).toStrictEqual([`1 note ${SHORTENED}`]);
    });
  });

  describe("a code write", () => {
    it("counts the notes the code's overlaps cut", () => {
      const clip = liveClip([]);
      const written = [
        { pitch: C3, start_time: 0, duration: 2, velocity: 100 },
        { pitch: C3, start_time: 1, duration: 2, velocity: 100 },
      ] as NoteEvent[];

      clip.call("add_new_notes", { notes: written });
      reportCodeWriteEffects(clip, reasons, "123", {
        collisions: 0,
        written,
        muted: [],
      });

      expect(reasons.said.get("123")).toStrictEqual([`1 note ${SHORTENED}`]);
    });
  });
});
