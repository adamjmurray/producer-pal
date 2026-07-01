// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Abstark scenario: pitch accuracy on a melodic line — octave leaps plus a
 * chromatic descent. Abstark is literal (no scale snapping), so accidentals and
 * octave marks must land EXACT MIDI pitches. This grades the resulting melody's
 * pitches + positions read back from Live, re-interpreted from Abstark — the
 * signal a note count can't see: a real octave leap (G3→C4) and true chromatic
 * neighbors (B3, Bb3, A3, Ab3), not a diatonic approximation.
 *
 * Note names in the prompt use the Ableton convention (C3 = MIDI 60), which is
 * what the model sees everywhere else in Producer Pal; the grader asserts MIDI
 * numbers, so the Abstark register/octave-mark spelling is transparent to it.
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
 * Bar 1 ascends C3, E3, G3 then leaps up an octave to C4; bar 2 descends
 * chromatically B3, Bb3, A3, Ab3. Eight quarter notes across two 4/4 bars
 * (Ableton beats 0–7).
 */
const EXPECTED: ExpectedNote[] = [
  { pitch: 60, start: 0, duration: 1 }, // C3
  { pitch: 64, start: 1, duration: 1 }, // E3
  { pitch: 67, start: 2, duration: 1 }, // G3
  { pitch: 72, start: 3, duration: 1 }, // C4 (octave leap)
  { pitch: 71, start: 4, duration: 1 }, // B3
  { pitch: 70, start: 5, duration: 1 }, // Bb3
  { pitch: 69, start: 6, duration: 1 }, // A3
  { pitch: 68, start: 7, duration: 1 }, // Ab3
];

export const abstarkPitchAccuracy: EvalScenario = abstarkScenario({
  id: "abstark-pitch-accuracy",
  description:
    "Abstark melody with an octave leap and a chromatic descent — exact literal pitches",
  prompt:
    "On the Lead track, create a 2-bar MIDI clip in scene 1 with this quarter-note melody, one note per beat: bar 1 ascends C3, E3, G3, then leaps up an octave to C4; bar 2 descends chromatically B3, Bb3, A3, Ab3.",
  slots: [`${LEAD_TRACK}/0`],
  checks: [
    abstarkClipStateAssertion(`${LEAD_TRACK}/0`, "4/4", (events) =>
      notesMatch(events, EXPECTED),
    ),
  ],
  judgePrompt: `Evaluate if the assistant:
1. Created a 2-bar 4/4 clip with eight quarter notes, one per beat (Ableton beats 0-7)
2. Bar 1 ascends C3, E3, G3 then leaps an OCTAVE up to C4 (MIDI 60, 64, 67, 72)
3. Bar 2 descends by exact chromatic half-steps: B3, Bb3, A3, Ab3 (MIDI 71, 70, 69, 68) — not a diatonic/scale approximation`,
});
