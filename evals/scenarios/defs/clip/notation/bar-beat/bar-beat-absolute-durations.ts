// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenarios for bar|beat absolute-duration semantics.
 *
 * Run on `dev` and `main` and compare. Headline invariant: `n/4` is one quarter
 * note in any meter. Metrics: parse-error rate (expected to rise on dev) and
 * final-correctness (must rise on dev).
 *
 * Live Set note: these scenarios drive the meter change from the prompt
 * (ppal-update-live-set or ppal-create-clip timeSignature). Dedicated 6/8 and
 * 5/4 test sets would tighten the signal — see the eval validation tracker.
 */

import { CONNECT_MESSAGE } from "../../../../helpers/seed-connect/seed-connect.ts";
import { type EvalAssertion, type EvalScenario } from "../../../../types.ts";
import {
  clearClipSlots,
  clipStateAssertion,
} from "../../helpers/clip-scenario-helpers.ts";

const TOOL_CREATE_CLIP = "ppal-create-clip";
const TOOL_CONNECT = "ppal-connect";
const LIVE_SET = "basic-midi-4-track";
const MSG_CONNECT = CONNECT_MESSAGE;
/** Drums is track 0 in basic-midi-4-track; C1 (MIDI 36) is the kick. */
const DRUMS_TRACK = 0;
const KICK_PITCH = 36;
/** Float tolerance for note start_time / duration comparisons (in beats). */
const EPS = 1e-6;
/** 12 eighth-note triplets filling a 4/4 bar — a kick every 1/3 beat. */
const EIGHTH_TRIPLET_STARTS = Array.from({ length: 12 }, (_, i) => i / 3);
/** 6 quarter-note triplets filling a 4/4 bar — a kick every 2/3 beat. */
const QUARTER_TRIPLET_STARTS = Array.from({ length: 6 }, (_, i) => (i * 2) / 3);
/** 6/8 compound two-feel: dotted-quarter pulse at eighth-beats 1,4 → Ableton beats 0, 1.5. */
const COMPOUND_TWO_FEEL_STARTS = [0, 1.5];
/** 12/8 compound four-feel: dotted-quarter pulse at eighth-beats 1,4,7,10 → Ableton beats 0, 1.5, 3, 4.5. */
const COMPOUND_FOUR_FEEL_STARTS = [0, 1.5, 3, 4.5];

/**
 * Build a `state` assertion that reads the clip in `slot` back from Live and
 * verifies its kicks (C1) land on `expectedStarts` — and, when
 * `expectedDuration` is given, that each kick lasts exactly that many quarter
 * beats. Positions are the signal that counts alone cannot see: only they
 * distinguish correct compound-meter spacing (6/8 quarters at Ableton beats
 * [0,1,2]) from the eighths trap ([0,0.5,1]), and correct triplet spacing
 * (every 1/3 beat) from notes bunched onto the straight grid.
 *
 * Reading final clip state (not the create-clip transcript) makes the check
 * immune to tool-error result strings and to which of several create-clip calls
 * "won" — it grades the outcome, not the path.
 *
 * @param slot - Session clip slot to read (trackIndex/sceneIndex)
 * @param meter - Expected time signature (e.g. "6/8")
 * @param expectedStarts - Expected note start_times in Ableton quarter beats
 * @param expectedDuration - Expected per-note duration in quarter beats; omit to
 *   check spacing only (e.g. drum-hit triplets, where duration is not the signal)
 * @returns State assertion
 */
function assertClipNotes(
  slot: string,
  meter: string,
  expectedStarts: number[],
  expectedDuration?: number,
): EvalAssertion {
  return clipStateAssertion(slot, meter, (events) => {
    const starts = events.map((e) => e.start_time).toSorted((a, b) => a - b);

    if (starts.length !== expectedStarts.length) return false;

    const positionsMatch = starts.every(
      (s, i) => Math.abs(s - (expectedStarts[i] as number)) < EPS,
    );
    // Every note must be the kick (C1). When a duration is given, pin each
    // note's length too — that's the absolute-duration invariant `n/4` tests.
    // When omitted, the spacing alone is the signal (e.g. triplet drum hits).
    const notesValid = events.every(
      (e) =>
        e.pitch === KICK_PITCH &&
        (expectedDuration == null ||
          Math.abs(e.duration - expectedDuration) < EPS),
    );

    return positionsMatch && notesValid;
  });
}

/**
 * Common assertion head shared by every create-clip scenario below: connect
 * ran (turn 0) and the model issued a create-clip (turn 1). Each scenario
 * appends its own per-clip note assertions.
 *
 * @returns The leading assertions every create-clip scenario shares
 */
