// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Write and read project memory
 */

import { type EvalScenario } from "../types.ts";

const TOOL_CONNECT = "ppal-connect";
const TOOL_CONTEXT = "ppal-context";

export const memoryWorkflow: EvalScenario = {
  id: "memory-workflow",
  description: "Write and read project memory",
  liveSet: "basic-midi-4-track",

  // Enable memory feature for this scenario
  config: {
    memoryEnabled: true,
    memoryContent: "",
    memoryWritable: true,
  },

  messages: [
    "Connect to Ableton Live",
    "Save a note: 'This project uses C minor with jazzy 7th chords'",
    "What notes do I have saved about this project?",
  ],

  assertions: [
    // Turn 0: Connection
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },

    // Turn 1: Write memory
    { type: "tool_called", tool: TOOL_CONTEXT, turn: 1 },

    // Turn 2: Read memory
    { type: "tool_called", tool: TOOL_CONTEXT, turn: 2 },

    // Response should contain the saved content
    { type: "response_contains", pattern: /c minor/i, turn: 2 },
    { type: "response_contains", pattern: /7th chords/i, turn: 2 },

    // LLM quality check
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Successfully updated the project memory
2. Retrieved and displayed the saved note content
3. Included the key details: C minor and jazzy 7th chords`,
      minScore: 4,
    },
  ],
};
