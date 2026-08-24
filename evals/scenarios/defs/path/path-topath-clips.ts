// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: one `toPath` for every clip destination kind.
 *
 * 2.2.0 collapsed five location params into one. This walks a single clip
 * through three destination shapes — a session slot, a track's arrangement, and
 * a fresh take lane — and checks both cycling rules on the way: a short
 * `toPath` repeats to cover a longer `arrangementStart` list, but a written
 * `l+` is always exactly one lane no matter how many copies land on it.
 */

import { type EvalAssertion, type EvalScenario } from "../../types.ts";
import {
  asArrangementTrack,
  clipStarts,
  takeLanes,
} from "../arrangement-helpers.ts";
import {
  clearSessionSlots,
  MSG_CONNECT,
} from "../clip/helpers/clip-scenario-helpers.ts";
import {
  assertClipCreatedAtPath,
  assertDestinationCounts,
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
  setup: (mcpClient) => clearSessionSlots(mcpClient, ["0/0", "2/1"]),

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

    // Destination 2: a bare track, meaning its arrangement. One destination
    // covers two starts — the model should NOT write it twice.
    { type: "tool_called", tool: TOOL_DUPLICATE, turn: 3 },
    assertPathArg({
      turn: 3,
      tool: TOOL_DUPLICATE,
      param: "toPath",
      expected: `t${CHORDS_TRACK_INDEX}`,
    }),
    // Cycling is allowed here — one destination may cover both starts — but
    // more destinations than starts never is.
    assertDestinationCounts({
      turn: 3,
      tool: TOOL_DUPLICATE,
      against: ["arrangementStart"],
      rule: "atMost",
    }),

    // Destination 3: a fresh take lane, twice over. One written `l+` is one
    // lane however many copies cycle onto it.
    { type: "tool_called", tool: TOOL_DUPLICATE, turn: 4 },
    assertPathArg({
      turn: 4,
      tool: TOOL_DUPLICATE,
      param: "toPath",
      expected: `t${CHORDS_TRACK_INDEX}/l+`,
    }),
    assertArrangementLayout(),

    { type: "token_usage", metric: "inputTokens", maxTokens: 120_000 },
  ],
};
