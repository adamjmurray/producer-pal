// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Notation-matrix scenarios: the same musical task authored under each notation
 * so their pass rates are directly comparable. Converted from the original
 * Abstark-only scenarios (drum backbeat, chromatic pitch, mixed-duration rhythm)
 * into notation-neutral specs — see notation-matrix.ts for the factory and the
 * grading/representability rules.
 *
 * Run the whole matrix with `-a` (add `--small-model` for the basic-tier
 * comparison), or a single family with repeated `-t`, e.g.
 * `-t drum-backbeat-stark -t drum-backbeat-abstark`.
 *
 * Prompts use Ableton pitch naming (C3 = MIDI 60), matching everything else the
 * model sees in Producer Pal; the grader asserts MIDI numbers, so each notation's
 * own pitch spelling is transparent to it.
 */

import { type ExpectedNote } from "../clip-scenario-helpers.ts";
import {
  DRUMS_TRACK,
  LEAD_TRACK,
  notationNeutralScenarios,
} from "./notation-matrix.ts";

/** GM drum pitches the standard drum names map to (kick/snare/hi-hat). */
const KICK = 36;
const SNARE = 38;
const HIHAT = 42;

/**
 * One-bar 4/4 backbeat: kick on beats 1 & 3, snare on 2 & 4, closed hi-hat on
 * every eighth (8 hats). Duration is NOT asserted — drum hits are one-shots and
 * their length is notation-dependent (a fixed 16th step in abstark/stark, the
 * model's pick in bar|beat / midi-json), so grading pitch + start keeps the
 * comparison fair. Ableton beats: kick 0,2 — snare 1,3 — hats 0,0.5,…,3.5.
 */
const BACKBEAT: ExpectedNote[] = [
  { pitch: KICK, start: 0 },
  { pitch: KICK, start: 2 },
  { pitch: SNARE, start: 1 },
  { pitch: SNARE, start: 3 },
  { pitch: HIHAT, start: 0 },
  { pitch: HIHAT, start: 0.5 },
  { pitch: HIHAT, start: 1 },
  { pitch: HIHAT, start: 1.5 },
  { pitch: HIHAT, start: 2 },
  { pitch: HIHAT, start: 2.5 },
  { pitch: HIHAT, start: 3 },
  { pitch: HIHAT, start: 3.5 },
];

/** All four notations: a GM backbeat is exact-pitch and representable in each. */
export const drumBackbeatMatrix = notationNeutralScenarios({
  baseId: "drum-backbeat",
  description: "Drum backbeat: kick 1&3, snare 2&4, hi-hat every eighth",
  track: DRUMS_TRACK,
  meter: "4/4",
  prompt:
    "On the Drums track, create a 1-bar drum clip in scene 1: kick on beats 1 and 3, snare on beats 2 and 4, and a closed hi-hat on every eighth note (8 hi-hats total).",
  expected: BACKBEAT,
  judgePrompt: `Evaluate if the assistant:
1. Created a 1-bar 4/4 drum clip with kick on beats 1 & 3, snare on beats 2 & 4, and a closed hi-hat on every eighth (8 hats)
2. Placed the kick (Ableton beats 0, 2), snare (beats 1, 3), and hats (beats 0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5) on the correct grid positions
3. Kept the three instruments on their own pitches (kick 36, snare 38, hi-hat 42) — a clean backbeat, nothing dropped or doubled`,
});

/**
 * Bar 1 ascends C3, E3, G3 then leaps an octave to C4; bar 2 descends
 * chromatically B3, Bb3, A3, Ab3. Eight quarter notes across two 4/4 bars
 * (Ableton beats 0–7). Exact chromatic pitches, so stark (scale-snapped, no
 * accidentals) is omitted.
 */
