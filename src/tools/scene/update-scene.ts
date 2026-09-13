// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { focusSelect } from "#src/tools/session/helpers/focus-select.ts";
import { verifyColorQuantization } from "#src/tools/shared/helpers/color-quantization.ts";
import { parseTimeSignature } from "#src/tools/shared/helpers/live-api-values.ts";
import { validateTempo } from "#src/tools/shared/helpers/tempo-validation.ts";
import { getColorForIndex } from "#src/tools/shared/validation/color-parsing.ts";
import { pathField } from "#src/tools/shared/validation/object-path-for-api.ts";
import { getNameForIndex } from "#src/tools/shared/validation/name-parsing.ts";
import { resolveLabeledTargets } from "#src/tools/shared/validation/lists/labeled-targets.ts";
import {
  targetObject,
  writeFanOut,
  type WriteResult,
} from "#src/tools/shared/validation/lists/write-fan-out.ts";
import { sceneIdAtPath } from "#src/tools/shared/validation/path-target-lookup.ts";
import {
  applyTempoProperty,
  applyTimeSignatureProperty,
} from "./helpers/scene-tempo-signature.ts";

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
 * @returns The scene when one was named, otherwise one entry per target
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
): WriteResult<UpdateSceneResult> {
  const { targets, parsedNames, parsedColors } = resolveLabeledTargets({
    noun: "scene",
    targets: { id, ids, path, paths },
    name,
    color,
  });

  validateTempo(tempo, -1);

  // Validate timeSignature format up front so a malformed value fails before
  // any scene is mutated, instead of throwing mid-loop after partial updates.
  // "disabled" is a valid sentinel handled per-scene, not a time signature.
  if (timeSignature != null && timeSignature !== "disabled") {
    parseTimeSignature(timeSignature);
  }

  // The scenes written, for focus — which follows the call, not a target.
  const written: string[] = [];

  const result = writeFanOut(targets, (target, i) => {
    const scene = targetObject(target, "scene", sceneIdAtPath);
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
    written.push(scene.id);

    // Build optimistic result object
    return {
      id: scene.id,
      ...pathField(scene),
    };
  });

  const lastScene = written.at(-1);

  if (focus && lastScene != null) {
    focusSelect({ view: "session", id: lastScene });
  }

  return result;
}
