// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { focusSelect } from "#src/tools/session/helpers/select-focus-helpers.ts";
import {
  type Insertion,
  planInsertions,
} from "#src/tools/shared/validation/lists/insertion-plan.ts";
import {
  getColorForIndex,
  parseColors,
} from "#src/tools/shared/validation/color-utils.ts";
import {
  getNameForIndex,
  parseNames,
} from "#src/tools/shared/validation/name-utils.ts";
import { validateListLengths } from "#src/tools/shared/validation/lists/list-lengths.ts";
import { formatObjectPath } from "#src/tools/shared/validation/object-path.ts";
import { captureScene, type CaptureSceneResult } from "./capture-scene.ts";
import { unwrapSingleResult, validateTempo } from "#src/tools/shared/utils.ts";
import {
  applyTempoProperty,
  applyTimeSignatureProperty,
  resolveCreateSceneIndex,
  resolveCreateSceneSpots,
  validateSceneIndexCap,
} from "./scene-helpers.ts";

interface SceneResult {
  id: string;
  path: string;
}

interface SceneProperties {
  color?: string;
  tempo?: number | null;
  timeSignature?: string | null;
}

interface CreateSceneArgs {
  path?: string;
  sceneIndex?: number;
  count?: number;
  capture?: boolean;
  name?: string;
  color?: string;
  tempo?: number | null;
  timeSignature?: string | null;
  focus?: boolean;
}

/**
 * Creates scenes at the places a path names, or captures currently playing clips
 * @param args - The scene parameters
 * @param args.path - Where they go: "s+" appends, "s2" inserts at 2, comma-separated for several
 * @param args.sceneIndex - Deprecated index (0-based) where to insert new scenes
 * @param args.count - Deprecated repeat of a single path (ignored when capture=true)
 * @param args.capture - Capture currently playing Session clips instead of creating empty scenes
 * @param args.name - Name for all, or one per scene, in order
 * @param args.color - Color for all, or one per scene, in order (CSS format: hex)
 * @param args.tempo - Tempo in BPM for the scenes. Pass -1 to disable.
 * @param args.timeSignature - Time signature in format "4/4". Pass "disabled" to disable.
 * @param args.focus - Switch to session view and select the scene
 * @param _context - Internal context object (unused)
 * @returns One object per scene, unwrapped when the call named one
 */
export function createScene(
  {
    path,
    sceneIndex: sceneIndexParam,
    count,
    capture = false,
    name,
    color,
    tempo,
    timeSignature,
    focus,
  }: CreateSceneArgs = {},
  _context: Partial<ToolContext> = {},
): SceneResult | SceneResult[] | CaptureSceneResult {
  const liveSet = LiveAPI.from(livePath.liveSet);

  if (capture) {
    const sceneIndex = resolveCreateSceneIndex(path, sceneIndexParam, liveSet);

    validateTempo(tempo, -1);

    return runCapture(sceneIndex, { color, tempo, timeSignature }, name, focus);
  }

  const sceneCount = liveSet.getChildIds("scenes").length;
  const spots = resolveCreateSceneSpots(
    path,
    sceneIndexParam,
    count,
    sceneCount,
  );

  validateTempo(tempo, -1);

  const insertions = planInsertions(spots, sceneCount, true);

  validateSceneIndexCap(insertions.map((insertion) => insertion.insertIndex));

  validateListLengths([
    {
      param: count == null ? "path" : "count",
      count: spots.length,
      noun: "scene",
    },
    { param: "name", value: name },
    { param: "color", value: color },
  ]);

  const parsedNames = parseNames(name, spots.length, "scene");
  const parsedColors = parseColors(color, spots.length, "scene");
  const createdScenes = insertions.map((insertion, i) =>
    createSingleScene(liveSet, insertion, {
      name: getNameForIndex(name, i, parsedNames),
      color: getColorForIndex(color, i, parsedColors),
      tempo,
      timeSignature,
    }),
  );

  if (focus) {
    focusSelect({
      view: "session",
      id: (createdScenes.at(-1) as SceneResult).id,
    });
  }

  return unwrapSingleResult(createdScenes);
}

// --- Helpers below main exports ---

/**
 * Captures the playing session clips into one new scene.
 * @param sceneIndex - Where the capture goes, or undefined to append
 * @param props - Properties to apply once the scene exists
 * @param name - Name for the captured scene
 * @param focus - Switch to session view and select the scene
 * @returns The captured scene
 */
function runCapture(
  sceneIndex: number | undefined,
  props: SceneProperties,
  name: string | undefined,
  focus: boolean | undefined,
): CaptureSceneResult {
  // A malformed color would otherwise only surface inside setColor, after
  // captureScene has already captured the playing clips into a real scene.
  parseColors(props.color, 1, "scene");

  // The index is Live's answer to where the capture landed; it stays out of
  // the result, where `path` already says it.
  const { sceneIndex: capturedIndex, ...result } = captureScene({
    sceneIndex,
    name,
  });

  applyCaptureProperties(capturedIndex, props);

  if (focus) {
    focusSelect({ view: "session", id: result.id });
  }

  return result;
}

/**
 * Applies scene properties (color, tempo, timeSignature) to a scene
 * @param scene - The LiveAPI scene object
 * @param props - Properties to apply
 */
function applySceneProperties(scene: LiveAPI, props: SceneProperties): void {
  const { color, tempo, timeSignature } = props;

  if (color != null) {
    scene.setColor(color);
  }

  applyTempoProperty(scene, tempo);
  applyTimeSignatureProperty(scene, timeSignature);
}

/**
 * Applies scene properties in capture mode
 * @param sceneIndex - Index the capture landed at
 * @param props - Properties to apply
 */
function applyCaptureProperties(
  sceneIndex: number,
  props: SceneProperties,
): void {
  const { color, tempo, timeSignature } = props;

  if (color != null || tempo != null || timeSignature != null) {
    const scene = LiveAPI.from(livePath.scene(sceneIndex));

    applySceneProperties(scene, { color, tempo, timeSignature });
  }
}

/**
 * Creates a single scene with the specified properties
 * @param liveSet - The LiveAPI live_set object
 * @param insertion - Where the scene is created and where it ends up
 * @param props - Name, color, tempo and time signature for the scene
 * @returns The created scene object
 */
function createSingleScene(
  liveSet: LiveAPI,
  insertion: Insertion<number>,
  props: SceneProperties & { name?: string },
): SceneResult {
  const sceneIndex = insertion.insertIndex;

  // An index past the end has no scene to insert before, so fill the gap first.
  for (let i = 0; i < insertion.padCount; i++) {
    liveSet.call("create_scene", -1);
  }

  liveSet.call("create_scene", sceneIndex);

  const scene = LiveAPI.from(livePath.scene(sceneIndex));

  if (props.name != null) {
    scene.set("name", props.name);
  }

  applySceneProperties(scene, props);

  return {
    id: scene.id,
    path: formatObjectPath({ kind: "scene", sceneIndex: insertion.finalIndex }),
  };
}
