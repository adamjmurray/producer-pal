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

import { interpretNotation } from "#src/notation/barbeat/interpreter/barbeat-interpreter.ts";
import { type EvalAssertion, type EvalScenario } from "../../../types.ts";
import { clearSessionSlots } from "../clip-scenario-helpers.ts";

const TOOL_CREATE_CLIP = "ppal-create-clip";
const TOOL_CONNECT = "ppal-connect";
const TOOL_READ_CLIP = "ppal-read-clip";
const LIVE_SET = "basic-midi-4-track";
const MSG_CONNECT = "Connect to Ableton Live";
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
  const [numerator, denominator] = meter.split("/").map(Number);

  return {
    type: "state",
    tool: TOOL_READ_CLIP,
    args: { slot, include: ["notes", "timing"] },
    expect: (result: unknown): boolean => {
      const clip = result as { notes?: string; timeSignature?: string };

      if (clip.timeSignature !== meter || !clip.notes) return false;

      let events;

      try {
        events = interpretNotation(clip.notes, {
          timeSigNumerator: numerator,
          timeSigDenominator: denominator,
        });
      } catch {
        return false; // unparseable notation — treat as a failed clip
      }

      const starts = events.map((e) => e.start_time).sort((a, b) => a - b);

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
    },
  };
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
  // Deterministic state assertions re-read the clip and pin exact note
  // positions + durations — that is the authoritative grade here. The judge
  // stays for qualitative commentary but is advisory: LLM judges miscount
  // bar|beat notation (and mis-flag the correct meter-aware `Nbar` token), so
  // it must not flip a passing run to fail.
  judgeAdvisory: true,

  messages: [
    MSG_CONNECT,
    "On the Drums track, create a 1-bar MIDI clip in scene 1. Fill the bar with eighth-note triplets on the kick (C1) — that's 12 evenly-spaced kicks.",
    "Now make a separate 1-bar clip on the Drums track in scene 2 with quarter-note triplets on the kick (C1) — 6 evenly-spaced kicks across the bar.",
  ],

  setup: (mcpClient) =>
    clearSessionSlots(mcpClient, [`${DRUMS_TRACK}/0`, `${DRUMS_TRACK}/1`]),

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
    { type: "tool_called", tool: TOOL_CREATE_CLIP, turn: 1 },

    // Read each clip back and assert the kicks land on the triplet grid.
    // Counts alone can't see spacing: 12 notes bunched onto straight 16ths
    // (3 beats, beat 4 empty) would still count 12. Triplet spacing IS the
    // signal here, so positions are asserted strictly; duration is omitted
    // (a triplet drum hit's length is not what's under test).
    assertClipNotes(`${DRUMS_TRACK}/0`, "4/4", EIGHTH_TRIPLET_STARTS),
    assertClipNotes(`${DRUMS_TRACK}/1`, "4/4", QUARTER_TRIPLET_STARTS),

    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Created a 1-bar clip with eighth-note triplets (12 kicks spanning the bar)
