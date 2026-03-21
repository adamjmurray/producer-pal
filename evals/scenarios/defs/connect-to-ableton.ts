// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Connect to Ableton Live
 */

import { type EvalScenario } from "../types.ts";

export const connectToAbleton: EvalScenario = {
  id: "connect-to-ableton",
  description: "Connect to Ableton Live and retrieve Producer Pal skills",
  liveSet: "basic-midi-4-track",

  messages: ["Connect to Ableton Live"],

  assertions: [
    // Verify ppal-connect was called immediately
    {
      type: "tool_called",
      tool: "ppal-connect",
      turn: 0,
      args: {},
      score: 5,
    },

    // Verify other tool calls
    {
      type: "custom",
      description: "No extraneous tool calls",
      assert: (turns) => {
        let ppalConnectCalledOnce = false;
        let ppalReadLiveSetCalledOnce = false;

        for (const turn of turns) {
          for (const toolCall of turn.toolCalls) {
            switch (toolCall.name) {
              case "ppal-connect": {
                if (ppalConnectCalledOnce) {
                  throw new Error("ppal-connect called more than once");
                }

                ppalConnectCalledOnce = true;
                break;
              }

              case "ppal-read-live-set": {
                if (ppalReadLiveSetCalledOnce) {
                  throw new Error("ppal-read-live-set called more than once");
                }

                ppalReadLiveSetCalledOnce = true;
                break;
              }

              // It's ok to scan through tracks and scenes,
              // but ideally it doesn't start reading individual clips automatically upon initial connection.
              case "ppal-read-track":
              case "ppal-read-scene":
                break;

              default:
                throw new Error(`Unexpected tool call: ${toolCall.name}`);
            }
          }
        }

        return true;
      },
      score: 5,
    },

    // Verify the response acknowledges the connection
    {
      type: "response_contains",
      pattern: /connected/i,
      score: 2,
    },

    {
      type: "custom",
      description: "Efficient token usage",
      assert: (turns) => {
        const total = turns
          .flatMap((t) => t.stepUsages ?? [])
          .reduce((sum, s) => sum + (s.inputTokens ?? 0), 0);

        if (total <= 20_000) return true; // full score
        if (total >= 50_000) return false; // zero

        return 1 - (total - 20_000) / 30_000; // linear 1→0
      },
      score: 5,
    },

    // LLM judges the quality of the response
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant connected to Ableton Live and said the equivalent of each of these:
1. Connected
2. Ableton Live version
3. Producer Pal version
4. Tempo: 120 BPM
5. Time signature: 4/4
6. Scale: A minor
7. 5 regular tracks
8. 2 return tracks
9. 8 scenes
10. What next?`,
      score: 10,
    },
  ],
};
