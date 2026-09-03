// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: an arrangement path IS a clip address.
 *
 * Creating an arrangement clip returns `path: "t3[1|1]"` alongside its id, and
 * both spellings reach the clip — pasting the path straight back into
 * update-clip renames it, which is the round trip ADR-0037 exists to close.
 * This grades the rename landing, whichever spelling the model reaches for.
 */

import { type EvalScenario } from "../../types.ts";
import {
  MSG_CONNECT,
  TOOL_CONNECT,
  TOOL_CREATE_CLIP,
  TOOL_UPDATE_CLIP,
} from "../clip/helpers/clip-scenario-helpers.ts";
import { assertArrangementClipNamed } from "./path-scenario-helpers.ts";

/** Lead is track 3 in basic-midi-4-track. */
const LEAD_TRACK_INDEX = 3;

const CLIP_NAME = "Verse Lead";

export const pathArrangementAddress: EvalScenario = {
  id: "path-arrangement-address",
  description: "Act on an arrangement clip by the id or path it reports",
  kind: "capability",
  liveSet: "basic-midi-4-track",

  messages: [
    MSG_CONNECT,
    "Create a 4-bar clip in the arrangement on the Lead track, starting at bar 1.",
    `Rename that arrangement clip to "${CLIP_NAME}".`,
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
    { type: "tool_called", tool: TOOL_CREATE_CLIP, turn: 1 },
    { type: "tool_called", tool: TOOL_UPDATE_CLIP, turn: 2 },

    // The measurement: the rename actually landed. An id and a pasted-back
    // `t3[1|1]` both name the clip, so either is a pass.
    assertArrangementClipNamed({
      trackIndex: LEAD_TRACK_INDEX,
      name: CLIP_NAME,
    }),

    { type: "token_usage", metric: "inputTokens", maxTokens: 80_000 },
  ],
};
