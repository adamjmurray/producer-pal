// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenarios for melodic stepping via pitch streams (pattern brackets, AJM-482).
 *
 * A pitch bracket `[C3 E3 G3]` on a repeat steps through the pitches instead of
 * repeating one — `[C3 E3 G3] 1|1x3@n/4` is a melodic run. These capability
 * scenarios grade the OUTCOME (the resulting melody's pitches + positions read
 * back from Live), not the path: the model may use brackets or hand-enumerate
 * explicit positions — brackets are author-only sugar with the same canonical
 * read-back. The signal is meter-safety — a stepping melody must keep correct
 * note-value spacing in 4/4, 5/4, 6/8, and 12/8, with and without `@step`.
 *
 * Mirrors bar-beat-absolute-durations.ts: deterministic read-back assertions are
 * authoritative; LLM judges are advisory (they miscount bar|beat notation).
 */

import { type EvalAssertion, type EvalScenario } from "../../../../types.ts";
import {
  clearSessionSlots,
  clipStateAssertion,
  type ExpectedNote,
  MSG_CONNECT,
  notesMatch,
  TOOL_CONNECT,
} from "../../clip-scenario-helpers.ts";

const TOOL_CREATE_CLIP = "ppal-create-clip";
const LIVE_SET = "basic-midi-4-track";
/** Lead is track 3 in basic-midi-4-track — a melodic (non-drum) track. */
const LEAD_TRACK = 3;

/** Ascending C, D, E, F on quarter beats 0-3 — the shared head of the 4/4 and
 * 5/4 stepping melodies (5/4 appends G3). */
const ASCENDING_QUARTERS: ExpectedNote[] = [
  { pitch: 60, start: 0, duration: 1 },
  { pitch: 62, start: 1, duration: 1 },
  { pitch: 64, start: 2, duration: 1 },
  { pitch: 65, start: 3, duration: 1 },
];

/**
 * Build a `state` assertion that re-reads the clip in `slot` and verifies its
 * notes form the expected melody — each note's pitch and start position (in
 * Ableton quarter beats), and its duration when given. Positions are the signal
 * counts cannot see: only they distinguish correct note-value stepping (e.g. 6/8
 * dotted-quarter pulse at Ableton beats [0, 1.5]) from the eighths trap, and a
 * real ascending line from notes bunched on one beat. Built on
 * `clipStateAssertion`, so it grades the outcome regardless of whether the model
 * used a pitch bracket or hand-wrote explicit positions.
 *
 * @param slot - Session clip slot to read (trackIndex/sceneIndex)
 * @param meter - Expected time signature (e.g. "6/8")
 * @param expected - Expected melody notes (pitch + start, optional duration),
 *   in ascending start order
 * @returns State assertion
 */
function assertMelody(
  slot: string,
  meter: string,
  expected: ExpectedNote[],
): EvalAssertion {
  return clipStateAssertion(slot, meter, (events) =>
    notesMatch(events, expected),
  );
}

/**
 * Assemble a melodic-stepping scenario. All three share the same shape — connect,
 * create one clip per turn, then read each clip back and grade its melody — so
 * the scaffolding lives here and each scenario supplies only what differs.
 *
 * @param opts - Scenario specifics
 * @param opts.id - Scenario id
 * @param opts.description - One-line description
 * @param opts.prompts - User turns after the connect turn
 * @param opts.slots - Session slots to clear in setup
 * @param opts.melodies - Per-clip read-back checks
 * @param opts.judgePrompt - Advisory LLM-judge prompt
 * @returns The scenario
 */
