// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: create an arrangement clip, duplicate it, then cut both — once at a
 * bar inside one clip, once at a bar that only the last clip reaches.
 */

import { argText } from "../arg-text.ts";
import { getToolCalls } from "../../assertions/index.ts";
import { type EvalAssertion, type EvalScenario } from "../../types.ts";
import {
  asArrangementTrack,
  callNamesArrangementPosition,
  clipStarts,
} from "../arrangement-helpers.ts";

/** Bass is the second track of the basic-midi-4-track Live Set. */
const BASS_TRACK_INDEX = 1;

const TOOL_UPDATE_CLIP = "ppal-update-clip";

/**
 * Where the four clips end up: the 8-bar clip cut at bar 9, the duplicate, and
 * the duplicate cut at bar 17. `tool_called` alone passed on a split that was
 * skipped, so this reads the track and pins the boundaries the turns were
 * supposed to produce.
 */
const EXPECTED_STARTS = ["5|1", "9|1", "13|1", "17|1"];

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

/**
 * The cut was aimed in song time. `split` still works, but its positions are
 * offsets into each clip, so a model that reaches for it aims at the wrong bar
 * — the failure `arrangementSplit` was published to end.
 *
 * @param turn - Turn index containing the split
 * @returns A custom assertion
 */
function assertSplitInSongTime(turn: number): EvalAssertion {
  return {
    type: "custom",
    description: `turn ${turn}: cuts with arrangementSplit, not the clip-relative split`,
    assert: (turns) => {
      const calls = getToolCalls(turns, turn).filter(
        (c) => c.name === TOOL_UPDATE_CLIP,
      );
      const deprecated = calls.find((c) => c.args.split != null);

      if (deprecated) {
        throw new Error(
          `used the deprecated split ('${argText(deprecated.args.split)}'), whose positions are offsets into the clip`,
        );
      }

      if (!calls.some((c) => c.args.arrangementSplit != null)) {
        throw new Error(
          `no arrangementSplit in turn ${turn} — args: ${calls
            .map((c) => JSON.stringify(c.args).slice(0, 120))
            .join(" | ")}`,
        );
      }

      return true;
    },
  };
}

export const arrangementClipWorkflow: EvalScenario = {
  id: "arrangement-clip-workflow",
  description:
    "Create arrangement clip, duplicate, and cut at song-timeline positions",
  kind: "regression",
  liveSet: "basic-midi-4-track",
  // The cuts need update-clip's `arrangementSplit` param, which small-model
  // mode strips from the schema — they are impossible there.
  requires: { params: ["arrangementSplit"] },

  messages: [
    "Connect to Ableton Live",
    "Create an 8-bar bass line on the Bass track in the arrangement starting at bar 5",
    "Duplicate that clip to bar 13",
    "Split the clip at bar 9",
    // Bar 17 falls inside only the last clip; the tool ignores a position
    // outside a clip, so all four can be named in one call.
    "Now cut everything on the Bass track at bar 17.",
  ],

  assertions: [
    // Turn 0: Connection
    { type: "tool_called", tool: "ppal-connect", turn: 0 },

    // Turn 1: Arrangement clip creation
    { type: "tool_called", tool: "ppal-create-clip", turn: 1 },

    // Verify arrangement placement (not session)
    {
      type: "custom",
      description: "ppal-create-clip names an arrangement position",
      assert: (turns) => {
        const calls = getToolCalls(turns, 1);
        const createCall = calls.find((c) => c.name === "ppal-create-clip");

        if (!createCall) throw new Error("ppal-create-clip not found");

        if (!callNamesArrangementPosition(createCall.args, "path")) {
          throw new Error(
            'No arrangement position (e.g. path "t0[5|1]") — created session clip?',
          );
        }

        return true;
      },
    },

    // Turn 2: Duplicate
    { type: "tool_called", tool: "ppal-duplicate", turn: 2 },

    // Turn 3: Split. The call alone proves nothing — a split whose positions
    // miss the clip is warned-and-skipped, and the tool still returns success.
    { type: "tool_called", tool: TOOL_UPDATE_CLIP, turn: 3 },
    assertSplitInSongTime(3),

    // Turn 4: the same cut across several clips, three of which it misses.
    { type: "tool_called", tool: TOOL_UPDATE_CLIP, turn: 4 },
    assertSplitInSongTime(4),
    assertClipLayout(),

    { type: "response_contains", pattern: /bass/i, turn: 1 },
    { type: "response_contains", pattern: /duplicat/i, turn: 2 },
    { type: "response_contains", pattern: /split/i, turn: 3 },

    {
      type: "token_usage",
      metric: "inputTokens",
      maxTokens: 110_000,
    },

    // No llm_judge: the clip layout above pins every outcome it used to grade,
    // and a judge that reads the assistant's own summary passed the runs where
    // the split never happened.
  ],
};
