// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, type MockInstance, vi } from "vitest";
import { applyTransforms } from "#src/notation/transform/transform-evaluator.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  createTestNote,
  createTestNotes,
} from "./evaluator/transform-evaluator-test-helpers.ts";

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
 * Two C3 quarter notes back to back, on beats 1 and 2 — the smallest input
 * where a merge has something to glue and a repeat has something to collide
 * with.
 */
export const TOUCHING_C3_PAIR: Partial<NoteEvent>[] = [
  { pitch: 60, start_time: 0, duration: 1 },
  { pitch: 60, start_time: 1, duration: 1 },
];

/** Three C3 quarter notes back to back, on beats 1, 2 and 3. */
export const TOUCHING_C3_TRIO: Partial<NoteEvent>[] = [
  ...TOUCHING_C3_PAIR,
  { pitch: 60, start_time: 2, duration: 1 },
];

/**
 * Builds notes from `input`, runs a transforms string over them, and asserts
 * the resulting notes in order — each expected entry is matched with
 * `objectContaining`, so properties the transform leaves alone stay unspelled.
 * Comparing the whole list also pins the note count, which is the point for
 * transforms that add or remove notes.
 *
 * @param input - Per-note property overrides for the input notes
 * @param transformString - The transforms string to apply
 * @param expected - Expected properties of each resulting note, in order
 * @param meter - Time signature as [numerator, denominator]; defaults to 4/4
 * @returns The transformed notes, for any further assertions
 */
export function expectTransformedNotes(
  input: Partial<NoteEvent>[],
  transformString: string,
  expected: Partial<NoteEvent>[],
  meter: [numerator: number, denominator: number] = [4, 4],
): NoteEvent[] {
  const notes = createTestNotes(input);

  applyTransforms(notes, transformString, meter[0], meter[1]);

  expect(notes).toStrictEqual(
    expected.map((props) => expect.objectContaining(props)),
  );

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

/**
 * Silence console.warn and build the notes a warn-and-skip test runs against.
 * Restore the spy when the test is done.
 *
 * @param noteOverrides - Per-note property overrides for the input notes
 * @returns The warn spy and the notes
 */
export function warnSpyWithNotes(noteOverrides: Partial<NoteEvent>[]): {
  warn: MockInstance;
  notes: NoteEvent[];
} {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

  return { warn, notes: createTestNotes(noteOverrides) };
}

/**
 * The single-note form of {@link warnSpyWithNotes}.
 *
 * @param overrides - Property overrides for the one input note
 * @returns The warn spy and a one-note list
 */
export function warnSpyWithNote(overrides: Partial<NoteEvent> = {}): {
  warn: MockInstance;
  notes: NoteEvent[];
} {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

  return { warn, notes: createTestNote(overrides) };
}
