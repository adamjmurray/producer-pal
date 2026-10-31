// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Scenario: rename and recolor a scene, then navigate to it.
 *
 * Covers the two tools nothing else exercised — ppal-update-scene and
 * ppal-select — and grades update-scene's target arg, which 2.2.0 renamed to
 * `id`.
 */

import { argText } from "../arg-text.ts";
import { colorReads } from "../helpers/color-reads.ts";
import { type EvalAssertion, type EvalScenario } from "../../types.ts";
import { assertNamesTarget } from "../path/path-assertions.ts";
import { TOOLS } from "#evals/shared/tool-names.ts";

const TOOL_UPDATE_SCENE = TOOLS.updateScene;

/** The second scene. Distinct from scene 0 so "that scene" is checkable. */
const SCENE_INDEX = 1;

const SCENE_NAME = "Chorus";

/**
 * The scene carries the new name and a red color.
 * @returns A state assertion over the scene
 */
function assertSceneUpdated(): EvalAssertion {
  return {
    type: "state",
    tool: TOOLS.readScene,
    args: { sceneIndex: SCENE_INDEX, include: ["color"] },
    expect: (result) => {
      const scene = result as { name?: unknown; color?: unknown };

      return scene.name === SCENE_NAME && colorReads(scene.color, "red");
    },
    explain: (result) => {
      const scene = result as { name?: unknown; color?: unknown };

      return `expected name "${SCENE_NAME}" and a red color, got name "${argText(scene.name)}" color ${argText(scene.color, "none")}`;
    },
  };
}

/**
 * Live's own selection landed on the scene. Reading it back through select's
 * no-arg form grades what the user would see, not what the model said it did.
 * @returns A state assertion over the current selection
 */
function assertSceneSelected(): EvalAssertion {
  return {
    type: "state",
    tool: TOOLS.select,
    args: {},
    expect: (result) =>
      (result as { selectedScene?: { path?: string } }).selectedScene?.path ===
      `s${SCENE_INDEX}`,
    explain: (result) =>
      `expected scene ${SCENE_INDEX} selected, got ${JSON.stringify(
        (result as { selectedScene?: unknown }).selectedScene ?? null,
      )}`,
  };
}

export const sceneUpdateAndSelect: EvalScenario = {
  id: "scene-update-and-select",
  tags: ["workflow"],
  description: "Rename and recolor a scene, then navigate to it",
  kind: "regression",
  liveSet: "basic-midi-4-track",
  // No reuseLiveSet: the rename persists, so a second trial would start with
  // the scene already named and could pass without doing anything.

  messages: [
    "Connect to Ableton Live",
    `Rename the second scene to "${SCENE_NAME}" and make it red.`,
    "Show me that scene in Live.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOLS.connect, turn: 0 },

    { type: "tool_called", tool: TOOL_UPDATE_SCENE, turn: 1 },
    assertNamesTarget({ turn: 1, tool: TOOL_UPDATE_SCENE }),
    assertSceneUpdated(),

    { type: "tool_called", tool: TOOLS.select, turn: 2 },
    assertNamesTarget({ turn: 2, tool: TOOLS.select }),
    assertSceneSelected(),

    { type: "token_usage", maxTokens: 1_500 },
  ],
};
