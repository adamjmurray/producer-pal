// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Arpeggio-over-a-progression: does the model REACH FOR the pattern-bracket
 * idiom, or hand-list every note?
 *
 * Unlike the other notation scenarios — which grade only the OUTCOME because
 * "brackets are author-only sugar with the same canonical read-back" — this one
 * also grades the PATH. The failure it reproduces (seen in the wild on a
 * frontier model) is a CORRECT arpeggio written the long way: dozens of
 * hand-enumerated notes instead of one compact `[A3 C4 E4] 1|1x8` line per
 * chord. The read-back is identical, so the only way to see the difference is to
 * inspect the raw `notes` string the model passed to create-clip.
 *
 * Two path assertions split the result into the three tiers observed live:
 *   - bracket cycling present? → tier 1 (none) vs tier 2+/3 (some)
 *   - few anchor positions (repeats used)? → tier 2 (brackets but every position
 *     listed) vs tier 3 (`xN` repeats, ~one anchor per bar)
 * The outcome assertion guards musical validity so brackets-producing-garbage
 * can't pass. No LLM judge — judges miscount bar|beat notation.
 *
 * Two difficulty rungs, in one run:
 *   - mixed durations (turn 1): a DIFFERENT note value per bar. Targets the
 *     misconception that made the wild failure ("mixed durations defeat
 *     brackets, so I'll hand-list") — the model must change the duration token
 *     per bar and keep one compact line each, not fall back to enumeration.
 *   - straight eighths (turn 2): trivially bracketable; even small models pass.
 *     Acts as a baseline / regression guard.
 */

import { type NoteEvent } from "#src/notation/types.ts";
import {
  type EvalAssertion,
  type EvalScenario,
  type EvalTurnResult,
} from "../../../types.ts";
import {
  clipStateAssertion,
  getCreateClipNotes,
  TOOL_CREATE_CLIP,
} from "../helpers/clip-scenario-helpers.ts";
import {
  createClipScenario,
  LEAD_SLOT_1,
  LEAD_SLOT_2,
} from "../helpers/clip-scenario-builders.ts";

/** Float tolerance for note start_time comparisons (in beats). */
const EPS = 1e-6;
/**
 * Max explicit bar|beat anchor positions before we call it "hand-listed". The
 * ideal repeat form has one `N|1` anchor per chord (4); a hand-enumerated
 * arpeggio has one per note (32–36). 8 leaves slack for a model that splits a
 * couple of bars into two repeat groups.
 */
const MAX_POSITION_TOKENS = 8;

/** Triads of the shared four-chord progression, in Ableton MIDI numbers
 * (C3 = 60), one chord per bar. */
const AM = [69, 72, 76]; // A minor: A3, C4, E4
const F = [65, 69, 72]; //  F major: F3, A3, C4
const C = [72, 76, 79]; //  C major: C4, E4, G4
const G = [67, 71, 74]; //  G major: G3, B3, D4

/** One bar of arpeggio: which triad, how many notes, and their grid spacing. */
interface ArpBar {
  triad: number[];
  /** Notes filling the bar (e.g. 8 eighths, 16 sixteenths, 4 quarters). */
  count: number;
  /** Grid spacing in Ableton quarter beats (0.5 eighth, 0.25 sixteenth, 1 qtr). */
  step: number;
}

/** Straight eighths in every bar — the baseline rung. */
const STRAIGHT_BARS: ArpBar[] = [
  { triad: AM, count: 8, step: 0.5 },
  { triad: F, count: 8, step: 0.5 },
  { triad: C, count: 8, step: 0.5 },
  { triad: G, count: 8, step: 0.5 },
];

/** A different note value per bar — the mixed-duration rung. */
const MIXED_BARS: ArpBar[] = [
  { triad: AM, count: 8, step: 0.5 }, //  eighths
  { triad: F, count: 16, step: 0.25 }, // sixteenths
  { triad: C, count: 4, step: 1 }, //     quarters
  { triad: G, count: 8, step: 0.5 }, //   eighths
];

const STRAIGHT_MESSAGE =
  "Now, on the Lead track, create a 4-bar MIDI clip in scene 2: an eighth-note " +
  "arpeggio over a four-chord progression, one chord per bar. In each bar, " +
  "cycle upward through the chord's tones as straight eighth notes — eight " +
  "notes per bar. Bar 1 is A minor (A3, C4, E4), bar 2 is F major " +
  "(F3, A3, C4), bar 3 is C major (C4, E4, G4), bar 4 is G major (G3, B3, D4).";

const MIXED_MESSAGE =
  "On the Lead track, create a 4-bar MIDI clip in scene 1: an arpeggio over a " +
  "four-chord progression, one chord per bar, cycling upward through each " +
  "chord's tones. Use a DIFFERENT note value in each bar and fill the bar " +
  "completely with it: bar 1 straight eighth notes — A minor (A3, C4, E4); " +
  "bar 2 straight sixteenth notes — F major (F3, A3, C4); bar 3 straight " +
  "quarter notes — C major (C4, E4, G4); bar 4 straight eighth notes — " +
  "G major (G3, B3, D4).";

/**
 * Build a read-back verdict for the given per-bar arpeggio spec: the right total
 * note count, and in every bar the right number of notes, each on that bar's
 * grid and drawn from that bar's triad with all three chord tones present (a
 * real arpeggio). Direction-agnostic — up, down, or any cycle order passes — so
 * it grades "did each bar arpeggiate its chord at its note value" without
 * over-constraining the voicing.
 *
 * @param bars - Per-bar triad, note count, and grid spacing
 * @returns A check over the re-interpreted notes (start_time in quarter beats)
 */
function makeArpCheck(bars: ArpBar[]): (events: NoteEvent[]) => boolean {
  const total = bars.reduce((sum, b) => sum + b.count, 0);

  return (events) => {
    if (events.length !== total) return false;

    return bars.every((bar, barIndex) => {
      const barStart = barIndex * 4;
      const inBar = events.filter(
        (e) =>
          e.start_time >= barStart - EPS && e.start_time < barStart + 4 - EPS,
      );

      if (inBar.length !== bar.count) return false;

      const offsets = Array.from({ length: bar.count }, (_, k) => k * bar.step);
      const onGrid = inBar.every((e) =>
        offsets.some((o) => Math.abs(e.start_time - (barStart + o)) < EPS),
      );
      const pitches = new Set(inBar.map((e) => e.pitch));
      const allChordTones = [...pitches].every((p) => bar.triad.includes(p));
      const fullTriad = bar.triad.every((p) => pitches.has(p));

      return onGrid && allChordTones && fullTriad;
    });
  };
}

/**
 * PATH (tier 1 vs 2+): the notes must use pitch-bracket cycling `[...]`.
 *
 * @param turn - Turn whose create-clip call to inspect
 * @returns A custom assertion
 */
function usesBracketCycling(turn: number): EvalAssertion {
  return {
    type: "custom",
    description: `turn ${turn}: create-clip notes use pitch-bracket cycling [...] for the arp`,
    assert: (turns: EvalTurnResult[]) => {
      const notes = getCreateClipNotes(turns, turn);

      if (!/\[[^\]]+]/.test(notes)) {
        throw new Error(
          `no bracket cycling — pitches hand-listed: ${notes.slice(0, 120)}`,
        );
      }

      return true;
    },
  };
}

