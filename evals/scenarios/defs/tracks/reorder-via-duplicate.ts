// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Place a copy of a track next to another (duplicate + intent)
 */

import { type EvalScenario } from "../../types.ts";

export const reorderViaDuplicate: EvalScenario = {
  id: "reorder-via-duplicate",
  description: "Duplicate a track to sit beside a related track",
  liveSet: "basic-midi-4-track",

  messages: [
    "Connect to Ableton Live",
    "I want a second bass layer. Duplicate the Bass track and name the copy 'Sub Bass'",
  ],

  assertions: [
    { type: "tool_called", tool: "ppal-connect", turn: 0, score: 5 },
    { type: "tool_called", tool: "ppal-duplicate", turn: 1, score: 6 },
    {
      type: "response_contains",
      pattern: /bass|duplicat|copy|sub/i,
      turn: 1,
      score: 2,
    },
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Duplicated the Bass track (preserving its instrument/devices, not creating an empty track)
2. Named the new copy "Sub Bass"
3. Confirmed there are now two bass-related tracks`,
      score: 10,
    },
  ],
};
