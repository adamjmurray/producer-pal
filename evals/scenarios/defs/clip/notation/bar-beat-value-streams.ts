// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenarios for value streams (velocity + duration pattern brackets, AJM-483).
 *
 * A value bracket `[v110 v70]` cycles a velocity across notes — `[v110 v70] C3
 * 1|1x8@n/8` is a loud/soft alternating line. A duration bracket with no `@step`
 * (`[n3/16 n/16] C3 1|1x8`) folds its cycled lengths into the SPACING too — a
 * galloping rhythm. Like the pitch-stream scenarios, both grade the OUTCOME (the
 * read-back velocities/positions), not the path: the model may cycle with a
 * bracket or hand-write the changes — brackets are author-only sugar with the
 * same canonical read-back. The signal a note count can't see is the PATTERN: a
 * real velocity alternation (110, 70, …), or a long-short gallop rather than
 * even notes.
 *
 * The zip scenario (`bar-beat-zip-streams`) at the bottom goes deeper: it cycles
 * a DURATION stream against a PITCH stream on one repeat — the polyrhythmic
 * multi-stream form — and grades the PATH too (a genuine duration×pitch zip, not
 * 16 hand-listed notes), since hand-listing is the only fallback when a model
 * doesn't know the idiom.
 *
 * Deterministic read-back assertions are authoritative; the LLM judge is
 * advisory (judges miscount bar|beat notation).
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
  leadClipNotationScenario,
  MSG_CONNECT,
  TOOL_CONNECT,
} from "../clip-scenario-helpers.ts";

/** Float tolerance for note start_time comparisons (in beats). */
const EPS = 1e-6;

/**
 * Build a read-back check for an eight-note C3 line: require exactly eight
 * notes, sort by start time, then assert every note is C3 (pitch 60) and passes
 * `perNote` (the scenario-specific position/velocity predicate).
 * @param perNote - Per-note predicate over the time-sorted note and its index
 * @returns A check for `clipStateAssertion`
 */
function eightNoteCheck(
  perNote: (event: NoteEvent, index: number) => boolean,
): (events: NoteEvent[]) => boolean {
  return (events) => {
    if (events.length !== 8) return false;

    const sorted = [...events].sort((a, b) => a.start_time - b.start_time);

    return sorted.every((e, i) => e.pitch === 60 && perNote(e, i));
  };
}

/**
 * Loud/soft alternating eighth-note line: velocity cycles 110, 70 across eight
 * eighth notes filling a 4/4 bar. The canonical bracket form is
 * `[v110 v70] C3 1|1x8@n/8`. The read-back checks every note's pitch, position
 * (eighths at Ableton beats 0, 0.5, …, 3.5), and the alternating velocity — the
 * accent pattern is the part a note count alone can't verify.
 */
export const barBeatVelocityAccent: EvalScenario = leadClipNotationScenario({
  id: "bar-beat-velocity-accent",
  requires: { brackets: true },
  description:
    "Alternating loud/soft eighth-note line — velocity cycling across a bar",
  message:
    "On the Lead track, create a 1-bar MIDI clip in scene 1: eight eighth notes on C3 filling the bar, alternating velocity loud then soft — 110, 70, 110, 70, and so on.",
  check: eightNoteCheck(
    (e, i) =>
      Math.abs(e.start_time - i * 0.5) < EPS &&
      e.velocity === (i % 2 === 0 ? 110 : 70),
  ),
  judgePrompt: `Evaluate if the assistant:
1. Created a clip with eight eighth notes on C3 filling a 4/4 bar (Ableton beats 0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5)
2. Alternated the velocity loud/soft across the line: 110, 70, 110, 70, … — a real alternation, NOT one flat velocity`,
});

/** Dotted-eighth + sixteenth onsets repeating across a 4/4 bar (4 pairs). */
const GALLOP_ONSETS = [0, 0.75, 1, 1.75, 2, 2.75, 3, 3.75];

/**
 * A galloping rhythm: dotted-eighth then sixteenth pairs repeating across a 4/4
 * bar (eight notes on C3). The canonical bracket form is `[n3/16 n/16] C3 1|1x8`
 * — with no `@step`, the duration stream folds its long/short lengths into the
 * note SPACING, producing the uneven gallop onsets. The read-back grades the
 * onset pattern (the long-short spacing a note count can't see); durations are
 * left to the advisory judge since a hand-written gallop may voice lengths
 * differently while keeping the same onsets.
 */
export const barBeatGallop: EvalScenario = leadClipNotationScenario({
  id: "bar-beat-gallop",
  requires: { brackets: true },
  description: "Galloping dotted-8th + 16th rhythm — duration-fold spacing",
  message:
    "On the Lead track, create a 1-bar MIDI clip in scene 1: a galloping rhythm on C3 — a dotted-eighth note followed by a sixteenth note, that pair repeating to fill the 4/4 bar (four pairs, eight notes).",
  check: eightNoteCheck(
    (e, i) => Math.abs(e.start_time - (GALLOP_ONSETS[i] as number)) < EPS,
  ),
  judgePrompt: `Evaluate if the assistant:
1. Created a clip with eight notes on C3 filling a 4/4 bar
2. Produced a GALLOP rhythm — dotted-eighth + sixteenth pairs (onsets at Ableton beats 0, 0.75, 1, 1.75, 2, 2.75, 3, 3.75), a long-short feel, NOT eight even notes`,
});

// ───────────────────────── stream zip (duration × pitch) ─────────────────────

