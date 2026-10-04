// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { errorMessage } from "#src/shared/error-message.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { withCreatedScenes } from "#src/tools/shared/clip/create-missing-scenes.ts";
import { createdRange } from "#src/tools/shared/helpers/created-range.ts";
import { getColorForIndex } from "#src/tools/shared/validation/color-parsing.ts";
import { type Insertion } from "#src/tools/shared/validation/lists/insertion-plan.ts";
import {
  type InsertionRun,
  insertFailed,
  insertMade,
  insertionFor,
} from "#src/tools/shared/validation/lists/insertion-run.ts";
import { valueForIndex } from "#src/tools/shared/validation/lists/list-pairing.ts";
import { getNameForIndex } from "#src/tools/shared/validation/name-parsing.ts";
import { formatObjectPath } from "#src/tools/shared/validation/object-path.ts";
import {
  type AppliedTarget,
  type Step,
} from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import { captureScene, type CaptureSceneResult } from "../../capture-scene.ts";
import { leftScenesAt } from "../scene-slots.ts";
import {
  type AppliedSceneProperties,
  applySceneProperties,
} from "./created-scene-properties.ts";
import { type CreateSceneChecked } from "./check-create-scene-call.ts";
import { type ScenePayload } from "./parse-create-scene-call.ts";

export interface CreatedSceneResult extends AppliedSceneProperties {
  id: string;
  path: string;
  /** The empty scenes this one needed below it, when the path reached past the
   * end ("s5-s7") */
  created?: string;
}

/** What a create-scene target answers: a new scene, or the captured one. */
export type SceneEntry =
  | CreatedSceneResult
  | (CaptureSceneResult & AppliedSceneProperties);

/**
 * Stage 4: make one scene, or capture one, then set what the call asked of it.
 * A throw once the scene exists keeps its entry, with a detail for what didn't
 * happen.
 * @param target - The target
 * @param step - The call's state for this target
 * @returns The target's entry
 * @throws Error when Live makes no scene
 */
export function writeCreatedScene(
  target: AppliedTarget<ScenePayload>,
  step: Step<CreateSceneChecked>,
): SceneEntry {
  const { data } = target;

  return data.kind === "capture"
    ? writeCapturedScene(data.sceneIndex, step)
    : writeNewScene(step);
}

// --- Helpers below main export ---

/**
 * Insert an empty scene where the plan says, with the empty scenes it needs
 * below it, then set what the call asked of it.
 * @param step - The call's state for this target
 * @returns The target's entry
 */
function writeNewScene(step: Step<CreateSceneChecked>): CreatedSceneResult {
  const { checked, index } = step;
  const { liveSet, call, timeSignatures } = checked;
  const run = checked.run as InsertionRun;
  const { name, color, tempo, timeSignature } = call.args;
  const insertion = insertionFor(run, index, () =>
    liveSet.getChildIds("scenes"),
  );
  const scene = insertScene(liveSet, run, index, insertion);
  const path = formatObjectPath({
    kind: "scene",
    sceneIndex: insertion.finalIndex,
  });
  const created =
    insertion.emptyBelow === 0
      ? {}
      : {
          created: createdRange(
            "s",
            insertion.finalIndex - insertion.emptyBelow,
            insertion.finalIndex - 1,
          ),
        };

  insertMade(run, index, `id ${scene.id}`);
  step.landed("scene created", { id: scene.id, path, ...created });

  const sceneName = getNameForIndex(name, index, checked.parsedNames);

  if (sceneName != null) {
    scene.set("name", sceneName);
    step.landed("name");
  }

  const applied = applySceneProperties(
    scene,
    {
      color: getColorForIndex(color, index, checked.parsedColors),
      tempo,
      timeSignature: valueForIndex(
        timeSignature ?? undefined,
        index,
        timeSignatures,
      ),
    },
    (phrase) => step.landed(phrase),
  );

  return { id: scene.id, path, ...created, ...applied };
}

/**
 * Capture the playing clips into one new scene, then set what the call asked
 * of it.
 * @param sceneIndex - Where the capture goes, or undefined for after the
 *   selected scene
 * @param step - The call's state for this target
 * @returns The captured scene
 */
function writeCapturedScene(
  sceneIndex: number | undefined,
  step: Step<CreateSceneChecked>,
): SceneEntry {
  const { checked } = step;
  const { name, color, tempo, timeSignature } = checked.call.args;

  // The index is Live's answer to where the capture landed; it stays out of
  // the result, where `path` already says it.
  const { sceneIndex: capturedIndex, ...result } = captureScene(
    { sceneIndex, name },
    step.landed,
  );
  const props = {
    color: getColorForIndex(color, 0, checked.parsedColors),
    tempo,
    timeSignature,
  };

  if (props.color == null && tempo == null && timeSignature == null) {
    return result;
  }

  return {
    ...result,
    ...applySceneProperties(
      LiveAPI.from(livePath.scene(capturedIndex)),
      props,
      (phrase) => step.landed(phrase),
    ),
  };
}

/**
 * Make the scene at the planned index, after the empty scenes it needs. A
 * failure moves the scenes after this one, so they are planned again.
 * @param liveSet - The live_set object
 * @param run - The call's inserts
 * @param entry - The scene's place in the call
 * @param insertion - Where this scene goes, and what to pad first
 * @returns The new scene
 * @throws Error when Live makes no scene, naming the empty scenes already added
 */
function insertScene(
  liveSet: LiveAPI,
  run: InsertionRun,
  entry: number,
  insertion: Insertion,
): LiveAPI {
  const before = liveSet.getChildIds("scenes");
  let count = before.length;

  try {
    for (let pad = 0; pad < insertion.padCount; pad++) {
      liveSet.call("create_scene", -1);
    }

    if (insertion.padCount > 0) {
      count = liveSet.getChildCount("scenes");
    }

    liveSet.call("create_scene", insertion.atIndex);

    // A scene already stands at the index, so only the count tells that Live
    // made one rather than ignored the call.
    if (liveSet.getChildCount("scenes") <= count) {
      throw new Error("Live did not create the scene");
    }

    return LiveAPI.from(livePath.scene(insertion.atIndex));
  } catch (error) {
    const reason = errorMessage(error);
    const now = liveSet.getChildIds("scenes");
    const ids = now.filter((id) => !before.includes(id));

    insertFailed(run, entry, ids.length === 0 ? undefined : { ids, reason });

    // The empty scenes it padded stay in the Set though nothing landed.
    throw ids.length === 0
      ? error
      : new Error(withCreatedScenes(reason, leftScenesAt(ids, now)), {
          cause: error,
        });
  }
}
