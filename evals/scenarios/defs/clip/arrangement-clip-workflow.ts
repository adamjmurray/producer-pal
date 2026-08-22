// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Create arrangement clip, duplicate, and split
 */

import { getToolCalls } from "../../assertions/index.ts";
import { type EvalAssertion, type EvalScenario } from "../../types.ts";
import { asArrangementTrack, clipStarts } from "../arrangement-helpers.ts";

/** Bass is the second track of the basic-midi-4-track Live Set. */
const BASS_TRACK_INDEX = 1;

/**
 * Where the three clips end up: the 8-bar clip cut at bar 9, plus the
 * duplicate. `tool_called` alone passed on a split that was skipped, so this
 * reads the track and pins the boundaries the turns were supposed to produce.
 */
const EXPECTED_STARTS = ["5|1", "9|1", "13|1"];

/**
 * The track's arrangement clip starts, as one comparable string.
 * @param result - Parsed ppal-read-track result
 * @returns Bar positions joined with ", "
 */
function starts(result: unknown): string {
  return clipStarts(asArrangementTrack(result).arrangementClips).join(", ");
}

/**
 * Read the Bass track's arrangement clips and compare their start positions.
 * @returns A state assertion over the final clip layout
 */
function assertClipLayout(): EvalAssertion {
  return {
    type: "state",
    tool: "ppal-read-track",
    args: {
      trackIndex: BASS_TRACK_INDEX,
      include: ["arrangement-clips"],
    },
    expect: (result) => starts(result) === EXPECTED_STARTS.join(", "),
    explain: (result) =>
      `expected clips at ${EXPECTED_STARTS.join(", ")}, got ${
        starts(result) || "none"
      }`,
  };
}

export const arrangementClipWorkflow: EvalScenario = {
  id: "arrangement-clip-workflow",
  description: "Create arrangement clip, duplicate, and split",
  kind: "regression",
  liveSet: "basic-midi-4-track",
  // Turn 3 ("split the clip") needs update-clip's `arrangementSplit` param,
  // which small-model mode strips from the schema — the split is impossible there.
  requires: { params: ["arrangementSplit"] },

  messages: [
    "Connect to Ableton Live",
    "Create an 8-bar bass line on the Bass track in the arrangement starting at bar 5",
    "Duplicate that clip to bar 13",
    "Split the clip at bar 9",
  ],

  assertions: [
    // Turn 0: Connection
    { type: "tool_called", tool: "ppal-connect", turn: 0 },

    // Turn 1: Arrangement clip creation
    { type: "tool_called", tool: "ppal-create-clip", turn: 1 },

    // Verify arrangement placement (not session)
    {
      type: "custom",
      description: "ppal-create-clip uses arrangementStart",
      assert: (turns) => {
        const calls = getToolCalls(turns, 1);
        const createCall = calls.find((c) => c.name === "ppal-create-clip");

        if (!createCall) throw new Error("ppal-create-clip not found");

        if (!createCall.args.arrangementStart) {
          throw new Error("Missing arrangementStart — created session clip?");
        }

        return true;
      },
    },

    // Turn 2: Duplicate
    { type: "tool_called", tool: "ppal-duplicate", turn: 2 },

    // Turn 3: Split. The call alone proves nothing — a split whose positions
    // miss the clip is warned-and-skipped, and the tool still returns success.
    { type: "tool_called", tool: "ppal-update-clip", turn: 3 },
    assertClipLayout(),

    { type: "response_contains", pattern: /bass/i, turn: 1 },
    { type: "response_contains", pattern: /duplicat/i, turn: 2 },
    { type: "response_contains", pattern: /split/i, turn: 3 },

    {
      type: "token_usage",
      metric: "inputTokens",
      maxTokens: 80_000,
    },

    // No llm_judge: the clip layout above pins every outcome it used to grade,
    // and a judge that reads the assistant's own summary passed the runs where
    // the split never happened.
  ],
};
