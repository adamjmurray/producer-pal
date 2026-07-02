// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Notation-matrix scenarios: the same musical task authored under each notation
 * so their pass rates are directly comparable. Notation-neutral specs (drum
 * backbeat, chromatic pitch, mixed-duration rhythm) — see notation-matrix.ts for
 * the factory and the grading/representability rules.
 *
 * Run the whole matrix with `-a` (add `--small-model` for the basic-tier
 * comparison), or a single family with repeated `-t`, e.g.
 * `-t drum-backbeat-stark -t drum-backbeat-barbeat`.
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

// Drum-pad expectations as any-of sets, so the SAME expected notes grade every
// notation (the matrix invariant). stark maps a drum name to a fixed GM
// pitch (snare→38, closed hat→42); a bar|beat/midi-json model instead reads
// basic-midi-4-track's Drum Rack and picks whatever pad IT labels a snare/closed
// hat. In that rack D1(38) is actually a Rim and the real snares are Eb1(39) &
// E1(40); closed hats sit on BOTH Gb1(42) and Ab1(44). Accepting each family
// keeps a rack that isn't strictly GM-aligned from rewarding the notation that
// happens to hardcode GM while failing the model that correctly read the map.
// Kick (C1=36) is unambiguous in both worlds, so it stays a single pitch.
/** Kick: GM and the rack agree on C1. */
const KICK = 36;
/** Snare family: GM name-pitch (38) plus the rack's two real snares (39, 40). */
const SNARE = [38, 39, 40];
/** Closed hi-hat family: both pads this rack labels "Hihat Closed Trad". */
const HIHAT = [42, 44];

/**
 * One-bar 4/4 groove: four-on-the-floor kick (every beat), snare on 2 & 4,
 * closed hi-hat on every sixteenth (16 hats). Deliberately far from the
 * every-eighth-hats + 1&3-kick backbeat shown in the stark skill
 * examples — the model must derive BOTH the kick and hi-hat patterns rather than
 * copy the taught one, so this measures notation generalization, not recall.
 * Duration is NOT asserted — drum hits are one-shots and their length is
 * notation-dependent, so grading pitch + start keeps the comparison fair.
 * Ableton beats: kick 0,1,2,3 — snare 1,3 — hats 0,0.25,…,3.75.
 */
const GROOVE: ExpectedNote[] = [
  { pitch: KICK, start: 0 },
  { pitch: KICK, start: 1 },
  { pitch: KICK, start: 2 },
  { pitch: KICK, start: 3 },
  { pitch: SNARE, start: 1 },
  { pitch: SNARE, start: 3 },
  ...Array.from({ length: 16 }, (_, i) => ({
    pitch: HIHAT,
    start: i * 0.25,
  })),
];

/** All four notations: exact GM pitches on the 16th grid, representable in each. */
export const drumBackbeatMatrix = notationNeutralScenarios({
  baseId: "drum-backbeat",
  description:
    "Drum groove: four-on-the-floor kick, snare 2&4, hi-hat every sixteenth",
  track: DRUMS_TRACK,
  meter: "4/4",
  prompt:
    "On the Drums track, create a 1-bar drum clip in scene 1: a four-on-the-floor kick (on every beat), snare on beats 2 and 4, and a closed hi-hat on every sixteenth note (16 hi-hats total).",
  expected: GROOVE,
});

/**
 * Bar 1 ascends C3, E3, G3 then leaps an octave to C4; bar 2 descends
 * chromatically B3, Bb3, A3, Ab3. Eight quarter notes across two 4/4 bars
 * (Ableton beats 0–7). Exact chromatic pitches — representable in every notation
 * now that stark is literal (post-rework), so all four run.
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

/** Exact chromatic pitches — all four notations (stark is literal post-rework). */
export const melodyPitchMatrix = notationNeutralScenarios({
  baseId: "melody-pitch",
  description:
    "Melody with an octave leap and a chromatic descent — exact pitches",
  track: LEAD_TRACK,
  meter: "4/4",
  prompt:
    "On the Lead track, create a 2-bar MIDI clip in scene 1 with this quarter-note melody, one note per beat: bar 1 ascends C3, E3, G3, then leaps up an octave to C4; bar 2 descends chromatically B3, Bb3, A3, Ab3.",
  expected: CHROMATIC_MELODY,
});

/**
 * One 4/4 bar on C3 (MIDI 60): a quarter on beat 1, two eighths on beat 2, four
 * sixteenths on beat 3, a quarter on beat 4 — Ableton beats 0, 1, 1.5, 2, 2.25,
 * 2.5, 2.75, 3. Sub-quarter durations — representable in every notation now that
 * stark has absolute /N durations (post-rework), so all four run.
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

/** Sub-quarter durations — all four notations (stark has /N durations now). */
export const rhythmGridMatrix = notationNeutralScenarios({
  baseId: "rhythm-grid",
  description: "Single-pitch bar mixing quarter, eighth, and sixteenth notes",
  track: LEAD_TRACK,
  meter: "4/4",
  prompt:
    "On the Lead track, create a 1-bar MIDI clip in scene 1 with every note on C3: a quarter note on beat 1, two eighth notes on beat 2, four sixteenth notes on beat 3, and a quarter note on beat 4.",
  expected: MIXED_RHYTHM,
});
