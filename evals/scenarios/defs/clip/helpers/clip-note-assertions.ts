// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Grading a clip's notes: the read-back state assertion, the order-independent
 * note match, and the expected-vs-actual diff a failure prints.
 */

import { hasPerfectMatching } from "#evals/shared/bipartite-matching.ts";
import { interpretNotation } from "#src/notation/barbeat/interpreter/barbeat-interpreter.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import { getToolCalls } from "../../../assertions/index.ts";
import { type EvalAssertion, type EvalTurnResult } from "../../../types.ts";
import { TOOL_READ_CLIP } from "./clip-tool-constants.ts";
import { slotToPath } from "./clip-turn-readers.ts";

/**
 * Create a custom assertion that verifies clips were found and notes were read.
 * Checks that only ppal-read-* tools were called and at least one read pulled in
 * notes — either explicitly ("notes" in the include array) or via the "*"
 * wildcard, which returns every field (notes included). A capable model often
 * reaches for `include: ["*"]` to read a clip comprehensively, and that must
 * count as reading the notes.
 *
 * @param turn - Turn index to check
 * @returns Custom assertion for clip reading
 */
export function assertNotesRead(turn: number): EvalAssertion {
  return {
    type: "custom",
    description: "clips were found and notes were read",
    assert: (turns: EvalTurnResult[]) => {
      const calls = getToolCalls(turns, turn);
      let notesRead = false;

      for (const { name, args } of calls) {
        if (!name.startsWith("ppal-read-")) {
          throw new Error(`unexpected non-read tool call: ${name}`);
        }

        if (
          name !== "ppal-read-live-set" &&
          Array.isArray(args.include) &&
          (args.include.includes("notes") || args.include.includes("*"))
        ) {
          notesRead = true;
        }
      }

      if (!notesRead) {
        throw new Error("the clip notes should have been read");
      }

      return true;
    },
  };
}

/**
 * Build a `state` assertion that re-reads the clip in `slot` and re-interprets
 * its notation back into NoteEvents, then defers to `check` for the verdict.
 * Reading the final clip state (not the create/update transcript) grades the
 * OUTCOME, not the path — immune to tool-error strings and to which of several
 * tool calls "won". Fails closed before `check` runs: a wrong/absent time
 * signature, missing notes, or unparseable notation all return false.
 *
 * @param slot - Session clip slot to read (trackIndex/sceneIndex)
 * @param meter - Expected time signature (e.g. "6/8"); also the interpret meter
 * @param check - Verdict over the re-interpreted notes (start_time in Ableton
 *   quarter beats); only called once the read succeeded in `meter`
 * @param interpret - Notation interpreter (defaults to bar|beat). Pass a
 *   notation-specific interpreter for non-bar|beat scenarios — the only thing
 *   that differs.
 * @returns State assertion
 */
export function clipStateAssertion(
  slot: string,
  meter: string,
  check: (events: NoteEvent[]) => boolean,
  interpret: NotationInterpreter = interpretNotation,
): EvalAssertion {
  const [numerator, denominator] = meter.split("/").map(Number);

  return {
    type: "state",
    tool: TOOL_READ_CLIP,
    args: { path: slotToPath(slot), include: ["notes", "timing"] },
    expect: (result: unknown): boolean => {
      const clip = result as { notes?: string; timeSignature?: string };

      if (clip.timeSignature !== meter || !clip.notes) {
        return false;
      }

      let events: NoteEvent[];

      try {
        events = interpret(clip.notes, {
          timeSigNumerator: numerator,
          timeSigDenominator: denominator,
        });
      } catch {
        return false; // unparseable notation — treat as a failed clip
      }

      return check(events);
    },
  };
}

/** A notation interpreter compatible with {@link clipStateAssertion}. Meter
 * fields are optional so both the bar|beat and stark interpreters satisfy it
 * (stark ignores the denominator). */
export type NotationInterpreter = (
  notes: string,
  opts: { timeSigNumerator?: number; timeSigDenominator?: number },
) => NoteEvent[];

/**
 * One expected note: MIDI pitch, start (Ableton quarter beats), duration.
 * `pitch` may be a SET of acceptable pitches (any-of). Used for drum pads whose
 * "role" spans several MIDI notes: stark maps a drum name to a fixed GM
 * pitch (e.g. snare→38) while a bar|beat/midi-json model reads the actual Drum
 * Rack and picks whatever pad that rack labels a snare (Eb1=39, E1=40 in
 * basic-midi-4-track). Accepting the family keeps the notations graded
 * against the SAME expected set (the matrix's apples-to-apples invariant) instead
 * of rewarding whichever notation happens to match this rack's GM alignment. The
 * rhythm (start) is still asserted exactly; only the pad choice is loosened.
 */
export interface ExpectedNote {
  pitch: number | number[];
  start: number;
  duration?: number;
}

/**
 * Lowest acceptable pitch of an expected note — the sort key that lines a
 * pitch-set note up with the actual note in its (non-overlapping) family.
 *
 * @param p - The expected pitch or set of acceptable pitches
 * @returns The single value, or the minimum of the set
 */
function pitchSortKey(p: number | number[]): number {
  return Array.isArray(p) ? Math.min(...p) : p;
}

/**
 * Whether an actual MIDI pitch satisfies an expected pitch (a single value or an
 * any-of set).
 *
 * @param actual - The read-back note's pitch
 * @param expected - The expected pitch or set of acceptable pitches
 * @returns True when actual equals the value or is a member of the set
 */
