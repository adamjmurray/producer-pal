// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { expect } from "vitest";
import { applyTransforms } from "#src/notation/transform/transform-evaluator.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import { createTestNotes } from "./evaluator/transform-evaluator-test-helpers.ts";

/**
 * Builds notes from the given overrides, runs a transforms string over them in
 * 4/4, and asserts the resulting velocities in list order. Comparing the whole
 * velocity list also pins the note count, so notes removed by the deletion
 * sweep are caught.
 *
 * @param noteOverrides - Per-note property overrides for the input notes
 * @param transformString - The transforms string to apply
 * @param expectedVelocities - Velocity of each surviving note, in order
 * @returns The transformed notes, for any further assertions
 */
export function expectVelocitiesAfter(
  noteOverrides: Partial<NoteEvent>[],
  transformString: string,
  expectedVelocities: number[],
): NoteEvent[] {
  const notes = createTestNotes(noteOverrides);

  applyTransforms(notes, transformString, 4, 4);

  expect(notes.map((note) => note.velocity)).toStrictEqual(expectedVelocities);

  return notes;
}

/**
 * Asserts a note list matches the given [start_time, duration] pairs in order,
 * ignoring the properties each piece inherits from its parent note.
 *
 * @param notes - The notes to check
 * @param pieces - Expected [start_time, duration] pairs, in order
 */
export function expectNotePieces(
  notes: NoteEvent[],
  pieces: [start: number, duration: number][],
): void {
  expect(notes).toStrictEqual(
    pieces.map(([start_time, duration]) =>
      expect.objectContaining({ start_time, duration }),
    ),
  );
}
