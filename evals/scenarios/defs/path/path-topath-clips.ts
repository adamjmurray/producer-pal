// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: one `toPath` for every clip destination kind.
 *
 * 2.2.0 collapsed five location params into one, and 2.3.0 put the position
 * inside it. This walks a single clip through three destination shapes — a
 * session slot, a track's arrangement, and a fresh take lane — and checks the
 * lane rule on the way: each written `l+` appends its own lane, so a stack of
 * takes on ONE new lane is `l+` then `l=`.
 */

import { type EvalAssertion, type EvalScenario } from "../../types.ts";
import {
  asArrangementTrack,
  clipStarts,
  takeLanes,
} from "../arrangement-helpers.ts";
import {
  clearClipSlots,
  MSG_CONNECT,
} from "../clip/helpers/clip-scenario-helpers.ts";
import {
  assertClipCreatedAtPath,
  assertPathArg,
  assertSlotOccupancy,
} from "./path-scenario-helpers.ts";

const TOOL_DUPLICATE = "ppal-duplicate";

/** Drums holds the source clip; Chords receives every copy. */
const SOURCE_SLOT = "t0/s0";
const SLOT_DESTINATION = "t2/s1";
const CHORDS_TRACK_INDEX = 2;

/** Where the copies land on the Chords arrangement. */
const MAIN_LANE_STARTS = ["1|1", "5|1"];
const TAKE_LANE_STARTS = ["9|1", "13|1"];

/**
 * Bar positions on the main lane and on the take lanes, plus the lane count.
 * Take-lane clips are listed under their lane, so the main lane's clips are
 * what arrangementClips holds minus them.
 *
 * @param result - Parsed ppal-read-track result
 * @returns Lane count and the two start lists
 */
function arrangementLayout(result: unknown): {
  laneCount: number;
  mainStarts: string[];
  laneStarts: string[];
} {
  const lanes = takeLanes(result);

  return {
    laneCount: lanes.length,
    mainStarts: clipStarts(asArrangementTrack(result).arrangementClips),
    laneStarts: clipStarts(lanes.flatMap((lane) => lane.clips ?? [])),
  };
}

/**
 * Both cycling rules at once, read off the finished Live Set: two copies on the
 * main arrangement lane from one `toPath`, and two more sharing ONE take lane
 * from one written `l+`.
 * @returns A state assertion over the Chords track's arrangement
 */
function assertArrangementLayout(): EvalAssertion {
  return {
    type: "state",
    tool: "ppal-read-track",
    args: {
      trackIndex: CHORDS_TRACK_INDEX,
      include: ["arrangement-clips"],
    },
    expect: (result) => {
      const { laneCount, mainStarts, laneStarts } = arrangementLayout(result);

      return (
        laneCount === 1 &&
        laneStarts.join() === TAKE_LANE_STARTS.join() &&
        MAIN_LANE_STARTS.every((bar) => mainStarts.includes(bar))
      );
    },
    explain: (result) => {
      const { laneCount, mainStarts, laneStarts } = arrangementLayout(result);

      return (
        `expected clips at ${MAIN_LANE_STARTS.join(", ")} plus ONE take lane ` +
        `holding ${TAKE_LANE_STARTS.join(", ")}; got clips at ` +
        `${mainStarts.join(", ") || "none"} and ${laneCount} lane(s) ` +
        `holding ${laneStarts.join(", ") || "none"}`
      );
    },
  };
}

export const pathToPathClipDestinations: EvalScenario = {
  id: "path-topath-clips",
  description: "One toPath across session slot, arrangement, and take lane",
  kind: "capability",
  liveSet: "basic-midi-4-track",
  // No reuseLiveSet: nothing removes a take lane, so a repeat trial would
  // inherit the first one's and the lane count check would be meaningless.
  setup: (mcpClient) => clearClipSlots(mcpClient, ["0/0", "2/1"]),

  messages: [
    MSG_CONNECT,
    "Create a 1-bar drum clip on the Drums track in the first scene.",
    "Copy that clip into the Chords track's second scene slot.",
    "Also copy it into the Chords track's arrangement, at bar 1 and bar 5.",
    "Now put two more copies on a single fresh take lane of the Chords track, at bar 9 and bar 13.",
  ],

  assertions: [
    ...assertClipCreatedAtPath(SOURCE_SLOT),

    // Destination 1: a session slot.
    { type: "tool_called", tool: TOOL_DUPLICATE, turn: 2 },
    assertPathArg({
      turn: 2,
      tool: TOOL_DUPLICATE,
      param: "toPath",
      expected: SLOT_DESTINATION,
    }),
    assertSlotOccupancy(SLOT_DESTINATION, true),

    // Destination 2: the track's arrangement at two bars, which the position
    // inside the path makes one destination apiece.
    { type: "tool_called", tool: TOOL_DUPLICATE, turn: 3 },
    // The shape, not the batching: one call naming both bars and two calls
    // naming one each are equally good, and the layout check below sees where
    // the copies actually landed.
    assertPathArg({
      turn: 3,
      tool: TOOL_DUPLICATE,
      param: "toPath",
      expected: new RegExp(
        `^t${CHORDS_TRACK_INDEX}\\[[15]\\|1\\](,t${CHORDS_TRACK_INDEX}\\[[15]\\|1\\])?$`,
      ),
    }),

    // Destination 3: two takes on ONE fresh lane, which is `l+` then `l=`.
    // Two `l+` would be two lanes, and the layout check below catches it.
    { type: "tool_called", tool: TOOL_DUPLICATE, turn: 4 },
    assertPathArg({
      turn: 4,
      tool: TOOL_DUPLICATE,
      param: "toPath",
      expected: `t${CHORDS_TRACK_INDEX}/l+[${TAKE_LANE_STARTS[0]}],t${CHORDS_TRACK_INDEX}/l=[${TAKE_LANE_STARTS[1]}]`,
    }),
    assertArrangementLayout(),

    { type: "token_usage", metric: "inputTokens", maxTokens: 120_000 },
  ],
};
