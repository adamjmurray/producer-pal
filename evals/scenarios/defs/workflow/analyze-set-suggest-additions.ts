// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Analyze the whole set and make a musical suggestion
 */

import { type EvalScenario } from "../../types.ts";

export const analyzeSetSuggestAdditions: EvalScenario = {
  id: "analyze-set-suggest-additions",
  description: "Analyze the Live Set and suggest what to add next",
  liveSet: "basic-midi-4-track",

  messages: [
    "Connect to Ableton Live",
    "Take stock of this whole set — the tracks, what has clips, the key and tempo — and tell me what's missing. Suggest two specific things I could add to make it a more complete arrangement, and why.",
  ],

  assertions: [
    { type: "tool_called", tool: "ppal-connect", turn: 0, score: 5 },
    { type: "tool_called", tool: "ppal-read-live-set", turn: "any", score: 4 },
    {
      type: "response_contains",
      pattern: /track|clip|add|suggest/i,
      turn: 1,
      score: 2,
    },
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Actually inspected the set (tracks, which have clips, key A minor, tempo 120) rather than guessing
2. Accurately described the current state of the set
3. Suggested two specific, musically sensible additions (e.g. a counter-melody, a transition, percussion, an arrangement section) with reasoning
4. Tailored the suggestions to what this set already has vs. lacks
This is an open-ended task; reward genuine musical insight grounded in the real set contents.`,
      score: 14,
    },
  ],
};
