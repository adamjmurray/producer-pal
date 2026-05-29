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

import { getToolCalls } from "../../../assertions/index.ts";
import {
  type EvalAssertion,
  type EvalScenario,
  type EvalTurnResult,
} from "../../../types.ts";

const TOOL_CREATE_CLIP = "ppal-create-clip";
const TOOL_CONNECT = "ppal-connect";
const LIVE_SET = "basic-midi-4-track";
const MSG_CONNECT = "Connect to Ableton Live";

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

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },

    { type: "tool_called", tool: TOOL_CREATE_CLIP, turn: 1 },

    // Across all create-clip calls in turn 1, expect counts 4, 3, 5 (one per
    // meter) — but allow them in any order, and allow a single batched call
    // that returns the merged count instead.
    {
      type: "custom",
      description: "quarter notes-per-bar match meters (4/4→4, 6/8→3, 5/4→5)",
      assert: (turns) => {
        const calls = getToolCalls(turns, 1).filter(
          (c) => c.name === TOOL_CREATE_CLIP,
        );

        if (calls.length === 0) {
          throw new Error("no ppal-create-clip calls in turn 1");
        }

        // Collect (timeSignature, noteCount) pairs across all create-clip
        // calls. A single call may carry per-clip arrays; rely on the
        // returned clips[] for the breakdown when present.
        const pairs: Array<{ ts: string; count: number }> = [];

        for (const c of calls) {
          const result = JSON.parse(String(c.result ?? "{}")) as Record<
            string,
            unknown
          >;
          const clips = result.clips as
            | Array<Record<string, unknown>>
            | undefined;

          if (clips && clips.length > 0) {
            for (const clip of clips) {
              pairs.push({
                ts: String(clip.timeSignature ?? ""),
                count: Number(clip.noteCount ?? 0),
              });
            }
          } else {
            pairs.push({
              ts: String(
                (c.args.timeSignature as string | undefined) ??
                  result.timeSignature ??
                  "",
              ),
              count: Number(result.noteCount ?? 0),
            });
          }
        }

        const expected = new Map([
          ["4/4", 4],
          ["6/8", 3],
          ["5/4", 5],
        ]);

        for (const [ts, want] of expected) {
          const match = pairs.find((p) => p.ts === ts);

          if (!match) {
            throw new Error(
              `no clip with timeSignature ${ts}. got: ${JSON.stringify(pairs)}`,
            );
          }

          if (match.count !== want) {
            throw new Error(
              `${ts}: expected ${want} notes, got ${match.count}`,
            );
          }
        }

        return true;
      },
    },

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
