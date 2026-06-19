// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Generate a 2-bar bassline in A minor
 */

import { type EvalScenario } from "../types.ts";

export const midiBassline: EvalScenario = {
  id: "midi-bassline",
  description: "Generate a 2-bar bassline in A minor",
  liveSet: "basic-midi-4-track",

  messages: [
    "Connect to Ableton Live",
    "Write a 2-bar bassline on the Bass track that outlines an A minor progression",
  ],

  assertions: [
    { type: "tool_called", tool: "ppal-connect", turn: 0, score: 5 },
    { type: "tool_called", tool: "ppal-create-clip", turn: "any", score: 5 },
    {
      type: "response_contains",
      pattern: /bass|a minor/i,
      turn: "any",
      score: 2,
    },
    {
      type: "llm_judge",
      prompt: `Evaluate the assistant's bassline:
1. Created a 2-bar clip on the Bass track
2. The notes sit in a bass register
3. They outline A minor harmony sensibly
4. Confirmed`,
      score: 10,
    },
  ],
};
