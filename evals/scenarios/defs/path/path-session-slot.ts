// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: does the model build a session slot path the 2.2.0 way?
 *
 * 2.2.0 re-spelled session slots from `0/1` to `t0/s1` because small models
 * transposed track and scene in the unprefixed form. This grades the spelling
 * the model wrote AND where the clip landed, so a transposition shows up in the
 * Live Set and not only in the args.
 */

import { type EvalScenario } from "../../types.ts";
import {
  clearClipSlots,
  MSG_CONNECT,
} from "../clip/helpers/clip-scenario-helpers.ts";
import {
  assertClipCreatedAtPath,
  assertSlotOccupancy,
} from "./path-scenario-helpers.ts";

/**
 * Chords is track 2 and the second scene is scene 1 — different numbers on
 * purpose. Swapping them lands on the Bass track in scene 3, which the second
 * occupancy check sees.
 */
const TARGET_PATH = "t2/s1";
const TRANSPOSED_PATH = "t1/s2";

export const pathSessionSlot: EvalScenario = {
  id: "path-session-slot",
  description: "Build a session clip slot path (t2/s1, not 1/2)",
  kind: "regression",
  liveSet: "basic-midi-4-track",
  // Writes one slot and clears both it and the transposed one, so repeat trials
  // and extra models can share the open Set.
  reuseLiveSet: true,
  setup: (mcpClient) => clearClipSlots(mcpClient, ["2/1", "1/2"]),

  messages: [
    MSG_CONNECT,
    "Put a one-bar clip in the second scene on the Chords track. A single sustained note is fine.",
  ],

  assertions: [
    ...assertClipCreatedAtPath(TARGET_PATH),

    // The outcome, both ways round. The path assertion above can fail on a
    // spelling that still lands right (a hidden alias, the tolerated "2/1");
    // these two say whether the clip is where the user asked.
    assertSlotOccupancy(TARGET_PATH, true),
    assertSlotOccupancy(TRANSPOSED_PATH, false),

    { type: "token_usage", metric: "inputTokens", maxTokens: 60_000 },

    // No llm_judge: the two slot reads pin the outcome exactly.
  ],
};
