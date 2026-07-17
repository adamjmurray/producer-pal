// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Set an Arrangement loop region and play it
 */

import { type EvalScenario } from "../../types.ts";

export const loopPlaybackRegion: EvalScenario = {
  id: "loop-playback-region",
  description: "Set an Arrangement loop region and start looped playback",
  liveSet: "basic-midi-4-track",

  messages: [
    "Connect to Ableton Live",
    "Set the arrangement loop to cover bars 1 through 4, turn looping on, and play",
  ],

  assertions: [
    { type: "tool_called", tool: "ppal-connect", turn: 0, score: 5 },
    { type: "tool_called", tool: "ppal-playback", turn: 1, score: 6 },
    {
      type: "response_contains",
      pattern: /loop|bar|1.*4|playing/i,
      turn: 1,
      score: 3,
    },
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Set a loop region spanning roughly the first 4 bars (start at bar 1)
2. Enabled looping
3. Started playback
4. Picked sensible loop start/end values (not arbitrary or contradictory)`,
      score: 10,
    },
  ],
};