function meterSteppingScenario(opts: {
  id: string;
  description: string;
  prompts: string[];
  slots: string[];
  melodies: EvalAssertion[];
  judgePrompt: string;
}): EvalScenario {
  return {
    id: opts.id,
    description: opts.description,
    kind: "capability",
    requires: { brackets: true },
    liveSet: LIVE_SET,
    judgeAdvisory: true,
    messages: [MSG_CONNECT, ...opts.prompts],
    setup: (mcpClient) => clearSessionSlots(mcpClient, opts.slots),
    assertions: [
      { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
      { type: "tool_called", tool: TOOL_CREATE_CLIP, turn: 1 },
      ...opts.melodies,
      { type: "llm_judge", prompt: opts.judgePrompt },
      { type: "token_usage", metric: "inputTokens", maxTokens: 80_000 },
    ],
  };
}

/**
 * Ascending stepping melody on the straight grid (`@step` = a quarter), in 4/4
 * and 5/4. The canonical pitch-bracket form is `[C3 D3 E3 F3] 1|1x4@n/4`; the
 * 5/4 bar adds G3, so the run fills the bar — a meter-safe step the model must
 * not collapse onto consecutive grid beats.
 */
export const barBeatMelodicStepping: EvalScenario = meterSteppingScenario({
  id: "bar-beat-melodic-stepping",
  description:
    "Ascending quarter-note melody filling a 4/4 and a 5/4 bar — pitch stepping, straight grid",
  prompts: [
    "On the Lead track, create a 1-bar MIDI clip in scene 1. Put an ascending quarter-note melody on it: C3, D3, E3, F3 — one note per beat across the bar.",
    "Now create a 1-bar clip on the Lead track in scene 2 in 5/4 time with an ascending quarter-note melody filling the bar, one note per beat: C3, D3, E3, F3, G3.",
  ],
  slots: [`${LEAD_TRACK}/0`, `${LEAD_TRACK}/1`],
  melodies: [
    assertMelody(`${LEAD_TRACK}/0`, "4/4", ASCENDING_QUARTERS),
    assertMelody(`${LEAD_TRACK}/1`, "5/4", [
      ...ASCENDING_QUARTERS,
      { pitch: 67, start: 4, duration: 1 },
    ]),
  ],
  judgePrompt: `Evaluate if the assistant:
1. Created a 4/4 clip with the ascending melody C3, D3, E3, F3 — one per quarter beat (Ableton beats 0, 1, 2, 3)
2. Created a 5/4 clip with the ascending melody C3, D3, E3, F3, G3 — one per quarter beat filling the bar (Ableton beats 0, 1, 2, 3, 4)
3. Kept each note distinct (a true stepping melody), NOT a chord or a single repeated pitch`,
});

/**
 * Stepping melody on the compound felt pulse (dotted-quarter `@step`, `n3/8`),
 * in 6/8 and 12/8. Canonical bracket form `[C3 G3] 1|1x2@n3/8` /
 * `[C3 E3 G3 C4] 1|1x4@n3/8`. Combines the pitch-stepping signal with the
 * compound-meter spacing trap: the melody must land on the dotted-quarter pulse
 * (Ableton beats 0, 1.5, …), not on every eighth and not on quarters. Duration
 * is left unchecked: `1|1xN@n3/8` keeps each note at its set length, so the pulse
 * PLACEMENT and pitch sequence are what's under test.
 */
export const barBeatMelodicCompoundStepping: EvalScenario =
  meterSteppingScenario({
    id: "bar-beat-melodic-compound-stepping",
    description:
      "Stepping melody on the dotted-quarter felt pulse in 6/8 and 12/8 — pitch stepping meets compound spacing",
    prompts: [
      "On the Lead track, create a 1-bar MIDI clip in scene 1 in 6/8 time. Put a two-note melody on the main felt pulse (the dotted-quarter beat): C3 on the first pulse, G3 on the second.",
      "Now create a 1-bar clip on the Lead track in scene 2 in 12/8 time with an ascending arpeggio on each felt pulse (the dotted-quarter beat): C3, E3, G3, C4 — four notes.",
    ],
    slots: [`${LEAD_TRACK}/0`, `${LEAD_TRACK}/1`],
    melodies: [
      assertMelody(`${LEAD_TRACK}/0`, "6/8", [
        { pitch: 60, start: 0 },
        { pitch: 67, start: 1.5 },
      ]),
      assertMelody(`${LEAD_TRACK}/1`, "12/8", [
        { pitch: 60, start: 0 },
        { pitch: 64, start: 1.5 },
        { pitch: 67, start: 3 },
        { pitch: 72, start: 4.5 },
      ]),
    ],
    judgePrompt: `Evaluate if the assistant:
1. Created a 6/8 clip with two notes C3 then G3 on the felt dotted-quarter pulse (Ableton beats 0 and 1.5) — NOT on every eighth
2. Created a 12/8 clip with the ascending arpeggio C3, E3, G3, C4 on the four felt pulses (Ableton beats 0, 1.5, 3, 4.5)
3. Grouped the eighths into dotted-quarter beats rather than placing notes on every eighth or miscounting`,
  });

/**
 * Legato run with NO `@step`: the step defaults to the current duration, so an
 * eighth-note run advances by an eighth. Canonical bracket form
 * `n/8 [C3 D3 E3 F3] 1|1x4` (step = duration). Tests the omitted-`@step` branch
 * of stepping — the run must be back-to-back eighths (Ableton beats 0, 0.5, 1,
 * 1.5), not a quarter-note run.
 */
export const barBeatMelodicLegatoRun: EvalScenario = meterSteppingScenario({
  id: "bar-beat-melodic-legato-run",
  description:
    "Back-to-back eighth-note ascending run with no explicit step — step defaults to the duration",
  prompts: [
    "On the Lead track, create a 1-bar MIDI clip in scene 1. Put an ascending run of four eighth notes starting at beat 1, each immediately after the previous (legato, no gaps): C3, D3, E3, F3.",
  ],
  slots: [`${LEAD_TRACK}/0`],
  melodies: [
    assertMelody(`${LEAD_TRACK}/0`, "4/4", [
      { pitch: 60, start: 0, duration: 0.5 },
      { pitch: 62, start: 0.5, duration: 0.5 },
      { pitch: 64, start: 1, duration: 0.5 },
      { pitch: 65, start: 1.5, duration: 0.5 },
    ]),
  ],
  judgePrompt: `Evaluate if the assistant:
1. Created a clip with four eighth notes C3, D3, E3, F3 starting at beat 1
2. Spaced them back-to-back (legato): an eighth apart at Ableton beats 0, 0.5, 1, 1.5 — NOT a quarter apart
3. Gave each note an eighth-note duration`,
});
