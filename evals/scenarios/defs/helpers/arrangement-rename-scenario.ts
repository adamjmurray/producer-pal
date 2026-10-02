// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The shared shell of the arrangement-addressing scenarios: they differ only in
// how the rename names the clip.

import { type EvalAssertion, type EvalScenario } from "../../types.ts";
import {
  MSG_CONNECT,
  TOOL_CONNECT,
  TOOL_CREATE_CLIP,
  TOOL_UPDATE_CLIP,
} from "../clip/helpers/clip-tool-constants.ts";
import { assertArrangementClipNamed } from "../path/path-assertions.ts";

/** Lead is track 3 in basic-midi-4-track. */
const LEAD_TRACK_INDEX = 3;

const MSG_CREATE_CLIP =
  "Create a 4-bar clip in the arrangement on the Lead track, starting at bar 1.";

/**
 * Connect, create one 4-bar arrangement clip on the Lead track, rename it, then
 * confirm the track holds a clip by that name — an id and a pasted-back
 * `t3[1|1]` both name the clip, so either spelling is a pass.
 *
 * @param spec - Ids, the rename message and name, extra assertions, the budget
 * @returns The assembled eval scenario
 */
export function arrangementRenameScenario(spec: {
  id: string;
  description: string;
  renameMessage: string;
  name: string;
  assertions?: EvalAssertion[];
  maxTokens: number;
}): EvalScenario {
  return {
    id: spec.id,
    tags: ["paths"],
    description: spec.description,
    kind: "capability",
    liveSet: "basic-midi-4-track",

    messages: [MSG_CONNECT, MSG_CREATE_CLIP, spec.renameMessage],

    assertions: [
      { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
      { type: "tool_called", tool: TOOL_CREATE_CLIP, turn: 1 },
      { type: "tool_called", tool: TOOL_UPDATE_CLIP, turn: 2 },

      ...(spec.assertions ?? []),
      assertArrangementClipNamed({
        trackIndex: LEAD_TRACK_INDEX,
        name: spec.name,
      }),

      { type: "token_usage", maxTokens: spec.maxTokens },
    ],
  };
}
