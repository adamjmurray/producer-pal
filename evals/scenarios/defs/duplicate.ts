// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Create content, duplicate track, and duplicate clip to arrangement
 */

import { getToolCalls } from "../assertions/index.ts";
import { type EvalScenario } from "../types.ts";

const TOOL_DUPLICATE = "ppal-duplicate";

export const duplicate: EvalScenario = {
  id: "duplicate",
  description:
    "Create content, duplicate track, and duplicate clip to arrangement",
  liveSet: "basic-midi-4-track",

  messages: [
    "Connect to Ableton Live",
    "Create a 2-bar drum clip on the Drums track",
    "Duplicate the Drums track",
    "Duplicate the drum clip to bar 3 in the arrangement",
  ],

  assertions: [
    // Turn 0: Connection
    { type: "tool_called", tool: "ppal-connect", turn: 0, score: 5 },

    // Turn 1: Clip creation
    { type: "tool_called", tool: "ppal-create-clip", turn: 1, score: 5 },

    // Turn 2: Track duplication
    { type: "tool_called", tool: TOOL_DUPLICATE, turn: 2, score: 5 },

    // Verify track duplication uses type: "track"
    {
      type: "custom",
      description: "ppal-duplicate uses type 'track'",
      assert: (turns) => {
        const calls = getToolCalls(turns, 2);
        const dupCall = calls.find((c) => c.name === TOOL_DUPLICATE);

        if (!dupCall) throw new Error("ppal-duplicate not found in turn 2");

        if (dupCall.args.type !== "track") {
          throw new Error(
            `Expected type 'track', got '${String(dupCall.args.type)}'`,
          );
        }

        return true;
      },
      score: 5,
    },

    // Turn 3: Clip duplication
    { type: "tool_called", tool: TOOL_DUPLICATE, turn: 3, score: 5 },

    // Verify clip duplication uses type: "clip" and arrangementStart
    {
      type: "custom",
      description: "ppal-duplicate uses type 'clip' with arrangementStart",
      assert: (turns) => {
        const calls = getToolCalls(turns, 3);
        const dupCall = calls.find((c) => c.name === TOOL_DUPLICATE);

        if (!dupCall) throw new Error("ppal-duplicate not found in turn 3");

        if (dupCall.args.type !== "clip") {
          throw new Error(
            `Expected type 'clip', got '${String(dupCall.args.type)}'`,
          );
        }

        if (!dupCall.args.arrangementStart) {
          throw new Error("Missing arrangementStart for clip duplication");
        }

        return true;
      },
      score: 5,
    },

    // Response checks
    { type: "response_contains", pattern: /drum/i, turn: 1, score: 2 },
    { type: "response_contains", pattern: /duplicat/i, turn: 2, score: 2 },
    { type: "response_contains", pattern: /duplicat/i, turn: 3, score: 2 },

    // Token usage
    {
      type: "token_usage",
      metric: "inputTokens",
      maxTokens: 100_000,
      upperLimit: 150_000,
      score: 5,
    },

    // LLM quality check
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Created a 2-bar drum clip on the Drums track
2. Duplicated the Drums track
3. Duplicated the clip to bar 3 in the arrangement
4. Confirmed each step was completed`,
    },
  ],
};
