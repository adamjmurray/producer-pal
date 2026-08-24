// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/max/v8-max-console.ts";
import { focusSelect } from "#src/tools/session/helpers/select-focus-helpers.ts";
import { verifyColorQuantization } from "#src/tools/shared/color-verification-helpers.ts";
import {
  namedIdParam,
  parseCommaSeparatedIds,
  parseTimeSignature,
  unwrapSingleResult,
} from "#src/tools/shared/utils.ts";
import {
  getColorForIndex,
  parseCommaSeparatedColors,
} from "#src/tools/shared/validation/color-utils.ts";
import { validateIdTypes } from "#src/tools/shared/validation/id-validation.ts";
import {
  getNameForIndex,
  parseNames,
} from "#src/tools/shared/validation/name-utils.ts";
import {
  applyTempoProperty,
  applyTimeSignatureProperty,
} from "./scene-helpers.ts";

interface UpdateSceneResult {
  id: string;
}

interface UpdateSceneArgs {
  id?: string;
  /** Hidden alias for id */
  ids?: string;
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
 * @param args.name - Name for the scenes
 * @param args.color - Color for the scenes (CSS format: hex)
 * @param args.tempo - Tempo in BPM. Pass -1 to disable.
 * @param args.timeSignature - Time signature in format "4/4". Pass "disabled" to disable.
 * @param args.focus - Switch to session view and select the scene
 * @param _context - Internal context object (unused)
 * @returns Single scene object or array of scene objects
 */
export function updateScene(
  { id, ids, name, color, tempo, timeSignature, focus }: UpdateSceneArgs = {},
  _context: Partial<ToolContext> = {},
): UpdateSceneResult | UpdateSceneResult[] {
  const targets = namedIdParam(id, ids, "ids");

  if (!targets) {
    console.warn("updateScene: id is required");

    return [];
  }

  // Parse comma-separated string into array
  const sceneIds = parseCommaSeparatedIds(targets);

  // Parse names/colors against the original id count so the positional mapping
  // (name[k]/color[k] → ids[k]) survives even when an invalid id is skipped
  // mid-list — otherwise every later name/color shifts onto the wrong scene.
  const parsedNames = parseNames(name, sceneIds.length, "updateScene");
  const parsedColors = parseCommaSeparatedColors(color, sceneIds.length);

  // Validate timeSignature format up front so a malformed value fails before
  // any scene is mutated, instead of throwing mid-loop after partial updates.
  // "disabled" is a valid sentinel handled per-scene, not a time signature.
  if (timeSignature != null && timeSignature !== "disabled") {
    parseTimeSignature(timeSignature);
  }

  const updatedScenes: UpdateSceneResult[] = [];

  for (let i = 0; i < sceneIds.length; i++) {
    // Validate one id at a time (skip invalid) so the loop index stays aligned
    // to the original ids: a skipped id must not pull later names/colors forward
    // onto the wrong scene.
    const [scene] = validateIdTypes(
      [sceneIds[i] as string],
      "scene",
      "updateScene",
      {
        skipInvalid: true,
      },
    );

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
    });
  }

  if (focus && updatedScenes.length > 0) {
    const lastScene = updatedScenes.at(-1) as UpdateSceneResult;

    focusSelect({ view: "session", id: lastScene.id });
  }

  return unwrapSingleResult(updatedScenes);
}
