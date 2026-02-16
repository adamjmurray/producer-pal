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
    },
    {
      type: "tool_called",
      tool: "ppal-read-live-set",
      turn: 0,
      args: {},
    },

    // Verify the response acknowledges the connection
    {
      type: "response_contains",
      pattern: /connected/i,
    },

    // LLM judges the quality of the response
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Connected to Ableton Live
2. Read the state of the Live Set
3. Summarized the state of the Live Set including
   - The Ableton Live version and Producer Pal version
   - The tempo is 120 BPM
   - The scale is A minor
   - The list of tracks:
     - Track 1: Drums
     - Track 2: Bass
     - Track 3: Chords
     - Track 4: Lead
     - Optional: Track 5: Producer Pal (this is ok to omit)
4. Shares tips about saving often and staying in sync
5. Asks the user what they want to do`,
      minScore: 4,
    },
  ],
};
