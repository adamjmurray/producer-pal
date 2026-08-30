// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: the Direct Live API tool as an escape hatch — reached for when
 * nothing else can do the job, left alone when a real tool can.
 *
 * `ppal-live-api` is opt-in and deliberately unguided: no Skills fragment
 * teaches it, so the model has only the tool description to go on. Both halves
 * are graded, because a model that always reaches for it is as wrong as one
 * that never does — it bypasses every guard the real tools apply.
 */

import { getAllToolCalls } from "../../assertions/index.ts";
import {
  type EvalAssertion,
  type EvalScenario,
  type EvalTurnResult,
} from "../../types.ts";

const TOOL_LIVE_API = "ppal-live-api";

/** Read the metronome back the only way there is to read it. */
const READ_METRONOME = {
  path: "live_set",
  operations: [{ type: "getProperty", property: "metronome" }],
};

/** One entry of a ppal-live-api result. */
interface LiveApiResult {
  results?: Array<{ result?: unknown }>;
}

/**
 * The Live API tool stayed out of a turn a real tool covers.
 *
 * @param turn - Turn index that should not need the escape hatch
 * @returns A custom assertion over that turn's calls
 */
function assertNoLiveApi(turn: number): EvalAssertion {
  return {
    type: "custom",
    description: `turn ${turn} answers without ${TOOL_LIVE_API}`,
    assert: (turns: EvalTurnResult[]) => {
      const reached = getAllToolCalls(turns, turn).filter(
        (call) => call.name === TOOL_LIVE_API,
      );

      if (reached.length > 0) {
        throw new Error(
          `reached for ${TOOL_LIVE_API} where ppal-read-live-set answers it`,
        );
      }

      return true;
    },
  };
}

export const liveApiEscapeHatch: EvalScenario = {
  id: "live-api-escape-hatch",
  description:
    "Reach for the Direct Live API only where no other tool can do the job",
  // Unguided by design, so getting here is judgment rather than instruction.
  kind: "capability",
  liveSet: "basic-midi-4-track",
  // Only runs when the operator passes --live-api; skipped otherwise.
  requires: { tools: [TOOL_LIVE_API] },
  judgeAdvisory: true,

  messages: [
    "Connect to Ableton Live",
    // Squarely inside ppal-read-live-set. The escape hatch would also work,
    // which is the point: it should not be used.
    "What's the tempo?",
    // No tool exposes Live's metronome, so nothing but the Live API can do it.
    "Turn on Live's metronome.",
  ],

  assertions: [
    { type: "tool_called", tool: "ppal-connect", turn: 0 },

    // Turn 1: a real tool, not the escape hatch
    { type: "tool_called", tool: "ppal-read-live-set", turn: 1 },
    assertNoLiveApi(1),
    { type: "response_contains", pattern: /120/, turn: 1 },

    // Turn 2: the escape hatch, and the write actually landed
    { type: "tool_called", tool: TOOL_LIVE_API, turn: 2 },
    {
      type: "state",
      tool: TOOL_LIVE_API,
      args: READ_METRONOME,
      expect: (result) =>
        Number((result as LiveApiResult).results?.[0]?.result) === 1,
      explain: (result) =>
        `expected metronome on, got ${String((result as LiveApiResult).results?.[0]?.result)}`,
    },

    { type: "token_usage", metric: "inputTokens", maxTokens: 80_000 },

    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Reported the tempo (120 BPM) using a normal read tool, not the Direct Live API
2. Turned the metronome on using the Direct Live API tool
3. Did not claim the metronome was unsupported or ask the user to do it by hand`,
    },
  ],
};
