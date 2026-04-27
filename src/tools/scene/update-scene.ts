// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/v8-max-console.ts";
import { select } from "#src/tools/control/select.ts";
import { verifyColorQuantization } from "#src/tools/shared/color-verification-helpers.ts";
import {
  parseCommaSeparatedIds,
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
 * @param args.ids - Comma-separated scene IDs to update
 * @param args.name - Name for the scenes
 * @param args.color - Color for the scenes (CSS format: hex)
 * @param args.tempo - Tempo in BPM. Pass -1 to disable.
 * @param args.timeSignature - Time signature in format "4/4". Pass "disabled" to disable.
 * @param args.focus - Switch to session view and select the scene
 * @param _context - Internal context object (unused)
 * @returns Single scene object or array of scene objects
 */
export function updateScene(
  { ids, name, color, tempo, timeSignature, focus }: UpdateSceneArgs = {},
  _context: Partial<ToolContext> = {},
): UpdateSceneResult | UpdateSceneResult[] {
  if (!ids) {
    console.warn("updateScene: ids is required");

    return [];
  }

  // Parse comma-separated string into array
  const sceneIds = parseCommaSeparatedIds(ids);

  // Validate all IDs are scenes, skip invalid ones
  const scenes = validateIdTypes(sceneIds, "scene", "updateScene", {
    skipInvalid: true,
  });

  const parsedNames = parseNames(name, scenes.length, "updateScene");
  const parsedColors = parseCommaSeparatedColors(color, scenes.length);

  const updatedScenes: UpdateSceneResult[] = [];

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i] as LiveAPI;
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

    select({ view: "session", sceneId: lastScene.id });
  }

  return unwrapSingleResult(updatedScenes);
}