/**
 * PATH (tier 2 vs 3): repeats keep anchor positions few, not hand-listed.
 *
 * @param turn - Turn whose create-clip call to inspect
 * @returns A custom assertion
 */
function usesRepeatNotation(turn: number): EvalAssertion {
  return {
    type: "custom",
    description: `turn ${turn}: create-clip notes use repeats (≤${MAX_POSITION_TOKENS} bar|beat anchors), not hand-listed positions`,
    assert: (turns: EvalTurnResult[]) => {
      const notes = getCreateClipNotes(turns, turn);
      const positions = notes.match(/\d+\|\d/g) ?? [];

      if (positions.length > MAX_POSITION_TOKENS) {
        throw new Error(
          `${positions.length} explicit bar|beat positions — expected ≤ ${MAX_POSITION_TOKENS} via repeat notation`,
        );
      }

      return true;
    },
  };
}

/**
 * One scenario, two rungs. The MIXED rung runs first and unprimed: it is the
 * one that reproduces the wild failure (a different note value per bar tempts
 * the model to hand-list), and seeing the idiom work once would give it away.
 * The straight-eighths rung follows as the baseline regression guard — even
 * small models pass it.
 */
export const arpeggioBracketIdiom: EvalScenario = createClipScenario({
  id: "arpeggio-bracket-idiom",
  description:
    "Arpeggios over a 4-chord progression — reach for pitch-bracket + repeat notation, not hand-listed notes",
  requires: { brackets: true },
  messages: [MIXED_MESSAGE, STRAIGHT_MESSAGE],
  clearSlots: [LEAD_SLOT_1, LEAD_SLOT_2],
  assertions: [
    clipStateAssertion(LEAD_SLOT_1, "4/4", makeArpCheck(MIXED_BARS)),
    usesBracketCycling(1),
    usesRepeatNotation(1),

    { type: "tool_called", tool: TOOL_CREATE_CLIP, turn: 2 },
    clipStateAssertion(LEAD_SLOT_2, "4/4", makeArpCheck(STRAIGHT_BARS)),
    usesBracketCycling(2),
    usesRepeatNotation(2),

    { type: "token_usage", metric: "inputTokens", maxTokens: 160_000 },
  ],
});
