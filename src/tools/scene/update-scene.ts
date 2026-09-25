// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { focusSelect } from "#src/tools/session/helpers/focus-select.ts";
import {
  landedColor,
  type LandedColor,
} from "#src/tools/shared/helpers/landed-color.ts";
import { validateTempo } from "#src/tools/shared/helpers/tempo-validation.ts";
import { getColorForIndex } from "#src/tools/shared/validation/color-parsing.ts";
import { pathField } from "#src/tools/shared/validation/object-path-for-api.ts";
import { getNameForIndex } from "#src/tools/shared/validation/name-parsing.ts";
import { resolveLabeledTargets } from "#src/tools/shared/validation/lists/labeled-targets.ts";
import {
  splitList,
  valueForIndex,
} from "#src/tools/shared/validation/lists/list-pairing.ts";
import {
  targetObject,
  writeFanOut,
  type WriteResult,
} from "#src/tools/shared/validation/lists/write-fan-out.ts";
import { type IdLookup } from "#src/tools/shared/validation/helpers/id-per-path-lookup.ts";
import { sceneIdAtPath } from "#src/tools/shared/validation/path-target-lookup.ts";
import {
  applyTempoProperty,
  applyTimeSignatureProperty,
  validateTimeSignatures,
} from "./helpers/scene-tempo-signature.ts";

interface UpdateSceneResult {
  id: string;
  path?: string;
  /** The palette color Live settled on, when it isn't the one asked for */
  color?: string;
  detail?: string;
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
 * @param args.timeSignature - Time signature for all, or one per scene, in order ("4/4", or "disabled")
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
    extraLists: [{ param: "timeSignature", value: timeSignature }],
  });

  validateTempo(tempo, -1);

  const parsedTimeSignatures = splitList(
    timeSignature ?? undefined,
    targets.length,
    "timeSignature",
  );

  validateTimeSignatures(timeSignature, parsedTimeSignatures);

  // The scenes written, for focus — which follows the call, not a target.
  const written: string[] = [];

  const result = writeFanOut(targets, (target, i) => {
    const scene = targetObject(target, "scene", sceneToUpdateAtPath);
    const sceneName = getNameForIndex(name, i, parsedNames);
    const sceneColor = getColorForIndex(color, i, parsedColors);

    if (sceneName != null) {
      scene.set("name", sceneName);
    }

    let landed: LandedColor = {};

    if (sceneColor != null) {
      scene.setColor(sceneColor);
      landed = landedColor(scene, sceneColor);
    }

    applyTempoProperty(scene, tempo);
    applyTimeSignatureProperty(
      scene,
      valueForIndex(timeSignature ?? undefined, i, parsedTimeSignatures),
    );
    written.push(scene.id);

    return {
      id: scene.id,
      ...pathField(scene),
      ...landed,
    };
  });

  const lastScene = written.at(-1);

  if (focus && lastScene != null) {
    focusSelect({ view: "session", id: lastScene });
  }

  return result;
}

// --- Helpers below main exports ---

/**
 * The scene a path names. A path past the last scene is a target, not a
 * destination — nothing here says what a new scene would be — so it is refused
 * with the tool that does make scenes.
 * @param entry - One scene path, as the caller wrote it
 * @returns The scene's id, or why there isn't one
 */
function sceneToUpdateAtPath(entry: string): IdLookup {
  const lookup = sceneIdAtPath(entry);

  if (lookup.id != null || !lookup.empty) {
    return lookup;
  }

  return { ...lookup, reason: `${lookup.reason}; ppal-create-scene makes one` };
}
