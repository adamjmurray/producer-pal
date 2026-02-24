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
    // Verify ppal-connect was called
    {
      type: "tool_called",
      tool: "ppal-connect",
      turn: 0,
      args: {},
      score: 5,
    },

    // Verify the response acknowledges the connection
    {
      type: "response_contains",
      pattern: /connected/i,
      score: 2,
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