function pitchMatches(actual: number, expected: number | number[]): boolean {
  return Array.isArray(expected)
    ? expected.includes(actual)
    : actual === expected;
}

/**
 * Order-independent verdict: the interpreted events match `expected` exactly on
 * pitch (or membership in a pitch-set) and start position (and duration when
 * given). Velocity is never checked (it is often bucketed/randomized on
 * interpret). Shared by the bar|beat and stark read-back checks.
 *
 * @param events - Re-interpreted notes from the read-back
 * @param expected - Expected notes (pitch + start, optional duration)
 * @returns True when the note sets match
 */
export function notesMatch(
  events: NoteEvent[],
  expected: ExpectedNote[],
): boolean {
  if (events.length !== expected.length) {
    return false;
  }

  // A greedy sort-then-pair-by-index check can wrongly fail when expected notes
  // carry OVERLAPPING any-of pitch sets at the same start (e.g. [40,50] and [45]
  // vs actual {45,50}): index-pairing forces 45↔[40,50] and misses the valid
  // assignment 50↔[40,50], 45↔[45]. Accept iff a perfect matching exists between
  // actual and expected notes under the per-pair predicate.
  return hasPerfectMatching(events, expected, satisfiesExpected);
}

/**
 * Whether an actual event can stand in for an expected note: pitch (value or
 * any-of membership), start, and duration (only when the expected pins it).
 *
 * @param event - Re-interpreted read-back note
 * @param want - Expected note
 * @returns True when the event satisfies the expected note's constraints
 */
function satisfiesExpected(event: NoteEvent, want: ExpectedNote): boolean {
  return (
    pitchMatches(event.pitch, want.pitch) &&
    Math.abs(event.start_time - want.start) < EPS &&
    (want.duration == null || Math.abs(event.duration - want.duration) < EPS)
  );
}

/** Float tolerance for note start_time / duration comparisons (in beats). */
const EPS = 1e-6;

/**
 * Human-readable expected-vs-actual note diff for a failed `notesMatch`, in
 * midi-json terms (`p`itch / `t`ime / `d`uration). Pairs the two sets after the
 * SAME (start, pitch) sort `notesMatch` uses, so the printed rows line up with
 * the comparison that actually failed and each mismatch is tagged with the field
 * (pitch/start/duration) that diverged. Duration is only shown/compared when the
 * expected note pins it. Surfaced in the state assertion's `details.diff` and the
 * console failure line so a failing drum/melody scenario is debuggable at a
 * glance instead of eyeballing two 22-note dumps.
 *
 * @param events - Re-interpreted notes from the read-back (actual)
 * @param expected - Expected notes (pitch + start, optional duration)
 * @returns Multi-line diff string
 */
export function diffNotes(
  events: NoteEvent[],
  expected: ExpectedNote[],
): string {
  const sortedEvents = events.toSorted(
    (a, b) => a.start_time - b.start_time || a.pitch - b.pitch,
  );
  const sortedExpected = expected.toSorted(
    (a, b) =>
      a.start - b.start || pitchSortKey(a.pitch) - pitchSortKey(b.pitch),
  );
  const rows: string[] = [
    `count: expected ${expected.length}, actual ${events.length}`,
  ];
  const max = Math.max(sortedEvents.length, sortedExpected.length);

  for (let i = 0; i < max; i++) {
    const want = sortedExpected[i];
    const got = sortedEvents[i];

    rows.push(diffNoteRow(want, got));
  }

  return rows.join("\n");
}

/**
 * Format an expected note as a midi-json-ish `p… t… d…` token (duration omitted
 * when the expectation doesn't pin it).
 *
 * @param w - Expected note
 * @returns One-line token
 */
function fmtExpected(w: ExpectedNote): string {
  const dur = w.duration == null ? "" : ` d${w.duration}`;
  const pitch = Array.isArray(w.pitch)
    ? `p{${w.pitch.join("|")}}`
    : `p${w.pitch}`;

  return `${pitch} t${w.start}${dur}`;
}

/**
 * Format an actual note event as a midi-json-ish `p… t… d…` token.
 *
 * @param g - Actual note event
 * @returns One-line token
 */
function fmtActual(g: NoteEvent): string {
  return `p${g.pitch} t${g.start_time} d${g.duration}`;
}

/**
 * Format one paired expected/actual note row for `diffNotes`, tagging the field
 * that diverged (or a missing/extra note when one side is absent).
 *
 * @param want - Expected note at this sorted index (may be absent)
 * @param got - Actual note at this sorted index (may be absent)
 * @returns One diff line
 */
function diffNoteRow(
  want: ExpectedNote | undefined,
  got: NoteEvent | undefined,
): string {
  if (want == null) {
    return `  + extra   ${fmtActual(got as NoteEvent)}`;
  }

  if (got == null) {
    return `  - missing ${fmtExpected(want)}`;
  }

  const reasons: string[] = [];

  if (!pitchMatches(got.pitch, want.pitch)) {
    reasons.push("pitch");
  }

  if (Math.abs(got.start_time - want.start) >= EPS) {
    reasons.push("start");
  }

  if (want.duration != null && Math.abs(got.duration - want.duration) >= EPS) {
    reasons.push("duration");
  }

  if (reasons.length === 0) {
    return `  ✓ ${fmtExpected(want)}`;
  }

  const detail = `expected ${fmtExpected(want)} — actual ${fmtActual(got)}`;

  return `  ✗ ${detail}  (${reasons.join(", ")})`;
}
