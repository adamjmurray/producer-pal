// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Scenario: duplicate a scene, then delete the copy, when the scene holds clips
 * on return tracks (Live 13).
 *
 * The first scene holds a Drums clip and one clip on each of the two return
 * tracks. A duplicate lists all three copied clips; a delete names every clip
 * that went with the scene. The end state is the starting one, so the custom
 * checks on each call's own result show the model really did both, and the
 * judge grades what it told the user.
 */

import { argText } from "../../arg-text.ts";
import { type EvalScenario } from "../../../types.ts";
import { assertCallResult } from "../../path/path-assertions.ts";
import { LIVE_13_TEST_SET } from "../../helpers/live-13-test-set.ts";
import { sceneClipsProblem } from "./helpers/scene-clips.ts";
import { TOOLS } from "#evals/shared/tool-names.ts";

/** The first scene, as the Set ships it. */
const FIRST_SCENE = [
  { path: "t0/s0", name: "Step Sequencer" },
  { path: "rt0/s0", name: "No Envs" },
  { path: "rt1/s0", name: "With Env" },
];

/** The second scene: the copy was inserted before it and then deleted. */
const SECOND_SCENE = [{ path: "t0/s1", name: "Notes" }];

/**
 * A state assertion that a scene holds exactly these clips.
 *
 * @param path - The scene's path
 * @param wanted - The clips it should hold
 * @returns A state assertion over read-scene
 */
function assertSceneClips(
  path: string,
  wanted: Array<{ path: string; name: string }>,
): EvalScenario["assertions"][number] {
  return {
    type: "state",
    tool: TOOLS.readScene,
    args: { path, include: ["clips"] },
    expect: (result) => sceneClipsProblem(result, wanted) == null,
    explain: (result) => sceneClipsProblem(result, wanted) ?? "",
  };
}

export const sceneReturnClips: EvalScenario = {
  id: "live-13-scene-return-clips",
  tags: ["workflow", "results"],
  description:
    "Duplicate then delete a scene with return-track clips, and report which clips went along",
  kind: "capability",
  liveSet: LIVE_13_TEST_SET,
  requires: {
    liveVersion: 13,
    tools: [TOOLS.duplicate, TOOLS.delete, TOOLS.readScene],
  },

  messages: [
    "Connect to Ableton Live",
    "Duplicate the first scene. Which clips came along?",
    "Actually delete that copy. What got removed?",
  ],

  assertions: [
    { type: "tool_called", tool: TOOLS.connect, turn: 0 },

    // The scene count is back to 8 and the Set reads as it started.
    {
      type: "state",
      tool: TOOLS.readLiveSet,
      args: {},
      expect: { sceneCount: 8 },
    },
    assertSceneClips("s0", FIRST_SCENE),
    assertSceneClips("s1", SECOND_SCENE),

    // Each call's own result: the copy came with all three clips, and the
    // delete named them. A model that did nothing would pass the reads above.
    assertCallResult({
      turn: 1,
      tool: TOOLS.duplicate,
      what: "the copy came with all 3 clips",
      check: (result) =>
        Array.isArray(result.clips) && result.clips.length === 3,
    }),
    assertCallResult({
      turn: 2,
      tool: TOOLS.delete,
      what: "the delete reported removing 3 clips",
      check: (result) => /\b3 clips\b/.test(argText(result.detail)),
    }),

    { type: "response_contains", pattern: /No Envs/i, turn: 1 },
    { type: "response_contains", pattern: /With Env/i, turn: 1 },
    { type: "response_contains", pattern: /No Envs/i, turn: 2 },
    { type: "response_contains", pattern: /With Env/i, turn: 2 },
    { type: "token_usage", maxTokens: 4_000 },

    {
      type: "llm_judge",
      prompt: `The Set's first scene holds three clips: "Step Sequencer" on the Drums track,
"No Envs" on the A-Echo return track, and "With Env" on the B-Wide Hallway
return track. Turn 1 asked to duplicate the scene and which clips came along;
turn 2 asked to delete the copy and what got removed. Evaluate:
1. The turn 1 reply names all three copied clips, including the two on the
   return tracks.
2. The turn 2 reply says the three clips went with the scene, the return-track
   ones included.`,
    },
  ],
};
