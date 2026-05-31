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
import { getToolCalls } from "../../../assertions/index.ts";
import {
  type EvalAssertion,
  type EvalScenario,
  type EvalTurnResult,
} from "../../../types.ts";
import { clearSessionSlots } from "../clip-scenario-helpers.ts";

const TOOL_CREATE_CLIP = "ppal-create-clip";
const TOOL_CONNECT = "ppal-connect";
const TOOL_READ_CLIP = "ppal-read-clip";
const LIVE_SET = "basic-midi-4-track";
const MSG_CONNECT = "Connect to Ableton Live";
/** Drums is track 0 in basic-midi-4-track; C1 (MIDI 36) is the kick. */
const DRUMS_TRACK = 0;
const KICK_PITCH = 36;

/**
 * Find a ppal-create-clip call in the given turn and return parsed result.
 *
 * @param turns - All turn results
 * @param turn - Turn index to inspect
 * @returns the create-clip args + parsed result JSON
 */
function getCreateClip(
  turns: EvalTurnResult[],
  turn: number,
): {
  args: Record<string, unknown>;
  result: Record<string, unknown>;
  notes: string;
} {
  const calls = getToolCalls(turns, turn);
  const call = calls.find((c) => c.name === TOOL_CREATE_CLIP);

  if (!call) throw new Error(`${TOOL_CREATE_CLIP} not found in turn ${turn}`);
  const result = JSON.parse(String(call.result ?? "{}")) as Record<
    string,
    unknown
  >;
  const notes = String(call.args.notes ?? "");

  return { args: call.args, result, notes };
}

/**
 * Build a custom assertion that the create-clip in `turn` produced exactly
 * `expectedNoteCount` notes (or a range), regardless of how the model wrote
 * the bar|beat. Final-correctness signal.
 *
 * @param turn - Turn index to inspect
 * @param expectedNoteCount - Expected number of notes (exact)
 * @param description - Human description of the check
 * @returns Custom assertion
 */
function assertNoteCount(
  turn: number,
  expectedNoteCount: number,
  description: string,
): EvalAssertion {
  return {
    type: "custom",
    description,
    assert: (turns) => {
      const { result, notes } = getCreateClip(turns, turn);
      const noteCount = result.noteCount as number | undefined;

      if (noteCount == null) {
        throw new Error(`no noteCount in create-clip result: ${notes}`);
      }

      if (noteCount !== expectedNoteCount) {
        throw new Error(
          `expected ${expectedNoteCount} notes, got ${noteCount}. notes param: ${notes.slice(0, 120)}`,
        );
      }

      return true;
    },
  };
}

/**
 * Build a `state` assertion that reads the clip in `slot` back from Live and
 * verifies its kicks land on the quarter-note grid with absolute (one-quarter)
 * durations — the only check that distinguishes correct compound-meter spacing
 * (e.g. 6/8 quarters at Ableton beats [0,1,2]) from the eighths trap ([0,0.5,1]).
 *
 * Reading final clip state (not the create-clip transcript) makes the check
 * immune to tool-error result strings and to which of several create-clip calls
 * "won" — it grades the outcome, not the path.
 *
 * @param slot - Session clip slot to read (trackIndex/sceneIndex)
 * @param meter - Expected time signature (e.g. "6/8")
 * @param expectedStarts - Expected note start_times in Ableton quarter beats
 * @returns State assertion
 */
function assertQuarterFill(
  slot: string,
  meter: string,
  expectedStarts: number[],
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
        (s, i) => Math.abs(s - (expectedStarts[i] as number)) < 1e-6,
      );
      // Each kick must be C1 lasting exactly one quarter (1 Ableton beat in any
      // meter) — pins the absolute-duration invariant `n/4` is testing.
      const notesValid = events.every(
        (e) => e.pitch === KICK_PITCH && Math.abs(e.duration - 1) < 1e-6,
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

  messages: [
    MSG_CONNECT,
    "Create a 1-bar MIDI clip on the Drums track. Fill the bar with eighth-note triplets on the kick (C1) — that's 12 evenly-spaced kicks.",
    "Now make a separate 1-bar clip on the Drums track in the next scene with quarter-note triplets on the kick (C1) — 6 evenly-spaced kicks across the bar.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },

    // Turn 1: eighth-note triplets → 12 notes
    { type: "tool_called", tool: TOOL_CREATE_CLIP, turn: 1 },
    assertNoteCount(1, 12, "eighth-note triplets produce 12 notes in 1 bar"),

    // Turn 2: quarter-note triplets → 6 notes
    { type: "tool_called", tool: TOOL_CREATE_CLIP, turn: 2 },
    assertNoteCount(2, 6, "quarter-note triplets produce 6 notes in 1 bar"),

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

  messages: [
    MSG_CONNECT,
    "On the Drums track, create a 1-bar clip in 5/4 time. Put one kick (C1) at the start of the bar with a duration that fills the entire bar.",
    "On the Drums track, also create a 1-bar clip in 6/8 time. Put one kick (C1) at the start of the bar with a duration that fills the entire bar.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },

    // Turn 1: single note filling 5/4 bar
    { type: "tool_called", tool: TOOL_CREATE_CLIP, turn: 1 },
    assertNoteCount(1, 1, "5/4 bar fill is exactly one note"),

    {
      type: "custom",
      description: "5/4 clip carries 5/4 timeSignature",
      assert: (turns) => {
        const { args, result } = getCreateClip(turns, 1);
        const ts =
          (args.timeSignature as string | undefined) ??
          (result.timeSignature as string | undefined);

        if (ts !== "5/4") {
          throw new Error(`expected 5/4 timeSignature, got ${String(ts)}`);
        }

        return true;
      },
    },

    // Turn 2: single note filling 6/8 bar
    { type: "tool_called", tool: TOOL_CREATE_CLIP, turn: 2 },
    assertNoteCount(2, 1, "6/8 bar fill is exactly one note"),

    {
      type: "custom",
      description: "6/8 clip carries 6/8 timeSignature",
      assert: (turns) => {
        const { args, result } = getCreateClip(turns, 2);
        const ts =
          (args.timeSignature as string | undefined) ??
          (result.timeSignature as string | undefined);

        if (ts !== "6/8") {
          throw new Error(`expected 6/8 timeSignature, got ${String(ts)}`);
        }

        return true;
      },
    },

    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Created a 5/4 clip with one kick whose duration spans the full bar (would be n5/4 in absolute notation = 5 quarter notes)
2. Created a 6/8 clip with one kick whose duration spans the full bar (would be n3/4 in absolute notation = 3 quarter notes, since 6 eighths = 3 quarters)
3. Did NOT default the duration to a meter-relative "1 bar" assumption (e.g. n1 meaning the whole bar regardless of meter)`,
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
    assertQuarterFill(`${DRUMS_TRACK}/0`, "4/4", [0, 1, 2, 3]),
    assertQuarterFill(`${DRUMS_TRACK}/1`, "6/8", [0, 1, 2]),
    assertQuarterFill(`${DRUMS_TRACK}/2`, "5/4", [0, 1, 2, 3, 4]),

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
