// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Create a drum clip, add notes, and quantize
 */

import { type EvalScenario } from "../types.ts";

export const createAndEditClip: EvalScenario = {
  id: "create-and-edit-clip",
  description: "Create a drum clip, add notes, and quantize",
  liveSet: "basic-midi-4-track",

  messages: [
    "Connect to Ableton Live",
    "Create a 4-bar drum clip with kick on every beat and snare on 2 and 4",
    "Add hi-hats on every 8th note",
    "Quantize all the notes to 1/16",
  ],

  assertions: [
    // Turn 0: Connection
    { type: "tool_called", tool: "ppal-connect", turn: 0, score: 5 },

    // Turn 1: Clip creation
    { type: "tool_called", tool: "ppal-create-clip", turn: 1, score: 5 },

    // Turn 2: Note addition (merge mode)
    { type: "tool_called", tool: "ppal-update-clip", turn: 2, score: 5 },

    // Turn 3: Quantization
    { type: "tool_called", tool: "ppal-update-clip", turn: 3, score: 5 },

    // Verify response mentions the drum creation
    {
      type: "response_contains",
      pattern: /drum|kick|snare/i,
      turn: 1,
      score: 2,
    },

    // Verify response mentions hi-hats
    { type: "response_contains", pattern: /hi-?hat/i, turn: 2, score: 2 },

    // Verify response mentions quantization
    { type: "response_contains", pattern: /quantiz/i, turn: 3, score: 2 },

    // LLM quality check
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Created a 4-bar drum clip with kick and snare
2. Added hi-hats as requested
3. Applied quantization
4. Confirmed each step was completed`,
      score: 10,
    },
  ],
};
