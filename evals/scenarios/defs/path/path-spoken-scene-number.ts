// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: a scene number the user says out loud, as a digit.
 *
 * The failing input is "scene 3", not "the third scene". Every other path
 * scenario words it as an ordinal ("the second scene", "at the end", "at the
 * very top"), and the only place the digit form appears is `middle-c-scale`,
 * where it contaminates a grader whose job is the octave convention. This
 * isolates it.
 *
 * Both readings of "scene 3" agree on `s2` — the Set's scenes carry Live's
 * default names "1" through "8", so the scene NAMED 3 and the third scene are
 * the same object. That makes the off-by-one the only way to miss.
 *
 * Two write turns rather than one: at the trial counts a local model affords,
 * one binary per run says almost nothing.
 */

import { type EvalScenario } from "../../types.ts";
import {
  clearClipSlots,
  MSG_CONNECT,
  TOOL_CREATE_CLIP,
} from "../clip/helpers/clip-scenario-helpers.ts";
import {
  assertClipCreatedAtPath,
  assertPathArg,
  assertSlotOccupancy,
} from "./path-scenario-helpers.ts";

/** "scene 3" on Lead. Off by one lands on LEAD_OFF_BY_ONE. */
const LEAD_TARGET = "t3/s2";
const LEAD_OFF_BY_ONE = "t3/s3";

/** "scene 6" on Chords, a second draw with different digits. */
const CHORDS_TARGET = "t2/s5";
const CHORDS_OFF_BY_ONE = "t2/s6";

export const pathSpokenSceneNumber: EvalScenario = {
  id: "path-spoken-scene-number",
  description: "Turn a spoken scene number into a 0-based path (scene 3 -> s2)",
  kind: "capability",
  liveSet: "basic-midi-4-track",
  // Clears every slot it can write, its targets and both off-by-one landing
  // spots, so repeat trials and extra models share one open Set.
  reuseLiveSet: true,
  setup: (mcpClient) => clearClipSlots(mcpClient, ["3/2", "3/3", "2/5", "2/6"]),

  messages: [
    MSG_CONNECT,
    "Put a one-bar clip in scene 3 on the Lead track. A single sustained note is fine.",
    "Now put a one-bar clip in scene 6 on the Chords track. A single sustained note is fine.",
  ],

  assertions: [
    ...assertClipCreatedAtPath(LEAD_TARGET),
    assertSlotOccupancy(LEAD_TARGET, true),
    assertSlotOccupancy(LEAD_OFF_BY_ONE, false),

    { type: "tool_called", tool: TOOL_CREATE_CLIP, turn: 2 },
    assertPathArg({
      turn: 2,
      tool: TOOL_CREATE_CLIP,
      param: "path",
      expected: CHORDS_TARGET,
    }),
    assertSlotOccupancy(CHORDS_TARGET, true),
    assertSlotOccupancy(CHORDS_OFF_BY_ONE, false),

    // Generous on purpose: this grades where the clip landed, not how much the
    // model said getting there.
    { type: "token_usage", maxTokens: 4_000 },
  ],
};
