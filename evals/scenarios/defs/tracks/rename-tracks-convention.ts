// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Rename tracks to follow a numbering convention
 */

import { type EvalScenario } from "../../types.ts";

export const renameTracksConvention: EvalScenario = {
  id: "rename-tracks-convention",
  description: "Rename tracks to a numbered naming convention",
  liveSet: "basic-midi-4-track",

  messages: [
    "Connect to Ableton Live",
    "Rename the first four tracks to follow the convention '01 - <name>', keeping their existing names (e.g. the Drums track becomes '01 - Drums')",
  ],

  assertions: [
    { type: "tool_called", tool: "ppal-connect", turn: 0, score: 5 },
    { type: "tool_called", tool: "ppal-update-track", turn: 1, score: 6 },
    {
      type: "response_contains",
      pattern: /01|02|03|04|drums/i,
      turn: 1,
      score: 2,
    },
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Renamed the first four tracks (Drums, Bass, Chords, Lead)
2. Applied a zero-padded number prefix in order (01, 02, 03, 04)
3. Preserved each track's original name in the new name (e.g. "01 - Drums")
4. Got the ordering right rather than scrambling the numbers`,
      score: 10,
    },
  ],
};