const TOOL_CREATE_CLIP = "ppal-create-clip";
const LIVE_SET = "basic-midi-4-track";
/** Lead is track 3 in basic-midi-4-track — a melodic (non-drum) track. */
const LEAD_TRACK = 3;
/** Pitch cycle: C3, E3, G3 ascending (Ableton MIDI, C3 = 60). */
const TRIAD = [60, 64, 67];
/** Duration cycle in Ableton quarter beats: a quarter then an eighth (gallop). */
const DURS = [1, 0.5];
/** 16 notes of this 2-vs-3 zip span exactly 12 beats (3 bars). */
const ZIP_NOTE_COUNT = 16;
/** Max bar|beat anchors before it counts as hand-listed (ideal is 1). */
const MAX_ZIP_POSITION_TOKENS = 4;

const ZIP_MESSAGE =
  "On the Lead track, create a 3-bar MIDI clip in scene 1: a 16-note melodic " +
  "run that fills it, cycling upward through the C major triad — C3, E3, G3, " +
  "repeating — while a galloping long-short rhythm repeats underneath: a " +
  "quarter note then an eighth note, over and over. The rhythm (length 2) and " +
  "the pitch cycle (length 3) run independently, so they phase against each " +
  "other — the same pitch falls on a long note one time and a short note the " +
  "next.";

const ZIP_JUDGE = `Evaluate whether the assistant produced this polyrhythmic run with Producer Pal's stream-zip idiom rather than hand-listing every note:
1. A 16-note run cycling the C major triad (C3, E3, G3) with a galloping quarter-then-eighth rhythm.
2. Zipped a duration stream against a pitch stream on a single repeat — e.g. \`[n/4 n/8] [C3 E3 G3] 1|1x16\` (no @step, so the duration folds into the spacing) — NOT 16 hand-listed notes.
3. The two cycles phase (duration length 2 vs pitch length 3): the same pitch alternates long/short across the run.`;

/**
 * Read-back verdict for the zip: exactly the phased gallop the canonical form
 * emits. Builds the expected (pitch, onset, duration) on the fly — onset
 * advances by the previous note's CYCLED duration (the no-`@step` fold),
 * duration cycles every 2, pitch every 3 — and requires every note to match.
 * The phasing makes this an exact fingerprint: a hand-listed approximation
 * almost never lands all 16 onsets right.
 *
 * @param events - Re-interpreted clip notes (start_time in Ableton quarter beats)
 * @returns true when the run is the exact duration×pitch zip
 */
function checkZip(events: NoteEvent[]): boolean {
  if (events.length !== ZIP_NOTE_COUNT) return false;

  const sorted = [...events].sort((a, b) => a.start_time - b.start_time);
  let onset = 0;

  for (let i = 0; i < ZIP_NOTE_COUNT; i++) {
    // i is bounded and the cycles wrap, so these indexes are defined.
    const dur = DURS[i % DURS.length] as number;
    const pitch = TRIAD[i % TRIAD.length] as number;
    const got = sorted[i] as NoteEvent;

    if (
      got.pitch !== pitch ||
      Math.abs(got.start_time - onset) > EPS ||
      Math.abs(got.duration - dur) > EPS
    ) {
      return false;
    }

    onset += dur;
  }

  return true;
}

/** PATH: the notes must zip a duration stream with a pitch stream (two
 * different-kind brackets) — the whole point of the scenario. */
const usesStreamZip: EvalAssertion = {
  type: "custom",
  description: "create-clip notes zip a duration stream with a pitch stream",
  assert: (turns: EvalTurnResult[]) => {
    const notes = getCreateClipNotes(turns);
    const hasDurationStream = /\[[^\]]*n\d*\/\d/.test(notes);
    const hasPitchStream = /\[[^\]]*[A-G]/.test(notes);

    if (!hasDurationStream || !hasPitchStream) {
      throw new Error(
        `not a duration×pitch zip (duration bracket=${hasDurationStream}, ` +
          `pitch bracket=${hasPitchStream}): ${notes.slice(0, 120)}`,
      );
    }

    return true;
  },
};

/** PATH: the zip rides one repeat anchor — not 16 hand-listed positions. */
const zipUsesRepeatNotation: EvalAssertion = {
  type: "custom",
  description: `zip notes use a repeat (≤${MAX_ZIP_POSITION_TOKENS} bar|beat anchors), not hand-listed positions`,
  assert: (turns: EvalTurnResult[]) => {
    const notes = getCreateClipNotes(turns);
    const positions = notes.match(/\d+\|\d/g) ?? [];

    if (positions.length > MAX_ZIP_POSITION_TOKENS) {
      throw new Error(
        `${positions.length} explicit bar|beat positions — expected ≤ ${MAX_ZIP_POSITION_TOKENS} via repeat notation`,
      );
    }

    return true;
  },
};

/**
 * Zip a galloping duration stream against a cycling pitch stream — the advanced
 * multi-stream bracket form. Grades the OUTCOME (the exact phased gallop) and
 * the PATH (a genuine duration×pitch zip on one repeat), so a model that
 * hand-lists the 16 notes fails even if they land right.
 */
export const barBeatZipStreams: EvalScenario = {
  id: "bar-beat-zip-streams",
  description:
    "Duration stream zipped against a pitch stream (gallop melodic run) — multi-stream bracket idiom, not 16 hand-listed notes",
  kind: "capability",
  requires: { brackets: true },
  liveSet: LIVE_SET,
  judgeAdvisory: true,
  messages: [MSG_CONNECT, ZIP_MESSAGE],
  setup: (mcpClient) => clearSessionSlots(mcpClient, [`${LEAD_TRACK}/0`]),
  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
    { type: "tool_called", tool: TOOL_CREATE_CLIP, turn: 1 },
    clipStateAssertion(`${LEAD_TRACK}/0`, "4/4", checkZip),
    usesStreamZip,
    zipUsesRepeatNotation,
    { type: "llm_judge", prompt: ZIP_JUDGE },
    { type: "token_usage", metric: "inputTokens", maxTokens: 80_000 },
  ],
};
