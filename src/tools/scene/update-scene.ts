// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { focusSelect } from "#src/tools/session/helpers/select-focus-helpers.ts";
import { verifyColorQuantization } from "#src/tools/shared/color-verification-helpers.ts";
import {
  parseTimeSignature,
  unwrapSingleResult,
  validateTempo,
} from "#src/tools/shared/utils.ts";
import {
  getColorForIndex,
  parseColors,
} from "#src/tools/shared/validation/color-utils.ts";
import { validateIdTypes } from "#src/tools/shared/validation/id-validation.ts";
import { pathField } from "#src/tools/shared/validation/object-path-for-api.ts";
import {
  getNameForIndex,
  parseNames,
} from "#src/tools/shared/validation/name-utils.ts";
import { validateListLengths } from "#src/tools/shared/validation/lists/list-lengths.ts";
import {
  targetCount,
  targetIds,
} from "#src/tools/shared/validation/lists/target-lists.ts";
import { sceneIdPerPath } from "#src/tools/shared/validation/path-target-lookup.ts";
import {
  applyTempoProperty,
  applyTimeSignatureProperty,
} from "./scene-helpers.ts";

interface UpdateSceneResult {
  id: string;
  path?: string;
}

interface UpdateSceneArgs {
  id?: string;
  /** Hidden alias for id */
  ids?: string;
  path?: string;
  /** Hidden alias for path */
  paths?: string;
  name?: string;
  color?: string;
  tempo?: number | null;
  timeSignature?: string | null;
  focus?: boolean;
}

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
 * @param args.timeSignature - Time signature in format "4/4". Pass "disabled" to disable.
 * @param args.focus - Switch to session view and select the scene
 * @param _context - Internal context object (unused)
 * @returns Single scene object or array of scene objects
 */
export function updateScene(
  {
    id,
    ids,
    path,
    paths,
    name,
    color,
    tempo,
    timeSignature,
    focus,
  }: UpdateSceneArgs = {},
  _context: Partial<ToolContext> = {},
): UpdateSceneResult | UpdateSceneResult[] {
  const named = { id, ids, path, paths };

  if (targetCount(named) === 0) {
    throw new Error("updateScene failed: id or path is required");
  }

  validateTempo(tempo, "updateScene", -1);

  // Every list in the call is checked together, before any of them is split:
  // once one is split nothing knows whether the others are lists at all.
  validateListLengths([
    { param: "id and path", count: targetCount(named) },
    { param: "name", value: name },
    { param: "color", value: color },
  ]);

  const sceneIds = targetIds(named, "updateScene", sceneIdPerPath);

  // Parse names/colors against the original id count so the positional mapping
  // (name[k]/color[k] → ids[k]) survives even when an invalid id is skipped
  // mid-list — otherwise every later name/color shifts onto the wrong scene.
  const parsedNames = parseNames(name, sceneIds.length, "scene");
  const parsedColors = parseColors(color, sceneIds.length, "scene");

  // Validate timeSignature format up front so a malformed value fails before
  // any scene is mutated, instead of throwing mid-loop after partial updates.
  // "disabled" is a valid sentinel handled per-scene, not a time signature.
  if (timeSignature != null && timeSignature !== "disabled") {
    parseTimeSignature(timeSignature);
  }

  const updatedScenes: UpdateSceneResult[] = [];

  for (let i = 0; i < sceneIds.length; i++) {
    const sceneId = sceneIds[i];

    // A path that named no scene already warned; it keeps its slot so later
    // names/colors don't shift onto the wrong scene.
    if (sceneId == null) continue;

    // Validate one id at a time (skip invalid) so the loop index stays aligned
    // to the original ids: a skipped id must not pull later names/colors forward
    // onto the wrong scene.
    const [scene] = validateIdTypes([sceneId], "scene", "updateScene", {
      skipInvalid: true,
    });

    if (scene == null) continue;

    const sceneName = getNameForIndex(name, i, parsedNames);
    const sceneColor = getColorForIndex(color, i, parsedColors);

    // Update properties if provided
    if (sceneName != null) {
      scene.set("name", sceneName);
    }

    if (sceneColor != null) {
      scene.setColor(sceneColor);
      verifyColorQuantization(scene, sceneColor);
    }

    applyTempoProperty(scene, tempo);
    applyTimeSignatureProperty(scene, timeSignature);

    // Build optimistic result object
    updatedScenes.push({
      id: scene.id,
      ...pathField(scene),
    });
  }

  if (focus && updatedScenes.length > 0) {
    const lastScene = updatedScenes.at(-1) as UpdateSceneResult;

    focusSelect({ view: "session", id: lastScene.id });
  }

  return unwrapSingleResult(updatedScenes);
}