2. Created a second 1-bar clip with quarter-note triplets (6 kicks spanning the bar)
3. Used an appropriate triplet duration (e.g. n/12 and n/6 in the new absolute notation, or equivalent expressions)
4. Did NOT produce a clip with the wrong number of notes`,
    },

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
  // Deterministic state assertions re-read the clip and pin exact note
  // positions + durations — that is the authoritative grade here. The judge
  // stays for qualitative commentary but is advisory: LLM judges miscount
  // bar|beat notation (and mis-flag the correct meter-aware `Nbar` token), so
  // it must not flip a passing run to fail.
  judgeAdvisory: true,

  messages: [
    MSG_CONNECT,
    "On the Drums track, create a 1-bar clip in scene 1 in 5/4 time. Put one kick (C1) at the start of the bar with a duration that fills the entire bar.",
    "On the Drums track, also create a 1-bar clip in scene 2 in 6/8 time. Put one kick (C1) at the start of the bar with a duration that fills the entire bar.",
  ],

  setup: (mcpClient) =>
    clearSessionSlots(mcpClient, [`${DRUMS_TRACK}/0`, `${DRUMS_TRACK}/1`]),

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
    { type: "tool_called", tool: TOOL_CREATE_CLIP, turn: 1 },

    // Read each clip back and assert ONE kick at the bar start whose duration
    // fills the bar. Count + timeSignature alone can't see that: a 1-quarter
    // kick in a 5/4 clip would still count 1. The duration IS the point — a
    // bar-filling note is n5/4 (5 quarters) in 5/4 and n3/4 (3 quarters) in
    // 6/8 — so the duration is asserted, which also subsumes the meter check.
    assertClipNotes(`${DRUMS_TRACK}/0`, "5/4", [0], 5),
    assertClipNotes(`${DRUMS_TRACK}/1`, "6/8", [0], 3),

    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Created a 5/4 clip with one kick whose duration spans the full bar (5 quarter notes; n5/4 and the meter-aware bar token 1bar both resolve to this)
2. Created a 6/8 clip with one kick whose duration spans the full bar (3 quarter notes, since 6 eighths = 3 quarters; n3/4 and 1bar both resolve to this)
3. Note: the bar duration token "1bar"/"Nbar" is CORRECT here — it is meter-aware and resolves to the right number of quarters per meter. Only flag a duration that is wrong in actual length (e.g. a bare/unitless "1" treated as one quarter, or a fixed quarter count copied across meters). Do NOT penalize 1bar/Nbar.`,
    },

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
  // Deterministic state assertions re-read the clip and pin exact note
  // positions + durations — that is the authoritative grade here. The judge
  // stays for qualitative commentary but is advisory: LLM judges miscount
  // bar|beat notation (and mis-flag the correct meter-aware `Nbar` token), so
  // it must not flip a passing run to fail.
  judgeAdvisory: true,

  messages: [
    MSG_CONNECT,
    "On the Drums track, create a 1-bar MIDI clip in scene 1 in 6/8 time with a compound two-feel groove: put a kick (C1) on each main pulse — the dotted-quarter beat. That's 2 kicks in the bar.",
    "Now create a separate 1-bar clip on the Drums track in scene 2 in 12/8 time with a compound four-feel: a kick (C1) on each main pulse (the dotted-quarter beat) — 4 kicks in the bar.",
  ],

  setup: (mcpClient) =>
    clearSessionSlots(mcpClient, [`${DRUMS_TRACK}/0`, `${DRUMS_TRACK}/1`]),

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
    { type: "tool_called", tool: TOOL_CREATE_CLIP, turn: 1 },

    // Read each clip back and assert the kicks fall on the dotted-quarter pulse.
    // Count alone is weak — 2 hits in 6/8 could land anywhere — so positions are
    // the signal: eighth-beats 1,4 (Ableton 0, 1.5) in 6/8 and 1,4,7,10
    // (0, 1.5, 3, 4.5) in 12/8. This rejects a hit on every eighth
    // (over-subdivided) and a quarter-count. Duration is omitted: the canonical
    // answer `C1 1|1x4@n3/8` leaves each hit at the default quarter length, so
    // the pulse PLACEMENT, not the note length, is what's under test.
    assertClipNotes(`${DRUMS_TRACK}/0`, "6/8", COMPOUND_TWO_FEEL_STARTS),
    assertClipNotes(`${DRUMS_TRACK}/1`, "12/8", COMPOUND_FOUR_FEEL_STARTS),

    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Created a 6/8 clip with 2 kicks on the felt dotted-quarter pulse (eighth-beats 1 and 4 — Ableton beats 0 and 1.5), NOT a kick on every eighth and NOT 3 quarter-note kicks
2. Created a 12/8 clip with 4 kicks on the felt dotted-quarter pulse (eighth-beats 1, 4, 7, 10 — Ableton beats 0, 1.5, 3, 4.5)
3. Grouped the eighths into dotted-quarter beats rather than placing a hit on every eighth (over-subdivided) or miscounting`,
    },

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
  // Deterministic state assertions re-read the clip and pin exact note
  // positions + durations — that is the authoritative grade here. The judge
  // stays for qualitative commentary but is advisory: LLM judges miscount
  // bar|beat notation (and mis-flag the correct meter-aware `Nbar` token), so
  // it must not flip a passing run to fail.
  judgeAdvisory: true,

  messages: [
    MSG_CONNECT,
    "On the Drums track, create three 1-bar clips, one per scene: scene 1 in 4/4, scene 2 in 6/8, scene 3 in 5/4. Each clip has a kick (C1) on every quarter note that fills the bar.",
  ],

  // Clear the three target slots so repeat trials (`-r N`) don't inherit clips
  // from a previous trial (which would otherwise trigger a delete/recreate
  // dance and mask the real per-trial behavior).
  setup: (mcpClient) =>
    clearSessionSlots(mcpClient, [
      `${DRUMS_TRACK}/0`,
      `${DRUMS_TRACK}/1`,
      `${DRUMS_TRACK}/2`,
    ]),

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },

    { type: "tool_called", tool: TOOL_CREATE_CLIP, turn: 1 },

    // Read each clip back from Live and assert the kicks land on the
    // quarter-note grid with one-quarter durations. Positions — not just
    // counts — are the only signal that catches the 6/8 eighths trap
    // (3 kicks at [0,0.5,1] instead of quarters at [0,1,2]).
    assertClipNotes(`${DRUMS_TRACK}/0`, "4/4", [0, 1, 2, 3], 1),
    assertClipNotes(`${DRUMS_TRACK}/1`, "6/8", [0, 1, 2], 1),
    assertClipNotes(`${DRUMS_TRACK}/2`, "5/4", [0, 1, 2, 3, 4], 1),

    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Created exactly three clips (one in 4/4, one in 6/8, one in 5/4)
2. Each clip has kicks on every quarter note that span exactly one bar:
   - 4/4: 4 kicks
   - 6/8: 3 kicks (since 6 eighths = 3 quarters)
   - 5/4: 5 kicks
3. Used absolute-duration syntax (n/4) consistently across all three meters — NOT meter-relative durations that produce different numeric values per meter`,
    },

    { type: "token_usage", metric: "inputTokens", maxTokens: 80_000 },
  ],
};
