// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude Code (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { type TransformOutcome } from "#src/notation/transform/transformed-count.ts";
import {
  droppedDuplicatesNote,
  transformsChangedNothingNote,
  mutedNativeOpNote,
  mutedOverlapNote,
  mutedReplacedNote,
} from "#src/tools/clip/helpers/clip-entry-notes.ts";

describe("clip entry notes", () => {
  it("counts dropped duplicates, and says nothing for none", () => {
    expect(droppedDuplicatesNote(1)).toBe(
      "dropped 1 duplicate note at the same pitch and start",
    );
    expect(droppedDuplicatesNote(2)).toBe(
      "dropped 2 duplicate notes at the same pitch and start",
    );
    expect(droppedDuplicatesNote(0)).toBeNull();
  });

  it("counts replaced muted notes, and says nothing for none", () => {
    expect(mutedReplacedNote(1)).toBe(
      "replaced 1 muted note at the same pitch and start",
    );
    expect(mutedReplacedNote(3)).toBe(
      "replaced 3 muted notes at the same pitch and start",
    );
    expect(mutedReplacedNote(0)).toBeNull();
  });

  it("says which side an overlap shortened", () => {
    expect(mutedOverlapNote(2, true)).toBe(
      "2 muted notes shortened by an overlapping note",
    );
    expect(mutedOverlapNote(1, false)).toBe(
      "1 note shortened by an overlapping muted note",
    );
    expect(mutedOverlapNote(2, false)).toBe(
      "2 notes shortened by an overlapping muted note",
    );
    expect(mutedOverlapNote(0, true)).toBeNull();
  });

  it("names a native op on muted notes, and says nothing for none", () => {
    expect(mutedNativeOpNote("quantized", 2)).toBe("quantized 2 muted notes");
    expect(mutedNativeOpNote("copied", 1)).toBe("copied 1 muted note");
    expect(mutedNativeOpNote("copied", 0)).toBeNull();
  });

  describe("transformsChangedNothingNote", () => {
    const outcome = (matched: number): TransformOutcome => ({
      changed: new Set(),
      deleted: [],
      original: new Map(),
      roots: new Map(),
      selected: true,
      failed: false,
      matched: new Set(
        Array.from({ length: matched }, (_, pitch) => ({
          pitch,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1,
        })),
      ),
    });

    it("tells a selector that matched nothing from an expression that changed nothing", () => {
      expect(transformsChangedNothingNote(outcome(0), { transformed: 0 })).toBe(
        "no notes matched the selector",
      );
      expect(transformsChangedNothingNote(outcome(1), { transformed: 0 })).toBe(
        "the expression didn't change the 1 matched note",
      );
      expect(transformsChangedNothingNote(outcome(5), { transformed: 0 })).toBe(
        "the expression changed none of the 5 matched notes",
      );
    });

    it("says nothing when no transform ran, or a note changed or was deleted", () => {
      expect(transformsChangedNothingNote(undefined, {})).toBeNull();
      expect(
        transformsChangedNothingNote(
          { ...outcome(0), selected: false },
          { transformed: 0 },
        ),
      ).toBeNull();
      expect(
        transformsChangedNothingNote(
          { ...outcome(2), failed: true },
          { transformed: 0 },
        ),
      ).toBeNull();
      expect(
        transformsChangedNothingNote(outcome(3), { transformed: 1 }),
      ).toBeNull();
      expect(
        transformsChangedNothingNote(outcome(3), {
          transformed: 0,
          deletedNotes: 2,
        }),
      ).toBeNull();
    });
  });
});
