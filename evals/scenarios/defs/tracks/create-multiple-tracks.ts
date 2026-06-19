// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Create several new MIDI tracks
 */

import { type EvalScenario } from "../../types.ts";

export const createMultipleTracks: EvalScenario = {
  id: "create-multiple-tracks",
  description: "Create several new MIDI tracks",
  liveSet: "basic-midi-4-track",

  messages: [
    "Connect to Ableton Live",
    "Add three new MIDI tracks named Lead, Pad, and Arp",
  ],

  assertions: [
    { type: "tool_called", tool: "ppal-connect", turn: 0, score: 5 },
    {
      type: "tool_called",
      tool: "ppal-create-track",
      turn: "any",
      count: { min: 1 },
      score: 5,
    },
    { type: "response_contains", pattern: /lead/i, turn: "any", score: 2 },
    { type: "response_contains", pattern: /pad/i, turn: "any", score: 2 },
    { type: "response_contains", pattern: /arp/i, turn: "any", score: 2 },
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Created three new MIDI tracks
2. Named them Lead, Pad, and Arp
3. Confirmed the result`,
      score: 10,
    },
  ],
};