function createClipAssertionHead(): EvalAssertion[] {
  return [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
    { type: "tool_called", tool: TOOL_CREATE_CLIP, turn: 1 },
  ];
}

/**
 * Triplet durations: eighth-note triplets (n/12) and quarter-note triplets
 * (n/6) are the model's weakest prior. This is the single scenario most
 * likely to expose meter-relative-vs-absolute confusion.
 */
export const barBeatTriplets: EvalScenario = {
  id: "bar-beat-triplets",
  description:
    "Triplet durations (n/12, n/6) — most likely failure mode for absolute notation",
  kind: "capability",
  liveSet: LIVE_SET,
  // The state assertions re-read the clip and pin exact note positions +
  // durations — that is the whole grade. No LLM judge: they miscount bar|beat
  // notation and mis-flag the correct meter-aware `Nbar` token.

  messages: [
    MSG_CONNECT,
    "On the Drums track, create a 1-bar MIDI clip in scene 1. Fill the bar with eighth-note triplets on the kick (C1) — that's 12 evenly-spaced kicks.",
    "Now make a separate 1-bar clip on the Drums track in scene 2 with quarter-note triplets on the kick (C1) — 6 evenly-spaced kicks across the bar.",
  ],

  setup: (mcpClient) =>
    clearClipSlots(mcpClient, [`${DRUMS_TRACK}/0`, `${DRUMS_TRACK}/1`]),

  assertions: [
    ...createClipAssertionHead(),

    // Read each clip back and assert the kicks land on the triplet grid.
    // Counts alone can't see spacing: 12 notes bunched onto straight 16ths
    // (3 beats, beat 4 empty) would still count 12. Triplet spacing IS the
    // signal here, so positions are asserted strictly; duration is omitted
    // (a triplet drum hit's length is not what's under test).
    assertClipNotes(`${DRUMS_TRACK}/0`, "4/4", EIGHTH_TRIPLET_STARTS),
    assertClipNotes(`${DRUMS_TRACK}/1`, "4/4", QUARTER_TRIPLET_STARTS),

    { type: "token_usage", metric: "inputTokens", maxTokens: 80_000 },
  ],
};

/**
 * Meter-fill as quarter counts. In 5/4, the bar is 5 quarter notes; one note
 * filling the bar has duration n5/4. In 6/8, the bar is 3 quarter notes; the
 * filling note is n3/4. Tests whether "teach quarter-counting, not
 * meter-matching" survived into model behavior.
 */
export const barBeatMeterFill: EvalScenario = {
  id: "bar-beat-meter-fill",
  description:
    "Bar-filling note duration in 5/4 and 6/8 (n5/4, n3/4) — quarter-counting test",
  kind: "capability",
  liveSet: LIVE_SET,
  // The state assertions re-read the clip and pin exact note positions +
  // durations — that is the whole grade. No LLM judge: they miscount bar|beat
  // notation and mis-flag the correct meter-aware `Nbar` token.

  messages: [
    MSG_CONNECT,
    "On the Drums track, create a 1-bar clip in scene 1 in 5/4 time. Put one kick (C1) at the start of the bar with a duration that fills the entire bar.",
    "On the Drums track, also create a 1-bar clip in scene 2 in 6/8 time. Put one kick (C1) at the start of the bar with a duration that fills the entire bar.",
  ],

  setup: (mcpClient) =>
    clearClipSlots(mcpClient, [`${DRUMS_TRACK}/0`, `${DRUMS_TRACK}/1`]),

  assertions: [
    ...createClipAssertionHead(),

    // Read each clip back and assert ONE kick at the bar start whose duration
    // fills the bar. Count + timeSignature alone can't see that: a 1-quarter
    // kick in a 5/4 clip would still count 1. The duration IS the point — a
    // bar-filling note is n5/4 (5 quarters) in 5/4 and n3/4 (3 quarters) in
    // 6/8 — so the duration is asserted, which also subsumes the meter check.
    assertClipNotes(`${DRUMS_TRACK}/0`, "5/4", [0], 5),
    assertClipNotes(`${DRUMS_TRACK}/1`, "6/8", [0], 3),

    { type: "token_usage", metric: "inputTokens", maxTokens: 80_000 },
  ],
};

/**
 * Compound-meter felt-beat pulse. In 6/8, 9/8, and 12/8 the *felt* beat is a
 * dotted quarter (3 eighths), not the notated eighth. "A kick on every beat"
 * therefore means the dotted-quarter pulse: 6/8 → 2 hits, 12/8 → 4 hits, at
 * eighth-beats 1,4,(7,10) → Ableton beats 0, 1.5, (3, 4.5). This sits in the
 * gap between the quarter-count uniformity scenario (6/8 → 3 kicks) and the
 * triplet-subdivision scenario (6/8 → 12 kicks): the model must group eighths
 * into dotted-quarter beats — not hit every eighth (over-subdivided), not count
 * quarters, not miscount. Expressible today via the repeat pattern
 * `C1 1|1x4@n3/8`.
 */
