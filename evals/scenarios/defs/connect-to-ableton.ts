// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Connect to Ableton Live
 */

import { getToolCalls } from "../assertions/index.ts";
import { type EvalScenario } from "../types.ts";

export const connectToAbleton: EvalScenario = {
  id: "connect-to-ableton",
  description: "Connect to Ableton Live and retrieve Producer Pal skills",
  kind: "regression",
  liveSet: "basic-midi-4-track",

  messages: ["Connect to Ableton Live"],

  assertions: [
    // Verify ppal-connect was called immediately
    {
      type: "tool_called",
      tool: "ppal-connect",
      turn: 0,
      args: {},
    },

    // Verify other tool calls
    {
      type: "custom",
      description: "No extraneous tool calls",
      assert: (turns) => {
        const calls = getToolCalls(turns);
        // Tools that may be called at most once
        const onceOnly = ["ppal-connect", "ppal-read-live-set"];
        // Tools that may be called multiple times
        const repeatable = ["ppal-read-track", "ppal-read-scene"];
        const allowed = new Set([...onceOnly, ...repeatable]);

        for (const call of calls) {
          if (!allowed.has(call.name)) {
            throw new Error(`Unexpected tool call: ${call.name}`);
          }
        }

        for (const name of onceOnly) {
          if (calls.filter((c) => c.name === name).length > 1) {
            throw new Error(`${name} called more than once`);
          }
        }

        return true;
      },
    },

    // Verify the response acknowledges the connection
    {
      type: "response_contains",
      pattern: /connected/i,
    },

    {
      type: "token_usage",
      metric: "inputTokens",
      maxTokens: 20_000,
    },

    // LLM judges the quality of the response
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Indicated it connected to Ableton Live
2. Mentioned some details about the Live Set state (e.g. tempo, time signature, scale, tracks, return tracks, scenes, versions)
At least a few state details should be mentioned, but not all are required.`,
    },
  ],
};
