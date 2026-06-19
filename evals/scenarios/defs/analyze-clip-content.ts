// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Create a clip then read back its notes
 */

import { type EvalScenario } from "../types.ts";

export const analyzeClipContent: EvalScenario = {
  id: "analyze-clip-content",
  description: "Create a clip then read back its notes",
  liveSet: "basic-midi-4-track",

  messages: [
    "Connect to Ableton Live",
    "Create a simple 2-bar bassline on the Bass track in A minor",
    "Read back the notes in that clip and list the pitches used",
  ],

  assertions: [
    { type: "tool_called", tool: "ppal-connect", turn: 0, score: 5 },
    { type: "tool_called", tool: "ppal-create-clip", turn: 1, score: 5 },
    { type: "tool_called", tool: "ppal-read-clip", turn: 2, score: 5 },
    { type: "response_contains", pattern: /note|pitch/i, turn: 2, score: 2 },
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Created a 2-bar bassline on the Bass track
2. Read back the clip's notes
3. Listed the actual pitches present in the clip`,
      score: 10,
    },
  ],
};
