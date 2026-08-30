// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: update-clip's destinations pair 1:1 and do NOT cycle.
 *
 * `duplicate` cycles a short `toPath` against `arrangementStart`; `update-clip`
 * does not, on purpose. One destination for two clips used to put both in the
 * same slot and destroy the first, so a model that carries the cycling habit
 * across tools loses a clip silently. Grades that it wrote one destination per
 * clip, and that all four slots ended up as a move rather than a copy.
 */

import { type EvalScenario } from "../../types.ts";
import {
  clearClipSlots,
  MSG_CONNECT,
  TOOL_CONNECT,
  TOOL_CREATE_CLIP,
  TOOL_UPDATE_CLIP,
} from "../clip/helpers/clip-scenario-helpers.ts";
import {
  assertDestinationCounts,
  assertSlotOccupancy,
} from "../path/path-scenario-helpers.ts";

/** Two clips move from Drums to Chords, staying in their scenes. */
const SOURCE_SLOTS = ["t0/s0", "t0/s1"];
const DESTINATION_SLOTS = ["t2/s0", "t2/s1"];

export const pathToPathPairing: EvalScenario = {
  id: "path-topath-pairing",
  description: "update-clip pairs toPath 1:1 with the clips, without cycling",
  kind: "capability",
  liveSet: "basic-midi-4-track",
  // Resets every slot it touches, so trials and extra models share the Set.
  reuseLiveSet: true,
  setup: (mcpClient) => clearClipSlots(mcpClient, ["0/0", "0/1", "2/0", "2/1"]),

  messages: [
    MSG_CONNECT,
    "Create two 1-bar drum clips on the Drums track, one in the first scene and one in the second.",
    "Move both of those clips over to the Chords track, keeping each one in the scene it is already in.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
    { type: "tool_called", tool: TOOL_CREATE_CLIP, turn: 1 },

    { type: "tool_called", tool: TOOL_UPDATE_CLIP, turn: 2 },
    // The whole point: no call may name more clips than destinations. Two
    // separate 1:1 calls satisfy that as well as one batched call with two of
    // each — what must never happen is two clips sharing one destination.
    assertDestinationCounts({
      turn: 2,
      tool: TOOL_UPDATE_CLIP,
      against: ["id", "path"],
      rule: "equal",
    }),

    // A move, so the sources empty and the destinations fill. Checking only the
    // destinations would pass on a call that also left the originals behind.
    ...DESTINATION_SLOTS.map((slot) => assertSlotOccupancy(slot, true)),
    ...SOURCE_SLOTS.map((slot) => assertSlotOccupancy(slot, false)),

    { type: "token_usage", metric: "inputTokens", maxTokens: 90_000 },
  ],
};
