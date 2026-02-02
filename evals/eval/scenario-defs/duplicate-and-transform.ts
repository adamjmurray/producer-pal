/**
 * Scenario: Duplicate track and transform clips
 */

import type { EvalScenario } from "../types.ts";

export const duplicateAndTransform: EvalScenario = {
  id: "duplicate-and-transform",
  description: "Duplicate track and transform clips",
  liveSet: "basic-midi-4-track",

  messages: [
    "Connect to Ableton Live",
    "Duplicate the Drums track",
    "Slice the first clip on that new track into 4 segments",
  ],

  assertions: [
    // Turn 0: Connection
    { type: "tool_called", tool: "ppal-connect", turn: 0 },

    // Turn 1: Track duplication
    { type: "tool_called", tool: "ppal-duplicate", turn: 1 },

    // Turn 2: Clip transformation
    { type: "tool_called", tool: "ppal-transform-clips", turn: 2 },

    // Verify response mentions duplication
    { type: "response_contains", pattern: /duplicat/i, turn: 1 },

    // Verify response mentions slicing
    { type: "response_contains", pattern: /slic/i, turn: 2 },

    // LLM quality check
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Successfully duplicated the Drums track
2. Sliced the clip into segments as requested
3. Confirmed the operations completed`,
      minScore: 4,
    },
  ],
};