export const barBeatCompoundFeelPulse: EvalScenario = {
  id: "bar-beat-compound-feel-pulse",
  description:
    "Compound felt pulse (dotted-quarter beat) in 6/8 and 12/8 — 2 and 4 kicks at eighths 1,4,(7,10)",
  kind: "capability",
  liveSet: LIVE_SET,
  // The state assertions re-read the clip and pin exact note positions +
  // durations — that is the whole grade. No LLM judge: they miscount bar|beat
  // notation and mis-flag the correct meter-aware `Nbar` token.

  messages: [
    MSG_CONNECT,
    "On the Drums track, create a 1-bar MIDI clip in scene 1 in 6/8 time with a compound two-feel groove: put a kick (C1) on each main pulse — the dotted-quarter beat. That's 2 kicks in the bar.",
    "Now create a separate 1-bar clip on the Drums track in scene 2 in 12/8 time with a compound four-feel: a kick (C1) on each main pulse (the dotted-quarter beat) — 4 kicks in the bar.",
  ],

  setup: (mcpClient) =>
    clearClipSlots(mcpClient, [`${DRUMS_TRACK}/0`, `${DRUMS_TRACK}/1`]),

  assertions: [
    ...createClipAssertionHead(),

    // Read each clip back and assert the kicks fall on the dotted-quarter pulse.
    // Count alone is weak — 2 hits in 6/8 could land anywhere — so positions are
    // the signal: eighth-beats 1,4 (Ableton 0, 1.5) in 6/8 and 1,4,7,10
    // (0, 1.5, 3, 4.5) in 12/8. This rejects a hit on every eighth
    // (over-subdivided) and a quarter-count. Duration is omitted: the canonical
    // answer `C1 1|1x4@n3/8` leaves each hit at the default quarter length, so
    // the pulse PLACEMENT, not the note length, is what's under test.
    assertClipNotes(`${DRUMS_TRACK}/0`, "6/8", COMPOUND_TWO_FEEL_STARTS),
    assertClipNotes(`${DRUMS_TRACK}/1`, "12/8", COMPOUND_FOUR_FEEL_STARTS),

    { type: "token_usage", metric: "inputTokens", maxTokens: 80_000 },
  ],
};

/**
 * Cross-meter invariant: the same musical duration should produce the same
 * note count when the prompt names absolute durations. A quarter note is a
 * quarter note in 4/4, 5/4, and 6/8.
 */
export const barBeatAbsoluteDurationUniformity: EvalScenario = {
  id: "bar-beat-absolute-duration-uniformity",
  description:
    "Same `n` fraction across meters — quarter notes filling 4/4, 6/8, 5/4",
  kind: "capability",
  liveSet: LIVE_SET,
  // The state assertions re-read the clip and pin exact note positions +
  // durations — that is the whole grade. No LLM judge: they miscount bar|beat
  // notation and mis-flag the correct meter-aware `Nbar` token.

  messages: [
    MSG_CONNECT,
    "On the Drums track, create three 1-bar clips, one per scene: scene 1 in 4/4, scene 2 in 6/8, scene 3 in 5/4. Each clip has a kick (C1) on every quarter note that fills the bar.",
  ],

  // Clear the three target slots so a run against an already-open Live Set
  // doesn't inherit clips from a previous one (which would otherwise trigger a
  // delete/recreate dance and mask the real behavior).
  setup: (mcpClient) =>
    clearClipSlots(mcpClient, [
      `${DRUMS_TRACK}/0`,
      `${DRUMS_TRACK}/1`,
      `${DRUMS_TRACK}/2`,
    ]),

  assertions: [
    ...createClipAssertionHead(),

    // Read each clip back from Live and assert the kicks land on the
    // quarter-note grid with one-quarter durations. Positions — not just
    // counts — are the only signal that catches the 6/8 eighths trap
    // (3 kicks at [0,0.5,1] instead of quarters at [0,1,2]).
    assertClipNotes(`${DRUMS_TRACK}/0`, "4/4", [0, 1, 2, 3], 1),
    assertClipNotes(`${DRUMS_TRACK}/1`, "6/8", [0, 1, 2], 1),
    assertClipNotes(`${DRUMS_TRACK}/2`, "5/4", [0, 1, 2, 3, 4], 1),

    { type: "token_usage", metric: "inputTokens", maxTokens: 80_000 },
  ],
};
