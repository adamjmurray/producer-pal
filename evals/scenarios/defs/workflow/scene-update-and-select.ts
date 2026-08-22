// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: rename and recolor a scene, then navigate to it.
 *
 * Covers the two tools nothing else exercised — ppal-update-scene and
 * ppal-select — and grades update-scene's target arg, which 2.2.0 renamed to
 * `id`.
 */

import { argText } from "../arg-text.ts";
import { type EvalAssertion, type EvalScenario } from "../../types.ts";
import {
  assertAddressedById,
  assertNamesScene,
} from "../path/path-scenario-helpers.ts";

const TOOL_UPDATE_SCENE = "ppal-update-scene";
const TOOL_SELECT = "ppal-select";

/** The second scene. Distinct from scene 0 so "that scene" is checkable. */
const SCENE_INDEX = 1;

const SCENE_NAME = "Chorus";

/**
 * Whether a "#RRGGBB" reads as red: the red channel dominates and is bright
 * enough to be a red rather than a dark neutral. Live's palette has several
 * reds, so an exact value would grade the swatch the model happened to pick.
 *
 * @param color - Scene color as "#RRGGBB", or null when unset
 * @returns True when the color is red-dominant
 */
function isRed(color: unknown): boolean {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(
    argText(color),
  );

  if (!match) return false;

  const [r, g, b] = match.slice(1).map((hex) => Number.parseInt(hex, 16)) as [
    number,
    number,
    number,
  ];

  return r >= 0x80 && r > g * 1.5 && r > b * 1.5;
}

/**
 * The scene carries the new name and a red color.
 * @returns A state assertion over the scene
 */
function assertSceneUpdated(): EvalAssertion {
  return {
    type: "state",
    tool: "ppal-read-scene",
    args: { sceneIndex: SCENE_INDEX, include: ["color"] },
    expect: (result) => {
      const scene = result as { name?: unknown; color?: unknown };

      return scene.name === SCENE_NAME && isRed(scene.color);
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
    tool: TOOL_SELECT,
    args: {},
    expect: (result) =>
      (result as { selectedScene?: { sceneIndex?: number } }).selectedScene
        ?.sceneIndex === SCENE_INDEX,
    explain: (result) =>
      `expected scene ${SCENE_INDEX} selected, got ${JSON.stringify(
        (result as { selectedScene?: unknown }).selectedScene ?? null,
      )}`,
  };
}

export const sceneUpdateAndSelect: EvalScenario = {
  id: "scene-update-and-select",
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
    { type: "tool_called", tool: "ppal-connect", turn: 0 },

    { type: "tool_called", tool: TOOL_UPDATE_SCENE, turn: 1 },
    assertAddressedById({ turn: 1, tool: TOOL_UPDATE_SCENE }),
    assertSceneUpdated(),

    { type: "tool_called", tool: TOOL_SELECT, turn: 2 },
    assertNamesScene({ turn: 2, tool: TOOL_SELECT }),
    assertSceneSelected(),

    { type: "token_usage", metric: "inputTokens", maxTokens: 80_000 },
  ],
};
