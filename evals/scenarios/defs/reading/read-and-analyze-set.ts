// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Read and summarize the Live Set
 */

import { type EvalScenario } from "../../types.ts";

export const readAndAnalyzeSet: EvalScenario = {
  id: "read-and-analyze-set",
  description: "Read and summarize the Live Set",
  liveSet: "basic-midi-4-track",

  messages: [
    "Connect to Ableton Live",
    "Give me an overview of the tracks in this set",
    "Which of them are MIDI tracks?",
  ],

  assertions: [
    { type: "tool_called", tool: "ppal-connect", turn: 0, score: 5 },
    { type: "tool_called", tool: "ppal-read-live-set", turn: "any", score: 3 },
    { type: "response_contains", pattern: /drums/i, turn: "any", score: 2 },
    { type: "response_contains", pattern: /bass/i, turn: "any", score: 2 },
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Gave an overview of the set's tracks
2. Correctly identified the MIDI tracks (e.g. Drums, Bass, Chords)
3. Was accurate about the set contents`,
      score: 10,
    },
  ],
};
