// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

import { MAX_AUTO_CREATED_SCENES } from "#src/tools/constants.ts";
import { select } from "#src/tools/control/select.ts";
import { captureScene } from "./capture-scene.ts";
import {
  applyTempoProperty,
  applyTimeSignatureProperty,
} from "./scene-helpers.ts";

interface SceneResult {
  id: string;
  sceneIndex: number;
}

interface CaptureSceneResult extends SceneResult {
  clips: Array<{ id: string; trackIndex: number }>;
}

interface SceneProperties {
  color?: string;
  tempo?: number | null;
  timeSignature?: string | null;
}

interface CreateSceneArgs {
  sceneIndex?: number;
  count?: number;
  capture?: boolean;
  name?: string;
  color?: string;
  tempo?: number | null;
  timeSignature?: string | null;
  switchView?: boolean;
}

/**
 * Creates new scenes at the specified index or captures currently playing clips
 * @param args - The scene parameters
 * @param args.sceneIndex - Scene index (0-based) where to insert new scenes
 * @param args.count - Number of scenes to create (ignored when capture=true)
 * @param args.capture - Capture currently playing Session clips instead of creating empty scenes
 * @param args.name - Base name for the scenes
 * @param args.color - Color for the scenes (CSS format: hex)
 * @param args.tempo - Tempo in BPM for the scenes. Pass -1 to disable.
 * @param args.timeSignature - Time signature in format "4/4". Pass "disabled" to disable.
 * @param args.switchView - Automatically switch to session view
 * @param _context - Internal context object (unused)
 * @returns Single scene object when count=1, array when count>1
 */
export function createScene(
  {
    sceneIndex,
    count = 1,
    capture = false,
    name,
    color,
    tempo,
    timeSignature,
    switchView,
  }: CreateSceneArgs = {},
  _context: Partial<ToolContext> = {},
): SceneResult | SceneResult[] | CaptureSceneResult {
  // Handle capture mode
  if (capture) {
    const result = captureScene({ sceneIndex, name });

    applyCaptureProperties(result, { color, tempo, timeSignature });

    if (switchView) {
      select({ view: "session" });
    }

    return result;
  }

  // Create mode
  validateCreateSceneArgs(sceneIndex, count);

  // After validation, sceneIndex is guaranteed to be a number
  const validatedSceneIndex = sceneIndex as number;

  const liveSet = LiveAPI.from("live_set");

  ensureSceneCountForIndex(liveSet, validatedSceneIndex);

  const createdScenes: SceneResult[] = [];
  let currentIndex = validatedSceneIndex;

  for (let i = 0; i < count; i++) {
    const sceneResult = createSingleScene(
      liveSet,
      currentIndex,
      i,
      count,
      name,
      color,
      tempo,
      timeSignature,
    );

    createdScenes.push(sceneResult);
    currentIndex++;
  }

  if (switchView) {
    select({ view: "session" });
  }

  return count === 1 ? (createdScenes[0] as SceneResult) : createdScenes;
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
 * Builds the scene name based on index and count
 * @param name - Base name for the scene
 * @param index - 0-based index of the scene being created
 * @param count - Total count of scenes being created
 * @returns The computed scene name
 */
function buildSceneName(
  name: string | null | undefined,
  index: number,
  count: number,
): string | undefined {
  if (name == null) {
    return;
  }

  if (count === 1 || index === 0) {
    return name;
  }

  return `${name} ${index + 1}`;
}

/**
 * Validates arguments for create scene mode
 * @param sceneIndex - The scene index
 * @param count - The number of scenes to create
 */
function validateCreateSceneArgs(
  sceneIndex: number | undefined,
  count: number,
): void {
  if (sceneIndex == null) {
    throw new Error("createScene failed: sceneIndex is required");
  }

  if (count < 1) {
    throw new Error("createScene failed: count must be at least 1");
  }

  if (sceneIndex + count > MAX_AUTO_CREATED_SCENES) {
    throw new Error(
      `createScene failed: creating ${count} scenes at index ${sceneIndex} would exceed the maximum allowed scenes (${MAX_AUTO_CREATED_SCENES})`,
    );
  }
}

/**
 * Ensures enough scenes exist to insert at the specified index
 * @param liveSet - The LiveAPI live_set object
 * @param sceneIndex - The target scene index
 */
function ensureSceneCountForIndex(liveSet: LiveAPI, sceneIndex: number): void {
  const currentSceneCount = liveSet.getChildIds("scenes").length;

  if (sceneIndex > currentSceneCount) {
    const scenesToPad = sceneIndex - currentSceneCount;

    for (let i = 0; i < scenesToPad; i++) {
      liveSet.call("create_scene", -1);
    }
  }
}

/**
 * Applies scene properties in capture mode
 * @param result - The capture result object
 * @param result.sceneIndex - The scene index
 * @param props - Properties to apply
 */
function applyCaptureProperties(
  result: { sceneIndex: number },
  props: SceneProperties,
): void {
  const { color, tempo, timeSignature } = props;

  if (color != null || tempo != null || timeSignature != null) {
    const scene = LiveAPI.from(`live_set scenes ${result.sceneIndex}`);

    applySceneProperties(scene, { color, tempo, timeSignature });
  }
}

/**
 * Creates a single scene with the specified properties
 * @param liveSet - The LiveAPI live_set object
 * @param sceneIndex - The scene index
 * @param creationIndex - 0-based index in the creation sequence
 * @param count - Total count of scenes being created
 * @param name - Base name for the scene
 * @param color - Color for the scene
 * @param tempo - Tempo for the scene
 * @param timeSignature - Time signature for the scene
 * @returns The created scene object
 */
function createSingleScene(
  liveSet: LiveAPI,
  sceneIndex: number,
  creationIndex: number,
  count: number,
  name: string | undefined,
  color: string | undefined,
  tempo?: number | null,
  timeSignature?: string | null,
): SceneResult {
  liveSet.call("create_scene", sceneIndex);
  const scene = LiveAPI.from(`live_set scenes ${sceneIndex}`);

  const sceneName = buildSceneName(name, creationIndex, count);

  if (sceneName != null) {
    scene.set("name", sceneName);
  }

  applySceneProperties(scene, { color, tempo, timeSignature });

  return {
    id: scene.id,
    sceneIndex,
  };
}
