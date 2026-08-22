// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: an arrangement path is not a clip address.
 *
 * Creating an arrangement clip returns `path: "t3"` alongside its id. That path
 * names the TRACK the clip sits on, not the clip — pasting it back into
 * update-clip warns and skips, leaving the clip untouched. This measures how
 * often a model does exactly that, which is the direct input to the open
 * question of whether paths should gain a time coordinate.
 */

import { type EvalAssertion, type EvalScenario } from "../../types.ts";
import {
  MSG_CONNECT,
  TOOL_CONNECT,
  TOOL_CREATE_CLIP,
  TOOL_UPDATE_CLIP,
} from "../clip/helpers/clip-scenario-helpers.ts";
import { assertAddressedById } from "./path-scenario-helpers.ts";

/** Lead is track 3 in basic-midi-4-track. */
const LEAD_TRACK_INDEX = 3;

const CLIP_NAME = "Verse Lead";

/** One arrangement clip on the track, in overview form. */
interface ArrangementClip {
  name?: string | null;
}

/**
 * The rename actually landed: the Lead track's arrangement holds a clip with
 * the new name. A warned-and-skipped update leaves the old name in place.
 * @returns A state assertion over the track's arrangement clips
 */
function assertClipRenamed(): EvalAssertion {
  return {
    type: "state",
    tool: "ppal-read-track",
    args: {
      trackIndex: LEAD_TRACK_INDEX,
      include: ["arrangement-clips"],
    },
    expect: (result) => clipNames(result).includes(CLIP_NAME),
    explain: (result) =>
      `expected an arrangement clip named "${CLIP_NAME}", got ${
        clipNames(result)
          .map((name) => `"${name}"`)
          .join(", ") || "no arrangement clips"
      }`,
  };
}

/**
 * Names of the arrangement clips on the read track.
 * @param result - Parsed ppal-read-track result
 * @returns Clip names (unnamed clips read as "")
 */
function clipNames(result: unknown): string[] {
  const track = result as { arrangementClips?: ArrangementClip[] };

  return (track.arrangementClips ?? []).map((clip) => clip.name ?? "");
}

export const pathArrangementAddress: EvalScenario = {
  id: "path-arrangement-address",
  description: "Act on an arrangement clip by id, not by the path it reports",
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

    // The measurement: did the model reach for the id it was handed, or paste
    // back the `t3` that came with it?
    assertAddressedById({ turn: 2, tool: TOOL_UPDATE_CLIP }),
    assertClipRenamed(),

    { type: "token_usage", metric: "inputTokens", maxTokens: 80_000 },
  ],
};
