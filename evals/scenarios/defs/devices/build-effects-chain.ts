// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Build an ordered audio-effect chain on a track
 */

import { type EvalScenario } from "../../types.ts";

export const buildEffectsChain: EvalScenario = {
  id: "build-effects-chain",
  description: "Add multiple audio effects to a track in a specific order",
  liveSet: "basic-midi-4-track",

  messages: [
    "Connect to Ableton Live",
    "On the Lead track, build a small effects chain: a Compressor first, then a Reverb after it",
  ],

  assertions: [
    { type: "tool_called", tool: "ppal-connect", turn: 0, score: 5 },
    { type: "tool_called", tool: "ppal-create-device", turn: 1, score: 6 },
    {
      type: "response_contains",
      pattern: /compress|reverb/i,
      turn: 1,
      score: 3,
    },
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Added both a Compressor and a Reverb to the Lead track
2. Placed them in the requested order — Compressor before Reverb in the device chain
3. Added them as audio effects on that track (not on a different track)
4. Confirmed the resulting chain order`,
      score: 12,
    },
  ],
};
