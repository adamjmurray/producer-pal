// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Duplicate an Arrangement section to double its length
 */

import { type EvalScenario } from "../../types.ts";

export const extendArrangementSection: EvalScenario = {
  id: "extend-arrangement-section",
  description: "Duplicate an Arrangement section to extend the song",
  liveSet: "basic-midi-4-track",

  messages: [
    "Connect to Ableton Live",
    "On the Drums track, put a 4-bar drum loop at the start of the Arrangement",
    "Now repeat that section so the drums run for 16 bars total, and drop a locator named 'Drop' where the second half begins (bar 9)",
  ],

  assertions: [
    { type: "tool_called", tool: "ppal-connect", turn: 0, score: 5 },
    { type: "tool_called", tool: "ppal-create-clip", turn: 1, score: 4 },
    { type: "tool_called", tool: "ppal-duplicate", turn: 2, score: 5 },
    {
      type: "response_contains",
      pattern: /16|repeat|duplicat|drop|locator/i,
      turn: 2,
      score: 2,
    },
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Created a 4-bar drum loop at the start of the Arrangement (bar 1)
2. Duplicated/repeated it to fill 16 bars total (e.g. 4 copies back to back)
3. Placed a locator named "Drop" at bar 9
4. Produced continuous drums with no gaps or overlaps
Award partial credit if the total length is close to 16 bars.`,
      score: 14,
    },
  ],
};
