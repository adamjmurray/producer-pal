// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Create scene with tempo, play and stop
 */

import { lastSuccessfulToolCall } from "../../assertions/index.ts";
import { type EvalAssertion, type EvalScenario } from "../../types.ts";

const TOOL_PLAYBACK = "ppal-playback";

/**
 * play-scene names a scene the 2.2.0 way. `path: "s3"`, `sceneIndex: 3`, and a
 * scene `id` are all published, so all three pass and only the deprecated
 * `slots` (or naming nothing) fails — which is the point: the spelling a model
 * actually picks is a counting question over saved runs, not something to grade,
 * and grading one published form would mark the other two wrong.
 *
 * @param turn - Turn index containing the play-scene call
 * @returns A custom assertion
 */
function assertPlaysSceneByPublishedParam(turn: number): EvalAssertion {
  return {
    type: "custom",
    description: `${TOOL_PLAYBACK} turn ${turn}: play-scene names the scene with a published param`,
    assert: (turns) => {
      const call = lastSuccessfulToolCall(turns, turn, TOOL_PLAYBACK);

      if (!call) throw new Error(`${TOOL_PLAYBACK} not called in turn ${turn}`);

      if (call.args.action !== "play-scene") {
        throw new Error(
          `expected action 'play-scene', got '${String(call.args.action)}'`,
        );
      }

      const named = ["id", "path", "sceneIndex"].some(
        (key) => call.args[key] != null,
      );

      if (!named) {
        throw new Error(
          `no id/path/sceneIndex — args: ${JSON.stringify(call.args)}`,
        );
      }

      return true;
    },
  };
}

export const sceneAndPlayback: EvalScenario = {
  id: "scene-and-playback",
  description: "Create scene with tempo, play and stop",
  kind: "regression",
  liveSet: "basic-midi-4-track",

  messages: [
    "Connect to Ableton Live",
    "Create a scene called 'Intro' with tempo 100",
    "Play that scene",
    "Now play the 4th scene instead",
    "Stop playback",
  ],

  assertions: [
    // Turn 0: Connection
    { type: "tool_called", tool: "ppal-connect", turn: 0 },

    // Turn 1: Scene creation
    { type: "tool_called", tool: "ppal-create-scene", turn: 1 },

    // Turn 2: Play scene
    { type: "tool_called", tool: TOOL_PLAYBACK, turn: 2 },

    // Turn 3: Play a scene named by position, not by the id just created —
    // the case 2.2.0 added a bare 's3' path for.
    { type: "tool_called", tool: TOOL_PLAYBACK, turn: 3 },
    assertPlaysSceneByPublishedParam(3),

    // Turn 4: Stop playback
    { type: "tool_called", tool: TOOL_PLAYBACK, turn: 4 },

    { type: "response_contains", pattern: /intro/i, turn: 1 },
    { type: "response_contains", pattern: /play/i, turn: 2 },
    { type: "response_contains", pattern: /stop/i, turn: 4 },

    {
      type: "token_usage",
      metric: "inputTokens",
      maxTokens: 110_000,
    },

    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Created a scene named "Intro" with tempo 100 BPM
2. Played that scene
3. Then played the 4th scene instead
4. Stopped playback
5. Confirmed each step was completed`,
    },
  ],
};
