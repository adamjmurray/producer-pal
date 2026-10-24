// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { focusSelect } from "#src/tools/session/helpers/focus-select.ts";
import { joinDetails } from "#src/tools/shared/helpers/entry-details.ts";
import {
  landedColor,
  type LandedColor,
} from "#src/tools/shared/helpers/landed-color.ts";
import { getColorForIndex } from "#src/tools/shared/validation/color-parsing.ts";
import { valueForIndex } from "#src/tools/shared/validation/lists/list-pairing.ts";
import { blankTargetIgnores } from "#src/tools/shared/validation/lists/target-lists.ts";
import { getNameForIndex } from "#src/tools/shared/validation/name-parsing.ts";
import { pathField } from "#src/tools/shared/validation/object-path-for-api.ts";
import { runWrite } from "#src/tools/shared/write-pipeline/write-pipeline.ts";
import {
  type AppliedTarget,
  type Done,
  type PipelineResult,
  type Step,
  type WriteSpec,
  type Call,
} from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import {
  type SceneCall,
  type SceneChecked,
  type UpdateSceneArgs,
  checkSceneCall,
  parseSceneCall,
  sceneListArgs,
} from "./helpers/call/parse-scene-call.ts";
import {
  type ScenePayload,
  sceneTargets,
} from "./helpers/call/resolve-scene-targets.ts";
import {
  applyTempoProperty,
  applyTimeSignatureProperty,
  readBackSceneTimeSignature,
} from "./helpers/scene-tempo-signature.ts";

interface UpdateSceneResult {
  id: string;
  path?: string;
  /** The palette color Live settled on, when it isn't the one asked for */
  color?: string;
  /** The time signature Live kept, when it isn't the one asked for */
  timeSignature?: string;
  detail?: string;
}

/** What update-scene answers: the lone entry, or one entry per target. */
export type UpdateSceneAnswer = PipelineResult<UpdateSceneResult>;

/**
 * Updates properties of existing scenes
 * @param args - The scene parameters
 * @param args.id - Comma-separated scene IDs to update
 * @param args.ids - Hidden alias for id
 * @param args.path - Comma-separated scene paths to update instead of ids
 * @param args.paths - Hidden alias for path
 * @param args.name - Name for the scenes
 * @param args.color - Color for the scenes (CSS format: hex)
 * @param args.tempo - Tempo in BPM. Pass -1 to disable.
 * @param args.timeSignature - Time signature for all, or one per scene, in order ("4/4", or "disabled")
 * @param args.focus - Switch to session view and select the scene
 * @param context - Internal context object, for the request deadline
 * @returns The scene when one was named, otherwise one entry per target
 */
export function updateScene(
  args: UpdateSceneArgs = {},
  context: Partial<ToolContext> = {},
): UpdateSceneAnswer {
  // No hook awaits, so the answer is never a promise.
  return runWrite(SCENE_WRITE, args, context) as UpdateSceneAnswer;
}

const SCENE_WRITE: WriteSpec<
  UpdateSceneArgs,
  SceneCall,
  ScenePayload,
  SceneChecked,
  UpdateSceneResult
> = {
  tool: "ppal-update-scene",
  words: { rerun: "scene" },
  parse: (args) => parseSceneCall(args),
  lists: sceneListArgs,
  targets: sceneTargets,
  check: (call, targets) => checkSceneCall(call, targets.length),
  write: writeScene,
  settle: settleSceneUpdate,
};

// --- Helpers below main export ---

/**
 * Write one scene. Each piece is reported as it lands, so a throw later in the
 * write keeps the scene's entry and says what already changed.
 * @param target - The target
 * @param step - The call's state for this target
 * @returns The scene's entry
 */
function writeScene(
  target: AppliedTarget<ScenePayload>,
  step: Step<SceneChecked>,
): UpdateSceneResult {
  const { scene } = target.data;
  const { checked, index } = step;
  const address = { id: scene.id, ...pathField(scene) };
  const landed = (phrase: string): void => step.landed(phrase, address);
  const name = getNameForIndex(checked.name, index, checked.parsedNames);
  const color = getColorForIndex(checked.color, index, checked.parsedColors);

  if (name != null) {
    scene.set("name", name);
    landed("name");
  }

  let colorLanded: LandedColor = {};

  if (color != null) {
    scene.setColor(color);
    landed("color");
    colorLanded = landedColor(scene, color);
  }

  applyTempoProperty(scene, checked.tempo, landed);

  const timeSignature = valueForIndex(
    checked.timeSignature,
    index,
    checked.timeSignatures,
  );

  applyTimeSignatureProperty(scene, timeSignature, landed);

  const kept =
    timeSignature == null
      ? {}
      : readBackSceneTimeSignature(scene, timeSignature);
  const detail = joinDetails([colorLanded.detail, kept.detail]);

  return {
    ...address,
    ...colorLanded,
    ...kept,
    ...(detail == null ? {} : { detail }),
  };
}

/**
 * Once every target has had its turn: say what the call dropped, and focus the
 * last scene written.
 * @param done - What the call did
 * @param call - The call's shared state
 */
function settleSceneUpdate(
  done: Done<ScenePayload, SceneChecked, UpdateSceneResult>,
  call: Call,
): void {
  const { checked, entries, outcomes } = done;

  // Said once the writes are done: it claims what the call did.
  for (const { param, why } of blankTargetIgnores(
    checked.sent,
    "scenes",
    checked.named,
  )) {
    call.ignored(param, why);
  }

  const last = entries.findLast(
    (entry, index) =>
      outcomes[index] === "written" && "id" in entry && entry.id != null,
  ) as UpdateSceneResult | undefined;

  if (checked.focus === true && last != null) {
    focusSelect({ view: "session", id: last.id });
  }
}
