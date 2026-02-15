// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Duplicate track
 */

import { type EvalScenario } from "../types.ts";

export const duplicate: EvalScenario = {
  id: "duplicate",
  description: "Duplicate track",
  liveSet: "basic-midi-4-track",

  messages: ["Connect to Ableton Live", "Duplicate the Drums track"],

  assertions: [
    // Turn 0: Connection
    { type: "tool_called", tool: "ppal-session", turn: 0 },

    // Turn 1: Track duplication
    { type: "tool_called", tool: "ppal-duplicate", turn: 1 },

    // Verify response mentions duplication
    { type: "response_contains", pattern: /duplicat/i, turn: 1 },

    // LLM quality check
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Successfully duplicated the Drums track
2. Confirmed the operation completed`,
      minScore: 4,
    },
  ],
};
