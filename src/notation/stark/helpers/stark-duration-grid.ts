// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * The Stark serializer's note-value grid: snapping a duration to a legal value,
 * flooring one to a cap, and decomposing a gap into rests.
 */

import {
  type StarkDuration,
  type StarkDurationN,
} from "#src/notation/stark/parser/stark-parser.ts";
import { durationBeats } from "#src/notation/stark/stark-config.ts";
import { SAME_TIME_EPSILON } from "#src/shared/config.ts";

/** A spellable Stark note value: its Ableton beat length and the `/N[.]` text. */
export interface DurationGridEntry {
  /** Length in Ableton beats — the identity the serializer factors/advances on. */
  beats: number;
  /** Text after the `/` (e.g. "4", "4."). */
  token: string;
}

// The legal note-value grid, coarsest first: the five plain values (/1…/16) with
// their dotted (×1.5, `N.`) and triplet (×2/3, `Nt`) partners. Every duration the
// serializer emits snaps to one of these fifteen. Plain and dotted `beats` are
// exact binary fractions; each triplet `beats` comes from durationBeats — the
// single source of truth for the beat math — so a triplet snaps bit-exactly to
// itself and round-trips. Order stays strictly descending (greedy rest-fill +
// tie-to-shorter).
const tripletBeats = (n: StarkDurationN): number =>
  durationBeats({ n, dotted: false, triplet: true });

const DURATION_GRID: ReadonlyArray<DurationGridEntry> = [
  { beats: 6, token: "1." }, // coarsest — MAX_GRID_BEATS derives from this entry
  { beats: 4, token: "1" },
  { beats: 3, token: "2." },
  { beats: tripletBeats(1), token: "1t" }, // 8/3 ≈ 2.667
  { beats: 2, token: "2" },
  { beats: 1.5, token: "4." },
  { beats: tripletBeats(2), token: "2t" }, // 4/3 ≈ 1.333
  { beats: 1, token: "4" },
  { beats: 0.75, token: "8." },
  { beats: tripletBeats(4), token: "4t" }, // 2/3 ≈ 0.667
  { beats: 0.5, token: "8" },
  { beats: 0.375, token: "16." },
  { beats: tripletBeats(8), token: "8t" }, // 1/3 ≈ 0.333
  { beats: 0.25, token: "16" },
  { beats: tripletBeats(16), token: "16t" }, // 1/6 ≈ 0.167
];

/**
 * The longest duration Stark can spell: the coarsest grid note value (a dotted
 * whole note, 6 beats). Stark has no tie or multi-bar duration token, so a note
 * held longer than this snaps down to it — a lossy truncation the serializer
 * warns about (there is no rest compensation that can restore a note's own tail).
 */
export const MAX_GRID_BEATS: number = (DURATION_GRID[0] as DurationGridEntry)
  .beats;

/**
 * Snap an arbitrary duration to the nearest grid note value. On an exact tie the
 * shorter value wins, so any shortfall is filled by a compensating rest rather
 * than overshooting and delaying later onsets.
 * @param beats - Duration in Ableton beats
 * @returns The nearest grid entry (its beats + `/N[.]` token)
 */
export function snapDuration(beats: number): DurationGridEntry {
  // The grid is a non-empty module constant; index 0 is always present.
  let best = DURATION_GRID[0] as DurationGridEntry;
  let bestDiff = Math.abs(beats - best.beats);

  for (const entry of DURATION_GRID) {
    const diff = Math.abs(beats - entry.beats);

    // `<=` so a tie prefers the later (shorter, coming later in this descending
    // grid) value — the safe undershoot.
    if (diff <= bestDiff) {
      best = entry;
      bestDiff = diff;
    }
  }

  return best;
}

/**
 * The largest grid note value that fits within a cap (`beats ≤ capBeats`). Used
 * to trim a note that overlaps the following onset down to legato: the emitted
 * sustain ends no later than the next note starts, so that onset — and every
 * onset after it — stays exact. Falls back to the shortest grid value when the
 * cap is below even that (sub-resolution onset spacing), since a note token can
 * never be zero-length.
 * @param capBeats - The maximum allowed length in Ableton beats
 * @returns The coarsest grid entry that fits within the cap
 */
export function floorDuration(capBeats: number): DurationGridEntry {
  // DURATION_GRID is strictly descending, so the first entry within the cap is
  // the largest that fits.
  for (const entry of DURATION_GRID) {
    if (entry.beats <= capBeats + SAME_TIME_EPSILON) {
      return entry;
    }
  }

  // The grid's last (shortest) entry is the floor when nothing else fits.
  return DURATION_GRID.at(-1) as DurationGridEntry;
}

