// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude Code (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  droppedDuplicatesNote,
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
});
