// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Arpeggio-over-a-progression: does the model REACH FOR the pattern-bracket
 * idiom, or hand-list every note?
 *
 * Unlike the other notation scenarios — which grade only the OUTCOME because
 * "brackets are author-only sugar with the same canonical read-back" — these
 * also grade the PATH. The failure they reproduce (seen in the wild on a
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
 * can't pass. The LLM judge stays advisory (judges miscount bar|beat notation).
 *
 * Two difficulty rungs:
 *   - arpeggio-bracket-idiom: straight eighths in every bar. Trivially
 *     bracketable; even small models pass. Acts as a baseline / regression guard.
 *   - arpeggio-mixed-durations: a DIFFERENT note value per bar. Targets the
 *     misconception that made the wild failure ("mixed durations defeat
 *     brackets, so I'll hand-list") — the model must change the duration token
 *     per bar and keep one compact line each, not fall back to enumeration.
 */

import { type NoteEvent } from "#src/notation/types.ts";
import {
  type EvalAssertion,
  type EvalScenario,
  type EvalTurnResult,
} from "../../../types.ts";
import {
  clearSessionSlots,
  clipStateAssertion,
  getCreateClipNotes,
  MSG_CONNECT,
  TOOL_CONNECT,
} from "../clip-scenario-helpers.ts";

const TOOL_CREATE_CLIP = "ppal-create-clip";
const LIVE_SET = "basic-midi-4-track";
/** Lead is track 3 in basic-midi-4-track — a melodic (non-drum) track. */
const LEAD_TRACK = 3;
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
  "On the Lead track, create a 4-bar MIDI clip in scene 1: an eighth-note " +
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

const STRAIGHT_JUDGE = `Evaluate whether the assistant wrote the arpeggio with Producer Pal's compact pattern-bracket idiom rather than hand-listing every note:
1. Created a 4-bar clip: an eighth-note arpeggio cycling each bar's chord tones — A minor, F major, C major, G major (32 notes, eight per bar).
2. Used pitch-bracket cycling WITH repeat notation — e.g. \`[A3 C4 E4] 1|1x8\` — roughly one compact line per chord, NOT 32 hand-listed note positions and NOT brackets with every position spelled out.
3. The arpeggio is musically correct: each bar cycles its own triad across straight eighths.`;

const MIXED_JUDGE = `Evaluate whether the assistant wrote this mixed-rhythm arpeggio with Producer Pal's compact pattern-bracket idiom rather than hand-listing every note:
1. Created a 4-bar clip filling each bar with its own note value — bar 1 eighths (8 notes), bar 2 sixteenths (16), bar 3 quarters (4), bar 4 eighths (8) — cycling A minor, F major, C major, G major.
2. Used pitch-bracket cycling WITH repeat notation — roughly one compact line per bar, e.g. \`n/16 [F3 A3 C4] 2|1x16\` — changing the note value per bar with a duration token, NOT hand-listing the 36 notes and NOT spelling out every position. Mixed durations across bars do NOT require hand-listing.
3. The arpeggio is musically correct: each bar cycles its own triad across its note value.`;

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

/** PATH (tier 1 vs 2+): the notes must use pitch-bracket cycling `[...]`. */
const usesBracketCycling: EvalAssertion = {
  type: "custom",
  description: "create-clip notes use pitch-bracket cycling [...] for the arp",
  assert: (turns: EvalTurnResult[]) => {
    const notes = getCreateClipNotes(turns);

    if (!/\[[^\]]+]/.test(notes)) {
      throw new Error(
        `no bracket cycling — pitches hand-listed: ${notes.slice(0, 120)}`,
      );
    }

    return true;
  },
};

/** PATH (tier 2 vs 3): repeats keep anchor positions few, not hand-listed. */
const usesRepeatNotation: EvalAssertion = {
  type: "custom",
  description: `create-clip notes use repeats (≤${MAX_POSITION_TOKENS} bar|beat anchors), not hand-listed positions`,
  assert: (turns: EvalTurnResult[]) => {
    const notes = getCreateClipNotes(turns);
    const positions = notes.match(/\d+\|\d/g) ?? [];

    if (positions.length > MAX_POSITION_TOKENS) {
      throw new Error(
        `${positions.length} explicit bar|beat positions — expected ≤ ${MAX_POSITION_TOKENS} via repeat notation`,
      );
    }

    return true;
  },
};

/**
 * Assemble an arpeggio-idiom scenario: connect (turn 0), one create-clip
 * (turn 1), then grade both the OUTCOME (`makeArpCheck`) and the PATH (bracket
 * cycling + repeats). The two rungs share everything but the prompt, the per-bar
 * spec, and the judge prompt.
 *
 * @param opts - Scenario specifics
 * @param opts.id - Scenario id
 * @param opts.description - One-line description
 * @param opts.message - User turn after the connect turn
 * @param opts.bars - Per-bar arpeggio spec for the read-back check
 * @param opts.judgePrompt - Advisory LLM-judge prompt
 * @returns The assembled scenario
 */
function arpScenario(opts: {
  id: string;
  description: string;
  message: string;
  bars: ArpBar[];
  judgePrompt: string;
}): EvalScenario {
  return {
    id: opts.id,
    description: opts.description,
    kind: "capability",
    requires: { brackets: true },
    liveSet: LIVE_SET,
    judgeAdvisory: true,
    messages: [MSG_CONNECT, opts.message],
    setup: (mcpClient) => clearSessionSlots(mcpClient, [`${LEAD_TRACK}/0`]),
    assertions: [
      { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
      { type: "tool_called", tool: TOOL_CREATE_CLIP, turn: 1 },
      clipStateAssertion(`${LEAD_TRACK}/0`, "4/4", makeArpCheck(opts.bars)),
      usesBracketCycling,
      usesRepeatNotation,
      { type: "llm_judge", prompt: opts.judgePrompt },
      { type: "token_usage", metric: "inputTokens", maxTokens: 80_000 },
    ],
  };
}

/**
 * Baseline: straight-eighth arpeggio over the progression. Trivially
 * bracketable — passes on small models — so it doubles as a regression guard
 * that the idiom keeps working.
 */
export const arpeggioBracketIdiom: EvalScenario = arpScenario({
  id: "arpeggio-bracket-idiom",
  description:
    "Arpeggio over a 4-chord progression — reach for pitch-bracket + repeat notation, not 32 hand-listed notes",
  message: STRAIGHT_MESSAGE,
  bars: STRAIGHT_BARS,
  judgePrompt: STRAIGHT_JUDGE,
});

/**
 * Harder rung: a different note value per bar. Reproduces the wild failure's
 * trigger — mixed durations tempting the model to hand-list rather than change
 * the duration token per compact bracket line.
 */
export const arpeggioMixedDurations: EvalScenario = arpScenario({
  id: "arpeggio-mixed-durations",
  description:
    "Arpeggio with a different note value per bar — mixed durations must NOT trigger hand-listing",
  message: MIXED_MESSAGE,
  bars: MIXED_BARS,
  judgePrompt: MIXED_JUDGE,
});
