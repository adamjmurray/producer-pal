// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Scenario: the take-lane index base changed in 2.2.0.
 *
 * `takeLane: 1` used to mean the first take lane. `t1/l0` means it now, because
 * the segment index is the Live API index like every other one. A model
 * carrying the old habit writes `t1/l1`, Live auto-creates both lanes, and the
 * clip lands on the SECOND one — no error, wrong result. Only where the clip
 * landed is graded: creating it on the main lane and moving it to `l0` is a
 * pass, and the failure message lists the lanes, which shows the spelling.
 */

import { type EvalAssertion, type EvalScenario } from "../../types.ts";
import { asArrangementTrack, takeLanes } from "../arrangement-readback.ts";
import {
  MSG_CONNECT,
  TOOL_CONNECT,
} from "../clip/helpers/clip-tool-constants.ts";
import { TOOLS } from "#evals/shared/tool-names.ts";

/** Bass is track 1 in basic-midi-4-track. */
const BASS_TRACK_INDEX = 1;

/**
 * Summarize the track's take lanes for a failure message.
 * @param result - Parsed ppal-read-track result
 * @returns Lanes as "t1/l0×1", or "none"
 */
function describeLanes(result: unknown): string {
  const lanes = takeLanes(result);

  if (lanes.length === 0) {
    return "none";
  }

  return lanes
    .map((lane) => `${lane.path ?? "?"}×${lane.clips?.length ?? 0}`)
    .join(", ");
}

/**
 * Exactly one take lane exists on the Bass track, it holds exactly one clip,
 * and the main lane holds none. A model that wrote `l1` gets two lanes with the
 * clip on the second.
 * @returns A state assertion over the track's take lanes
 */
function assertClipOnFirstLane(): EvalAssertion {
  return {
    type: "state",
    tool: TOOLS.readTrack,
    args: {
      trackIndex: BASS_TRACK_INDEX,
      include: ["arrangement-clips"],
    },
    expect: (result) => {
      const lanes = takeLanes(result);

      const mainClips = asArrangementTrack(result).arrangementClips ?? [];

      return (
        lanes.length === 1 &&
        (lanes[0]?.clips?.length ?? 0) === 1 &&
        mainClips.length === 0
      );
    },
    explain: (result) =>
      `expected one take lane holding one clip and an empty main lane, got lanes ${describeLanes(result)} and ${asArrangementTrack(result).arrangementClips?.length ?? 0} main-lane clip(s)`,
  };
}

export const pathTakeLaneFirst: EvalScenario = {
  id: "path-take-lane-first",
  tags: ["paths"],
  description: "Place an arrangement clip on the FIRST take lane (t1/l0)",
  kind: "capability",
  liveSet: "basic-midi-4-track",
  // No reuseLiveSet: nothing removes a take lane, so a second trial would
  // inherit the first one's lanes and the count check would be meaningless.

  messages: [
    MSG_CONNECT,
    "On the Bass track, put a 2-bar clip on its first take lane in the arrangement, starting at bar 1.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
    assertClipOnFirstLane(),

    { type: "token_usage", maxTokens: 1_500 },
  ],
};
