// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Lay out song-section scenes in order
 */

import { type EvalScenario } from "../../types.ts";

export const buildSongSections: EvalScenario = {
  id: "build-song-sections",
  description: "Create named song-section scenes in the right order",
  liveSet: "basic-midi-4-track",

  messages: [
    "Connect to Ableton Live",
    "Set up scenes for a song structure: Intro, Verse, Chorus, Verse, Chorus, Bridge, Outro — in that order",
  ],

  assertions: [
    { type: "tool_called", tool: "ppal-connect", turn: 0, score: 5 },
    { type: "tool_called", tool: "ppal-create-scene", turn: 1, score: 4 },
    {
      type: "response_contains",
      pattern: /intro|verse|chorus|bridge|outro/i,
      turn: 1,
      score: 3,
    },
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Produced scenes named Intro, Verse, Chorus, Verse, Chorus, Bridge, Outro
2. Kept them in exactly that order (including the repeated Verse/Chorus)
3. Created/renamed scenes rather than skipping or merging sections
4. Ended with a coherent song-structure layout`,
      score: 12,
    },
  ],
};
