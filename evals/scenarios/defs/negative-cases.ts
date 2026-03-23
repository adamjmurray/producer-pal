// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Handle impossible and ambiguous requests gracefully
 */

import { type EvalScenario } from "../types.ts";

export const negativeCases: EvalScenario = {
  id: "negative-cases",
  description: "Handle impossible and ambiguous requests",
  liveSet: "basic-midi-4-track",

  messages: [
    "Connect to Ableton Live",
    "Set the tempo to -50 BPM",
    "Make it sound better",
  ],

  assertions: [
    // Turn 0: Connection
    { type: "tool_called", tool: "ppal-connect", turn: 0 },

    // Turn 1: Should NOT claim success for impossible request
    {
      type: "response_contains",
      pattern: /set.*tempo.*-50|changed.*tempo/i,
      turn: 1,
      negate: true,
    },

    // Turn 1: Should explain why it can't be done
    {
      type: "response_contains",
      pattern: /can't|cannot|invalid|negative|not possible|must be|positive/i,
      turn: 1,
    },

    // Turn 2: Should ask clarifying question for ambiguous request
    { type: "response_contains", pattern: /\?/, turn: 2 },

    // Token usage
    {
      type: "token_usage",
      metric: "inputTokens",
      maxTokens: 80_000,
    },

    // LLM quality check
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Did NOT set the tempo to a negative value or claim success for "Set the tempo to -50 BPM"
2. Explained why -50 BPM is not valid (tempo must be positive)
3. Asked a clarifying question or offered suggestions for "Make it sound better" rather than taking arbitrary action
4. Did NOT hallucinate capabilities or claim to do something impossible`,
    },
  ],
};
