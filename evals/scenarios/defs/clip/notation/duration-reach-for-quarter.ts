// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * AJM-448 scenario: the `n/N`-vs-bare-`1/N` "make it a quarter note" reach-for
 * split. This is the single most important behavioral metric of the v1.4.11
 * duration overhaul.
 *
 * RUN PENDING: needs Ableton (agentic — drives a live model against Live).
 *
 * When the user says "make these notes a quarter note long", the correct
 * transform is `duration = n/4` (an absolute quarter note, invariant across
 * meters). The classic failure is `duration = 1/4` — a bare fraction, which in
 * the transform arithmetic means a quarter of a BEAT (a 16th note in 4/4). The
 * two diverge by a factor of 4. The whole point of the `n` prefix is to make
 * "a quarter note" reach for `n/4`, not `1/4`.
 *
 * Metric: classify the duration assignment the model emits as `n-absolute`
 * (correct), `bare-fraction` (the failure), `decimal-beats` (e.g. 1.0 = a
 * quarter note expressed directly in beats, ambiguously acceptable), or
 * `unrecognized`. The classification — not pass/fail — is the signal; the
 * assertion only fails when no duration write happened at all.
 */

import {
  type EvalAssertion,
  type EvalScenario,
  type EvalTurnResult,
} from "../../../types.ts";
import {
  assertNotesRead,
  getTransforms,
  MSG_CONNECT,
  TOOL_CONNECT,
  TOOL_UPDATE_CLIP,
} from "../clip-scenario-helpers.ts";

const LIVE_SET = "basic-with-drum-and-lead-clips";

type DurationReach =
  | "n-absolute"
  | "bare-fraction"
  | "decimal-beats"
  | "unrecognized";

/**
 * Classify how the model expressed a "quarter note" duration in the transforms
 * of the update-clip call at `turn`.
 *
 * @param turns - All turn results
 * @param turn - Turn index that performed the duration write
 * @returns the reach classification plus the matched expression for evidence
 */
function classifyDurationReach(
  turns: EvalTurnResult[],
  turn: number,
): { reach: DurationReach; evidence: string } {
  const transforms = getTransforms(turns, turn, TOOL_UPDATE_CLIP);

  // Isolate the right-hand side of any `duration` / `duration +=` assignment.
  const assignMatch = /duration\s*(?:\+=|=)\s*([^\n]+)/i.exec(transforms);

  if (!assignMatch) {
    return { reach: "unrecognized", evidence: transforms.slice(0, 100) };
  }

  const rhs = (assignMatch[1] as string).trim();

  if (/\bn1?\/4\b/.test(rhs)) {
    return { reach: "n-absolute", evidence: rhs };
  }

  // A bare 1/4 (no n prefix) — the failure mode. Guard against matching `n/4`
  // by requiring the slash NOT be immediately preceded by `n`.
  if (/(^|[^\d/n])1\/4\b/.test(rhs)) {
    return { reach: "bare-fraction", evidence: rhs };
  }

  // A literal beats value: 1, 1.0 — a quarter note IS one beat in 4/4, so this
  // is correct-by-coincidence in 4/4 but not meter-invariant.
  if (/^1(\.0+)?$/.test(rhs)) {
    return { reach: "decimal-beats", evidence: rhs };
  }

  return { reach: "unrecognized", evidence: rhs };
}

/**
 * Record the duration-reach classification. Passes as long as a duration write
 * was recognized at all; the classification is logged for the comparison.
 *
 * @param turn - Turn index of the duration write
 * @returns Custom assertion that records the reach classification
 */
function recordDurationReach(turn: number): EvalAssertion {
  return {
    type: "custom",
    description: `classify quarter-note duration reach at turn ${turn}`,
    assert: (turns) => {
      const { reach, evidence } = classifyDurationReach(turns, turn);

      console.log(
        `    [duration-reach@turn${turn}] reach=${reach} — ${evidence.slice(0, 80)}`,
      );

      if (reach === "unrecognized") {
        throw new Error(
          `no recognizable quarter-note duration write: ${evidence}`,
        );
      }

      return true;
    },
  };
}

/**
 * The reach-for split. Read a melody, then ask for every note to become a
 * quarter note. Turn 2 is the 4/4 case (where `1/4` is wrong by 4× but the
 * mistake is silent); the bare-fraction failure is the thing to watch.
 */
export const durationReachForQuarter: EvalScenario = {
  id: "duration-reach-for-quarter",
  description:
    "`make it a quarter note` → n/4 (absolute), not bare 1/4 (a 16th in 4/4)",
  kind: "capability",
  liveSet: LIVE_SET,

  messages: [
    MSG_CONNECT,
    "Find the lead melody in the first scene and read its notes",
    "Make every note in that melody exactly a quarter note long.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },

    assertNotesRead(1),

    { type: "tool_called", tool: TOOL_UPDATE_CLIP, turn: 2 },
    recordDurationReach(2),

    {
      type: "llm_judge",
      prompt: `Evaluate the duration edit (turn 2):
1. Every note in the lead melody is now a quarter note long (= 1 beat in 4/4)
2. CRITICAL: the model expressed the quarter note as "n/4" (the absolute note value), NOT as a bare fraction "1/4". In the transform language a bare "1/4" means a quarter of a BEAT — a 16th note — which would be 4× too short. The "n" prefix is what makes "a quarter note" correct.
3. The note count is unchanged — only durations were edited`,
    },

    { type: "token_usage", metric: "inputTokens", maxTokens: 100_000 },
  ],
};