const CHROMATIC_MELODY: ExpectedNote[] = [
  { pitch: 60, start: 0, duration: 1 }, // C3
  { pitch: 64, start: 1, duration: 1 }, // E3
  { pitch: 67, start: 2, duration: 1 }, // G3
  { pitch: 72, start: 3, duration: 1 }, // C4 (octave leap)
  { pitch: 71, start: 4, duration: 1 }, // B3
  { pitch: 70, start: 5, duration: 1 }, // Bb3
  { pitch: 69, start: 6, duration: 1 }, // A3
  { pitch: 68, start: 7, duration: 1 }, // Ab3
];

/** Exact chromatic pitches → bar|beat / abstark / midi-json only (no stark). */
export const melodyPitchMatrix = notationNeutralScenarios({
  baseId: "melody-pitch",
  description:
    "Melody with an octave leap and a chromatic descent — exact pitches",
  track: LEAD_TRACK,
  meter: "4/4",
  notations: ["barbeat", "abstark", "midi-json"],
  prompt:
    "On the Lead track, create a 2-bar MIDI clip in scene 1 with this quarter-note melody, one note per beat: bar 1 ascends C3, E3, G3, then leaps up an octave to C4; bar 2 descends chromatically B3, Bb3, A3, Ab3.",
  expected: CHROMATIC_MELODY,
  judgePrompt: `Evaluate if the assistant:
1. Created a 2-bar 4/4 clip with eight quarter notes, one per beat (Ableton beats 0-7)
2. Bar 1 ascends C3, E3, G3 then leaps an OCTAVE up to C4 (MIDI 60, 64, 67, 72)
3. Bar 2 descends by exact chromatic half-steps: B3, Bb3, A3, Ab3 (MIDI 71, 70, 69, 68) — not a diatonic/scale approximation`,
});

/**
 * One 4/4 bar on C3 (MIDI 60): a quarter on beat 1, two eighths on beat 2, four
 * sixteenths on beat 3, a quarter on beat 4 — Ableton beats 0, 1, 1.5, 2, 2.25,
 * 2.5, 2.75, 3. Sub-quarter durations, so stark (quarter/16th grid only, no
 * clean eighths) is omitted.
 */
const MIXED_RHYTHM: ExpectedNote[] = [
  { pitch: 60, start: 0, duration: 1 }, // quarter, beat 1
  { pitch: 60, start: 1, duration: 0.5 }, // eighth, beat 2
  { pitch: 60, start: 1.5, duration: 0.5 }, // eighth, beat 2.5
  { pitch: 60, start: 2, duration: 0.25 }, // sixteenth, beat 3
  { pitch: 60, start: 2.25, duration: 0.25 },
  { pitch: 60, start: 2.5, duration: 0.25 },
  { pitch: 60, start: 2.75, duration: 0.25 },
  { pitch: 60, start: 3, duration: 1 }, // quarter, beat 4
];

/** Sub-quarter durations → bar|beat / abstark / midi-json only (no stark). */
export const rhythmGridMatrix = notationNeutralScenarios({
  baseId: "rhythm-grid",
  description: "Single-pitch bar mixing quarter, eighth, and sixteenth notes",
  track: LEAD_TRACK,
  meter: "4/4",
  notations: ["barbeat", "abstark", "midi-json"],
  prompt:
    "On the Lead track, create a 1-bar MIDI clip in scene 1 with every note on C3: a quarter note on beat 1, two eighth notes on beat 2, four sixteenth notes on beat 3, and a quarter note on beat 4.",
  expected: MIXED_RHYTHM,
  judgePrompt: `Evaluate if the assistant:
1. Created a 1-bar 4/4 clip with eight notes, all on C3 (MIDI 60)
2. Used the right absolute durations: a quarter (beat 1), two eighths (beat 2), four sixteenths (beat 3), a quarter (beat 4)
3. Placed them at the correct grid positions (Ableton beats 0, 1, 1.5, 2, 2.25, 2.5, 2.75, 3) — the sixteenths tightly packed, NOT spread as eighths or quarters`,
});
