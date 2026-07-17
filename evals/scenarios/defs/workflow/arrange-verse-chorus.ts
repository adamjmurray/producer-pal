// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Build a verse/chorus structure in the Arrangement
 */

import { type EvalScenario } from "../../types.ts";

export const arrangeVerseChorus: EvalScenario = {
  id: "arrange-verse-chorus",
  description: "Lay out an 8-bar verse and 8-bar chorus in the Arrangement",
  liveSet: "basic-midi-4-track",

  messages: [
    "Connect to Ableton Live",
    "In the Arrangement, build a verse then a chorus on the Drums track: an 8-bar drum groove for the verse starting at bar 1, then a busier 8-bar groove for the chorus right after it (starting at bar 9)",
    "Add locators named 'Verse' at bar 1 and 'Chorus' at bar 9",
  ],

  assertions: [
    { type: "tool_called", tool: "ppal-connect", turn: 0, score: 5 },
    { type: "tool_called", tool: "ppal-create-clip", turn: 1, score: 5 },
    { type: "tool_called", tool: "ppal-update-live-set", turn: 2, score: 4 },
    {
      type: "response_contains",
      pattern: /verse|chorus|bar|arrangement/i,
      turn: 1,
      score: 2,
    },
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Created Arrangement clips (not Session clips) on the Drums track
2. Placed an 8-bar verse groove starting at bar 1 and an 8-bar chorus groove starting at bar 9 (back to back, no overlap or gap)
3. Made the chorus groove busier/more energetic than the verse
4. Added locators named "Verse" at bar 1 and "Chorus" at bar 9
Award partial credit for correct placement even if the grooves aren't clearly differentiated.`,
      score: 14,
    },
  ],
};
