// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Create arrangement clip, duplicate, and split
 */

import { getToolCalls } from "../assertions/index.ts";
import { type EvalScenario } from "../types.ts";

export const arrangementClipWorkflow: EvalScenario = {
  id: "arrangement-clip-workflow",
  description: "Create arrangement clip, duplicate, and split",
  liveSet: "basic-midi-4-track",

  messages: [
    "Connect to Ableton Live",
    "Create an 8-bar bass line on the Bass track in the arrangement starting at bar 5",
    "Duplicate that clip to bar 13",
    "Split the clip at bar 9",
  ],

  assertions: [
    // Turn 0: Connection
    { type: "tool_called", tool: "ppal-connect", turn: 0 },

    // Turn 1: Arrangement clip creation
    { type: "tool_called", tool: "ppal-create-clip", turn: 1 },

    // Verify arrangement placement (not session)
    {
      type: "custom",
      description: "ppal-create-clip uses arrangementStart",
      assert: (turns) => {
        const calls = getToolCalls(turns, 1);
        const createCall = calls.find((c) => c.name === "ppal-create-clip");

        if (!createCall) throw new Error("ppal-create-clip not found");

        if (!createCall.args.arrangementStart) {
          throw new Error("Missing arrangementStart — created session clip?");
        }

        return true;
      },
    },

    // Turn 2: Duplicate
    { type: "tool_called", tool: "ppal-duplicate", turn: 2 },

    // Turn 3: Split
    { type: "tool_called", tool: "ppal-update-clip", turn: 3 },

    { type: "response_contains", pattern: /bass/i, turn: 1 },
    { type: "response_contains", pattern: /duplicat/i, turn: 2 },
    { type: "response_contains", pattern: /split/i, turn: 3 },

    {
      type: "token_usage",
      metric: "inputTokens",
      maxTokens: 80_000,
    },

    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Created an 8-bar bass clip in the arrangement starting at bar 5
2. Duplicated the clip to bar 13
3. Split a clip at bar 9
4. Confirmed each step was completed`,
    },
  ],
};