/**
 * Build the grid entry for a parsed { n, dotted } note value — used to spell the
 * line-type defaults (bass /4, chords /1, …) the serializer factors against.
 * @param duration - The parsed note value
 * @returns Its grid entry (beats + `/N[.]` token)
 */
export function durationEntry(duration: StarkDuration): DurationGridEntry {
  const modifier = duration.dotted ? "." : duration.triplet ? "t" : "";

  return {
    beats: durationBeats(duration),
    token: `${duration.n}${modifier}`,
  };
}

// Every grid value is a whole number of these: a 16th is 6, a 16th triplet 4.
const UNITS_PER_BEAT = 24;
const GRID_UNITS: ReadonlyArray<number> = DURATION_GRID.map((entry) =>
  Math.round(entry.beats * UNITS_PER_BEAT),
);
const COARSEST_UNITS = GRID_UNITS[0] as number;

/**
 * Decompose a gap into grid note values that fill it, largest first. The fill
 * is exact wherever the grid can spell the gap: taking the largest value that
 * fits each time is not enough, because a 16th plus a 16th triplet fills 5/12
 * of a beat while a dotted 16th leaves a remainder — and a dropped remainder
 * shifts every later onset. Only what no value can spell is dropped (the
 * off-16th snap the serializer documents).
 * @param gapBeats - Gap length in Ableton beats
 * @returns Grid entries (each an /N[.]) summing to about the gap
 */
export function restNoteValues(gapBeats: number): DurationGridEntry[] {
  const rests: DurationGridEntry[] = [];
  let units = Math.floor((gapBeats + SAME_TIME_EPSILON) * UNITS_PER_BEAT);

  // A long gap is mostly the coarsest value; search only its tail.
  while (units >= COARSEST_UNITS * 2) {
    rests.push(DURATION_GRID[0] as DurationGridEntry);
    units -= COARSEST_UNITS;
  }

  const firstValue = fewestValues(Math.max(units, 0));

  // Walk down to the largest length the grid can spell.
  while (units > 0 && firstValue[units] == null) {
    units--;
  }

  while (units > 0) {
    const index = firstValue[units] as number;

    rests.push(DURATION_GRID[index] as DurationGridEntry);
    units -= GRID_UNITS[index] as number;
  }

  return rests;
}

/**
 * The note value closest to a note's real length that leaves an exactly
 * spellable rest (or none) before the next onset. A 16th hit a third of a beat
 * before the next one would leave 1/12 of a beat that no rest can spell, so the
 * next onset would land early; a 16th triplet plus a 16th-triplet rest lands it.
 * @param naturalBeats - The note's real length in Ableton beats
 * @param capBeats - Beats from this onset to the next one
 * @returns The note value, or null when the onsets are off the grid and no
 *   value makes the gap exact
 */
export function exactDurationBefore(
  naturalBeats: number,
  capBeats: number,
): DurationGridEntry | null {
  const capUnits = Math.round(capBeats * UNITS_PER_BEAT);

  if (Math.abs(capUnits / UNITS_PER_BEAT - capBeats) > SAME_TIME_EPSILON) {
    return null;
  }

  // Past two coarsest values every remainder is spellable, so cap the search.
  const spellable = fewestValues(Math.min(capUnits, COARSEST_UNITS * 2));
  let best: DurationGridEntry | null = null;
  let bestDiff = Infinity;

  for (const [index, entry] of DURATION_GRID.entries()) {
    const restUnits = capUnits - (GRID_UNITS[index] as number);
    const exact =
      restUnits === 0 ||
      restUnits >= spellable.length ||
      (restUnits > 0 && spellable[restUnits] != null);
    const diff = Math.abs(entry.beats - naturalBeats);

    // `<=` so a tie prefers the shorter value, as snapDuration does.
    if (exact && diff <= bestDiff) {
      best = entry;
      bestDiff = diff;
    }
  }

  return best;
}

/**
 * For each length up to a limit, the first grid value of its shortest exact
 * spelling. Among equally short spellings the largest value wins, so following
 * the answers back to 0 lists the values largest first.
 * @param maxUnits - Longest length to solve, in grid units
 * @returns Grid index by length; null where no spelling is exact
 */
function fewestValues(maxUnits: number): (number | null)[] {
  const firstValue: (number | null)[] = [null];
  const count: number[] = [0];

  for (let units = 1; units <= maxUnits; units++) {
    let best: number | null = null;
    let bestCount = Infinity;

    for (const [index, valueUnits] of GRID_UNITS.entries()) {
      const restCount = count[units - valueUnits];

      if (restCount != null && restCount + 1 < bestCount) {
        best = index;
        bestCount = restCount + 1;
      }
    }

    firstValue.push(best);
    count.push(bestCount);
  }

  return firstValue;
}
