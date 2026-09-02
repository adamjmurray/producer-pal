// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type NoteEvent } from "#src/notation/types.ts";
import * as console from "../transform-warning-label.ts";
import {
  type BarBeatPointNode,
  type NoteOp,
} from "../parser/transform-parser.ts";

// Per-note ceiling on pieces a note-count op may produce — bounds note
// explosion. Shared by ratchet (a roll) and split (explicit cuts). A note cut
// into more than this many pieces is well past any musical use.
export const MAX_NOTE_PIECES = 64;

// Floating-point slack for grid-line / cut-point comparisons (one part in a
// billion beats). A point within this of a note's own onset/offset is treated as
// a boundary, not an interior cut.
export const GRID_EPSILON = 1e-9;

/**
 * Split a note at the given absolute cut positions into end-to-end pieces, each
 * inheriting the parent's pitch/velocity/probability/deviation. The boundaries
 * run [start, ...cuts, end], so end pieces may be partial slivers.
 * @param note - Note to divide (must have at least one cut)
 * @param cuts - Interior cut positions, ascending
 * @returns The child notes, in time order
 */
export function splitNoteAtCuts(note: NoteEvent, cuts: number[]): NoteEvent[] {
  const boundaries = [
    note.start_time,
    ...cuts,
    note.start_time + note.duration,
  ];
  const children: NoteEvent[] = [];

  for (let k = 0; k < boundaries.length - 1; k++) {
    // k is bounded by boundaries.length - 1, so both indices are in range.
    const from = boundaries[k] as number;
    const to = boundaries[k + 1] as number;

    children.push({ ...note, start_time: from, duration: to - from });
  }

  return children;
}

/**
 * Split matched notes at explicit clip-relative bar|beat positions. Unlike the
 * ratchet grid form (regularly spaced cut lines), the cut lines here are the
 * arbitrary, possibly unequal positions the user named. Each position only cuts
 * a note when it falls strictly inside that note's span; a note containing none
 * of the positions is left unchanged (with a warning). Positions are shared
 * across all matched notes (absolute clip coordinates), so a single position
 * subdivides every note it lands inside.
 *
 * With `op.sync`, the positions are absolute arrangement-timeline coordinates;
 * they are shifted into clip-relative space by the clip's arrangement origin.
 * Session clips have no origin, so sync degrades to clip-relative (mirrors the
 * cyclical `sync` keyword's session-clip fallback).
 * @param matched - Notes selected by the op
 * @param op - The split operation (args are bar|beat cut positions)
 * @param denominator - Time signature denominator (musical beats -> Ableton)
 * @param arrangementStart - Clip's arrangement origin in musical beats, or
 *   undefined for session clips (only consulted in sync mode)
 * @returns The split note list (children replace each divided note)
 */
export function splitNotes(
  matched: NoteEvent[],
  op: NoteOp,
  denominator: number,
  arrangementStart?: number,
): NoteEvent[] {
  if (op.args.length === 0) {
    console.warn(
      "split() needs one or more bar|beat positions, e.g. split(2|1, 2|3); skipping",
    );

    return matched;
  }

  // In sync mode the positions are arrangement-absolute; subtract the clip's
  // origin to bring them into the clip-relative space the notes live in.
  let originMusicalBeats = 0;

  if (op.sync) {
    if (arrangementStart == null) {
      console.warn("sync ignored on session clip — split is clip-relative");
    } else {
      originMusicalBeats = arrangementStart;
    }
  }

  // Cut positions in Ableton beats, ascending and de-duplicated (so a repeated
  // position never makes a zero-width sliver).
  const abletonScale = 4 / denominator; // musical beats -> Ableton beats
  const points = resolveSplitPoints(op.args, originMusicalBeats, abletonScale);

  const out: NoteEvent[] = [];
  let uncut = 0;
  let clamped = 0;

  for (const note of matched) {
    if (note.duration <= 0) {
      out.push(note); // nothing to divide
      continue;
    }

    const end = note.start_time + note.duration;
    const cuts = points.filter(
      (p) => p > note.start_time + GRID_EPSILON && p < end - GRID_EPSILON,
    );

    if (cuts.length === 0) {
      out.push(note); // note contains none of the positions — leave as-is
      uncut++;
      continue;
    }

    if (cuts.length + 1 > MAX_NOTE_PIECES) {
      cuts.length = MAX_NOTE_PIECES - 1; // keep pieces <= the cap
      clamped++;
    }

    out.push(...splitNoteAtCuts(note, cuts));
  }

  if (uncut > 0) {
    console.warn(
      `split: ${uncut} note(s) contained none of the given positions and were left unchanged`,
    );
  }

  if (clamped > 0) {
    console.warn(
      `split: ${clamped} note(s) clamped to the max of ${MAX_NOTE_PIECES} pieces`,
    );
  }

  return out;
}

/**
 * Resolve split bar|beat-point args to ascending, de-duplicated Ableton beats.
 * The grammar guarantees every split arg is a BarBeatPointNode carrying absolute
 * musical beats, so the cast is safe (no other arg shape can reach here).
 * @param args - The split op's arguments (bar|beat points)
 * @param originMusicalBeats - Origin to subtract (clip's arrangement start in
 *   musical beats for sync mode; 0 for clip-relative)
 * @param abletonScale - Musical-to-Ableton beat scale (4 / denominator)
 * @returns Cut positions in Ableton beats, ascending and unique
 */
function resolveSplitPoints(
  args: NoteOp["args"],
  originMusicalBeats: number,
  abletonScale: number,
): number[] {
  const beats = args.map(
    (arg) =>
      ((arg as BarBeatPointNode).musicalBeats - originMusicalBeats) *
      abletonScale,
  );

  return [...new Set(beats)].toSorted((a, b) => a - b);
}
