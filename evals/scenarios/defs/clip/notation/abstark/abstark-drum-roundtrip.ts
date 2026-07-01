// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Abstark scenario: drum-line round-trip on the positional 16th-note grid.
 *
 * Drum lines use the OTHER Abstark timing model — positional, one character per
 * 16th step — so this exercises the axis the pitched scenarios don't: the model
 * authors a groove, Live stores it, read-clip serializes it back through the
 * drum serializer (the Drums track is a Drum Rack → drum mode), and the grader
 * re-interprets it. 16th-grid quantization of drum timing is a documented lossy
 * axis, so the round-trip is a fixed point here by construction — the check is
 * that the groove survives it intact (kick/snare backbeat + straight eighth
 * hats), each hit on its correct 16th step.
 */

import { type EvalScenario } from "../../../../types.ts";
import {
  abstarkClipStateAssertion,
  abstarkScenario,
  DRUMS_TRACK,
  type ExpectedNote,
  notesMatch,
} from "./abstark-scenario-helpers.ts";

/** GM drum pitches the standard Abstark drum names map to. */
const KICK = 36;
const SNARE = 38;
const HIHAT = 42;

/**
 * A one-bar 4/4 backbeat: kick on beats 1 & 3, snare on beats 2 & 4, closed
 * hi-hat on every eighth (8 hats). Drum notes are one 16th step long (0.25
 * beat). Kicks/snares coincide with hats but differ in pitch, so all 12 are
 * distinct. Ableton beats: kick 0,2 — snare 1,3 — hats 0,0.5,…,3.5.
 */
const EXPECTED: ExpectedNote[] = [
  { pitch: KICK, start: 0, duration: 0.25 },
  { pitch: KICK, start: 2, duration: 0.25 },
  { pitch: SNARE, start: 1, duration: 0.25 },
  { pitch: SNARE, start: 3, duration: 0.25 },
  { pitch: HIHAT, start: 0, duration: 0.25 },
  { pitch: HIHAT, start: 0.5, duration: 0.25 },
  { pitch: HIHAT, start: 1, duration: 0.25 },
  { pitch: HIHAT, start: 1.5, duration: 0.25 },
  { pitch: HIHAT, start: 2, duration: 0.25 },
  { pitch: HIHAT, start: 2.5, duration: 0.25 },
  { pitch: HIHAT, start: 3, duration: 0.25 },
  { pitch: HIHAT, start: 3.5, duration: 0.25 },
];

export const abstarkDrumRoundtrip: EvalScenario = abstarkScenario({
  id: "abstark-drum-roundtrip",
  description:
    "Abstark drum backbeat round-trips through the positional 16th-note grid",
  prompt:
    "On the Drums track, create a 1-bar drum clip in scene 1: kick on beats 1 and 3, snare on beats 2 and 4, and a closed hi-hat on every eighth note (8 hi-hats total).",
  slots: [`${DRUMS_TRACK}/0`],
  checks: [
    abstarkClipStateAssertion(`${DRUMS_TRACK}/0`, "4/4", (events) =>
      notesMatch(events, EXPECTED),
    ),
  ],
  judgePrompt: `Evaluate if the assistant:
1. Created a 1-bar 4/4 drum clip with kick on beats 1 & 3, snare on beats 2 & 4, and a closed hi-hat on every eighth (8 hats)
2. Placed the kick (Ableton beats 0, 2), snare (beats 1, 3), and hats (beats 0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5) on the correct 16th-grid steps
3. Kept the three instruments on their own pitches (kick 36, snare 38, hi-hat 42) — a clean backbeat, nothing dropped or doubled`,
});
