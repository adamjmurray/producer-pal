// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { runWrite } from "#src/tools/shared/write-pipeline/write-pipeline.ts";
import {
  type PipelineResult,
  type WriteSpec,
} from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import {
  type CreateSceneChecked,
  checkCreateSceneCall,
} from "./helpers/create/check-create-scene-call.ts";
import {
  type CreateSceneArgs,
  type CreateSceneCall,
  type ScenePayload,
  createSceneLists,
  createSceneTargets,
  parseCreateSceneCall,
} from "./helpers/create/parse-create-scene-call.ts";
import { settleCreatedScenes } from "./helpers/create/settle-created-scenes.ts";
import {
  type SceneEntry,
  writeCreatedScene,
} from "./helpers/create/write-created-scene.ts";

/**
 * Creates scenes at the places a path names, or captures currently playing clips
 * @param args - The scene parameters
 * @param args.path - Where they go: "s+" appends, "s2" inserts at 2, comma-separated for several
 * @param args.sceneIndex - Deprecated index (0-based) where to insert new scenes
 * @param args.count - Deprecated repeat of a single path (refused with capture)
 * @param args.capture - Capture currently playing Session clips instead of creating empty scenes
 * @param args.name - Name for all, or one per scene, in order
 * @param args.color - Color for all, or one per scene, in order (CSS format: hex)
 * @param args.tempo - Tempo in BPM for the scenes. Pass -1 to disable.
 * @param args.timeSignature - Time signature for all, or one per scene, in order ("4/4", or "disabled" when capturing)
 * @param args.focus - Switch to session view and select the scene
 * @param context - Internal context object, for the request deadline
 * @returns One entry per scene, unwrapped when the call named one
 */
export function createScene(
  args: CreateSceneArgs = {},
  context: Partial<ToolContext> = {},
): PipelineResult<SceneEntry> {
  // No hook awaits, so the answer is never a promise.
  return runWrite(
    CREATE_SCENE_WRITE,
    args,
    context,
  ) as PipelineResult<SceneEntry>;
}

const CREATE_SCENE_WRITE: WriteSpec<
  CreateSceneArgs,
  CreateSceneCall,
  ScenePayload,
  CreateSceneChecked,
  SceneEntry
> = {
  tool: "ppal-create-scene",
  words: { rerun: "path" },
  parse: parseCreateSceneCall,
  lists: createSceneLists,
  targets: createSceneTargets,
  check: checkCreateSceneCall,
  write: writeCreatedScene,
  settle: settleCreatedScenes,
};
