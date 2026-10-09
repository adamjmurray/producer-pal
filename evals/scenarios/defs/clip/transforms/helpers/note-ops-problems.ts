// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * What a note-count edit (roll, merge, repeat, split) must leave in the clip,
 * whether the model used a transform or wrote the notes itself. Each check
 * returns `null` when the notes are right, else a one-line reason. Times are
 * Ableton quarter beats.
 */

import { type NoteEvent } from "#src/notation/types.ts";
import {
  diffNotes,
  type ExpectedNote,
  notesMatch,
} from "../../helpers/clip-note-assertions.ts";

const EPS = 1e-6;

/**
 * Roll: every note becomes `parts` equal sub-notes filling its original span.
 *
 * @param before - Notes before the edit
 * @param after - Notes after the edit
 * @param parts - Sub-notes per original note
 * @returns Why the result is wrong, or null
 */
export function rollProblem(
  before: NoteEvent[],
  after: NoteEvent[],
  parts: number,
): string | null {
  const expected = before.flatMap((n) =>
    Array.from({ length: parts }, (_, i) => ({
      pitch: n.pitch,
      start: n.start_time + (i * n.duration) / parts,
      duration: n.duration / parts,
    })),
  );

  return matchProblem(after, expected);
}

/**
 * Repeat: every original note is kept and gets a copy `offset` beats later at
 * the same pitch and length. An original may end where its copy starts.
 *
 * @param before - Notes before the edit
 * @param after - Notes after the edit
 * @param offset - Beats between an original and its copy
 * @returns Why the result is wrong, or null
 */
export function repeatProblem(
  before: NoteEvent[],
  after: NoteEvent[],
  offset: number,
): string | null {
  const copies = before.map((n) => ({
    pitch: n.pitch,
    start: n.start_time + offset,
    duration: n.duration,
  }));
  const withOriginals = (trim: boolean): ExpectedNote[] => [
    ...before.map((n) => ({
      pitch: n.pitch,
      start: n.start_time,
      duration: trim ? Math.min(n.duration, offset) : n.duration,
    })),
    ...copies,
  ];

  // Live ends a note where a same-pitch note starts inside it, so an original
  // may come back cut short at its copy. Accept either, not a mix.
  return notesMatch(after, withOriginals(false))
    ? null
    : matchProblem(after, withOriginals(true));
}

/**
 * Merge: each pitch (drum lane) ends up as one note that starts with its first
 * hit and lasts at least to the end of its last hit.
 *
 * @param before - Notes before the edit
 * @param after - Notes after the edit
 * @returns Why the result is wrong, or null
 */
export function mergeProblem(
  before: NoteEvent[],
  after: NoteEvent[],
): string | null {
  const lanes = new Map<number, { start: number; end: number }>();

  for (const n of before) {
    const lane = lanes.get(n.pitch) ?? { start: Infinity, end: -Infinity };

    lane.start = Math.min(lane.start, n.start_time);
    lane.end = Math.max(lane.end, n.start_time + n.duration);
    lanes.set(n.pitch, lane);
  }

  const stray = after.filter((n) => !lanes.has(n.pitch));

  if (stray.length > 0) {
    return `notes on pitches that were not in the clip: ${stray.map((n) => n.pitch).join(", ")}`;
  }

  for (const [pitch, lane] of lanes) {
    const notes = after.filter((n) => n.pitch === pitch);

    if (notes.length !== 1) {
      return `pitch ${pitch}: expected 1 note, got ${notes.length}`;
    }

    const [note] = notes as [NoteEvent];

    if (Math.abs(note.start_time - lane.start) >= EPS) {
      return `pitch ${pitch}: should start at ${lane.start}, starts at ${note.start_time}`;
    }

    if (note.start_time + note.duration < lane.end - EPS) {
      return `pitch ${pitch}: should last until ${lane.end}, ends at ${note.start_time + note.duration}`;
    }
  }

  return null;
}

/**
 * Split: one held note is cut at exactly `cuts` into contiguous pieces of the
 * same pitch that cover the original from `0` to `length`.
 *
 * @param after - Notes after the edit
 * @param spec - The held note's pitch and length, and where it must be cut
 * @param spec.pitch - MIDI pitch of the held note
 * @param spec.length - Length of the held note in beats
 * @param spec.cuts - Cut positions in beats from the clip start, ascending
 * @returns Why the result is wrong, or null
 */
export function splitProblem(
  after: NoteEvent[],
  spec: { pitch: number; length: number; cuts: number[] },
): string | null {
  const notes = after.toSorted((a, b) => a.start_time - b.start_time);
  const starts = [0, ...spec.cuts];
  const ends = [...spec.cuts, spec.length];
  const actual = notes
    .map((n) => `p${n.pitch} ${n.start_time}-${n.start_time + n.duration}`)
    .join(", ");
  const wanted = starts.map((s, i) => `${s}-${ends[i]}`).join(", ");

  const right =
    notes.length === starts.length &&
    notes.every(
      (n, i) =>
        n.pitch === spec.pitch &&
        Math.abs(n.start_time - (starts[i] as number)) < EPS &&
        Math.abs(n.start_time + n.duration - (ends[i] as number)) < EPS,
    );

  return right ? null : `expected p${spec.pitch} ${wanted}; got ${actual}`;
}

/**
 * Compare notes to an exact expected set, with a readable diff on mismatch.
 *
 * @param after - Notes after the edit
 * @param expected - The exact notes the clip must hold
 * @returns Why the result is wrong, or null
 */
function matchProblem(
  after: NoteEvent[],
  expected: ExpectedNote[],
): string | null {
  return notesMatch(after, expected) ? null : diffNotes(after, expected);
}
