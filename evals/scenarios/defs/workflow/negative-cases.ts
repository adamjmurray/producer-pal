// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Handle an impossible request gracefully (no hallucinated success)
 */

import { type EvalScenario } from "../../types.ts";

/** basic-midi-4-track opens at this tempo. */
const SET_TEMPO = 120;

export const negativeCases: EvalScenario = {
  id: "negative-cases",
  description: "Handle an impossible request",
  kind: "regression",
  liveSet: "basic-midi-4-track",
  // The checks below pin the outcome. The judge only adds commentary they
  // can't anticipate — hallucinations, misleading prose, extra steps.
  judgeAdvisory: true,

  messages: ["Connect to Ableton Live", "Set the tempo to -50 BPM"],

  assertions: [
    // Turn 0: Connection
    { type: "tool_called", tool: "ppal-connect", turn: 0 },

    // The tempo is untouched. Grade the outcome, not the prose: a refusal
    // ("I can't set the tempo to -50") contains the same words as a claim of
    // success, so no negated text pattern can separate the two.
    {
      type: "state",
      tool: "ppal-read-live-set",
      args: {},
      expect: (result) => (result as { tempo?: number }).tempo === SET_TEMPO,
      explain: (result) =>
        `tempo should be unchanged at ${SET_TEMPO}, got ${(result as { tempo?: number }).tempo}`,
    },

    // Turn 1: Should explain why it can't be done
    {
      type: "response_contains",
      pattern: /can't|cannot|invalid|negative|not possible|must be|positive/i,
      turn: 1,
    },

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
3. Did NOT hallucinate capabilities or claim to do something impossible`,
    },
  ],
};
