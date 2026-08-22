// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: the take-lane index base changed in 2.2.0.
 *
 * `takeLane: 1` used to mean the first take lane. `t1/l0` means it now, because
 * the segment index is the Live API index like every other one. A model
 * carrying the old habit writes `t1/l1`, Live auto-creates both lanes, and the
 * clip lands on the SECOND one — no error, wrong result. That silent failure is
 * what the state assertion catches; the path assertion says which spelling
 * caused it.
 */

import { type EvalAssertion, type EvalScenario } from "../../types.ts";
import { takeLanes } from "../arrangement-helpers.ts";
import { MSG_CONNECT } from "../clip/helpers/clip-scenario-helpers.ts";
import { assertClipCreatedAtPath } from "./path-scenario-helpers.ts";

/** Bass is track 1 in basic-midi-4-track. */
const BASS_TRACK_INDEX = 1;

/**
 * `l0` is the first take lane. `l+` appends one, which on a track that has none
 * yet is the same lane — a defensible reading of "its first take lane", so it
 * is accepted here. `l1` is not, and neither is the main lane.
 */
const ACCEPTED_PATHS = [`t${BASS_TRACK_INDEX}/l0`, `t${BASS_TRACK_INDEX}/l+`];

/**
 * Summarize the track's take lanes for a failure message.
 * @param result - Parsed ppal-read-track result
 * @returns Lanes as "t1/l0×1", or "none"
 */
function describeLanes(result: unknown): string {
  const lanes = takeLanes(result);

  if (lanes.length === 0) return "none";

  return lanes
    .map((lane) => `${lane.path ?? "?"}×${lane.clips?.length ?? 0}`)
    .join(", ");
}

/**
 * Exactly one take lane exists on the Bass track and it holds exactly one clip.
 * A model that wrote `l1` gets two lanes with the clip on the second.
 * @returns A state assertion over the track's take lanes
 */
function assertClipOnFirstLane(): EvalAssertion {
  return {
    type: "state",
    tool: "ppal-read-track",
    args: {
      trackIndex: BASS_TRACK_INDEX,
      include: ["arrangement-clips"],
    },
    expect: (result) => {
      const lanes = takeLanes(result);

      return lanes.length === 1 && (lanes[0]?.clips?.length ?? 0) === 1;
    },
    explain: (result) =>
      `expected one take lane holding one clip, got ${describeLanes(result)}`,
  };
}

export const pathTakeLaneFirst: EvalScenario = {
  id: "path-take-lane-first",
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
    ...assertClipCreatedAtPath(ACCEPTED_PATHS),
    assertClipOnFirstLane(),

    { type: "token_usage", metric: "inputTokens", maxTokens: 60_000 },
  ],
};
