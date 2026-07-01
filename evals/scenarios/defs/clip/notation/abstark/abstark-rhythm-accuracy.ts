// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Abstark scenario: rhythm accuracy on a pitched line — mixed quarter / eighth /
 * sixteenth durations in one bar. Abstark durations are ABSOLUTE note values
 * (`/4` = quarter/1 beat, `/8`, `/16`), not multipliers, so getting the grid
 * right means both the right note lengths AND the right start positions. All
 * notes sit on one pitch (C3) so the ONLY signal is rhythm: the grader checks
 * each note's exact start and duration in Ableton quarter beats.
 */

import { type EvalScenario } from "../../../../types.ts";
import {
  abstarkClipStateAssertion,
  abstarkScenario,
  type ExpectedNote,
  LEAD_TRACK,
  notesMatch,
} from "./abstark-scenario-helpers.ts";

/**
 * One 4/4 bar on C3 (MIDI 60): a quarter on beat 1, two eighths on beat 2, four
 * sixteenths on beat 3, a quarter on beat 4. Eight notes; the absolute /N grid
 * places them at Ableton beats 0, 1, 1.5, 2, 2.25, 2.5, 2.75, 3.
 */
const EXPECTED: ExpectedNote[] = [
  { pitch: 60, start: 0, duration: 1 }, // quarter, beat 1
  { pitch: 60, start: 1, duration: 0.5 }, // eighth, beat 2
  { pitch: 60, start: 1.5, duration: 0.5 }, // eighth, beat 2.5
  { pitch: 60, start: 2, duration: 0.25 }, // sixteenth, beat 3
  { pitch: 60, start: 2.25, duration: 0.25 },
  { pitch: 60, start: 2.5, duration: 0.25 },
  { pitch: 60, start: 2.75, duration: 0.25 },
  { pitch: 60, start: 3, duration: 1 }, // quarter, beat 4
];

export const abstarkRhythmAccuracy: EvalScenario = abstarkScenario({
  id: "abstark-rhythm-accuracy",
  description:
    "Abstark single-pitch bar mixing quarter, eighth, and sixteenth notes — absolute /N grid",
  prompt:
    "On the Lead track, create a 1-bar MIDI clip in scene 1 with every note on C3: a quarter note on beat 1, two eighth notes on beat 2, four sixteenth notes on beat 3, and a quarter note on beat 4.",
  slots: [`${LEAD_TRACK}/0`],
  checks: [
    abstarkClipStateAssertion(`${LEAD_TRACK}/0`, "4/4", (events) =>
      notesMatch(events, EXPECTED),
    ),
  ],
  judgePrompt: `Evaluate if the assistant:
1. Created a 1-bar 4/4 clip with eight notes, all on C3 (MIDI 60)
2. Used the right absolute durations: a quarter (beat 1), two eighths (beat 2), four sixteenths (beat 3), a quarter (beat 4)
3. Placed them at the correct grid positions (Ableton beats 0, 1, 1.5, 2, 2.25, 2.5, 2.75, 3) — the sixteenths tightly packed, NOT spread as eighths or quarters`,
});
