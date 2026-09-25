// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { focusSelect } from "#src/tools/session/helpers/focus-select.ts";
import {
  type Insertion,
  planInsertions,
} from "#src/tools/shared/validation/lists/insertion-plan.ts";
import { getColorForIndex } from "#src/tools/shared/validation/color-parsing.ts";
import { getNameForIndex } from "#src/tools/shared/validation/name-parsing.ts";
import {
  labelNewTargets,
  pairLabels,
} from "#src/tools/shared/validation/lists/labeled-targets.ts";
import {
  splitList,
  valueForIndex,
} from "#src/tools/shared/validation/lists/list-pairing.ts";
import { formatObjectPath } from "#src/tools/shared/validation/object-path.ts";
import { captureScene, type CaptureSceneResult } from "./capture-scene.ts";
import {
  landedColor,
  type LandedColor,
} from "#src/tools/shared/helpers/landed-color.ts";
import { createdRange } from "#src/tools/shared/helpers/created-range.ts";
import { unwrapSingleResult } from "#src/tools/shared/helpers/target-entries.ts";
import { validateTempo } from "#src/tools/shared/helpers/tempo-validation.ts";
import {
  resolveCreateSceneIndex,
  resolveCreateSceneSpots,
  validateSceneIndexCap,
} from "./helpers/scene-slots.ts";
import {
  applyTempoProperty,
  applyTimeSignatureProperty,
  validateTimeSignatures,
} from "./helpers/scene-tempo-signature.ts";

interface SceneResult {
  id: string;
  path: string;
  /** The empty scenes this one needed below it, when the path reached past the
   * end ("s5-s7") */
  created?: string;
  /** The palette color Live settled on, when it isn't the one asked for */
  color?: string;
  reason?: string;
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
 * @param args.timeSignature - Time signature for all, or one per scene, in order ("4/4", or "disabled" when capturing)
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
): SceneResult | SceneResult[] | (CaptureSceneResult & LandedColor) {
  const liveSet = LiveAPI.from(livePath.liveSet);

  if (capture) {
    const sceneIndex = resolveCreateSceneIndex(path, sceneIndexParam, liveSet);

    validateTempo(tempo, -1);

    return runCapture(sceneIndex, { color, tempo, timeSignature }, name, focus);
  }

  const spots = resolveCreateSceneSpots(path, sceneIndexParam, count);

  validateTempo(tempo, -1);
  // Checked before planning too: a huge index would fill the plan with that
  // many empty scenes first.
  validateSceneIndexCap(
    spots.filter((spot): spot is number => spot !== "end"),
    spots.length,
  );

  const insertions = planInsertions(
    spots,
    liveSet.getChildIds("scenes").length,
    true,
  );

  validateSceneIndexCap(insertions.map((insertion) => insertion.finalIndex));

  const { parsedNames, parsedColors } = labelNewTargets({
    noun: "scene",
    param: count == null ? "path" : "count",
    count: spots.length,
    name,
    color,
    extraLists: [{ param: "timeSignature", value: timeSignature }],
  });
  const parsedTimeSignatures = splitList(
    timeSignature ?? undefined,
    spots.length,
    "timeSignature",
  );

  validateTimeSignatures(timeSignature, parsedTimeSignatures);

  const createdScenes = insertions.map((insertion, i) =>
    createSingleScene(liveSet, insertion, {
      name: getNameForIndex(name, i, parsedNames),
      color: getColorForIndex(color, i, parsedColors),
      tempo,
      timeSignature: valueForIndex(
        timeSignature ?? undefined,
        i,
        parsedTimeSignatures,
      ),
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
): CaptureSceneResult & LandedColor {
  // Check these before capturing: they're only applied after the scene exists.
  pairLabels({ noun: "scene", count: 1, color: props.color });
  validateTimeSignatures(props.timeSignature, null);

  // The index is Live's answer to where the capture landed; it stays out of
  // the result, where `path` already says it.
  const { sceneIndex: capturedIndex, ...result } = captureScene({
    sceneIndex,
    name,
  });

  const landed = applyCaptureProperties(capturedIndex, props);

  if (focus) {
    focusSelect({ view: "session", id: result.id });
  }

  return { ...result, ...landed };
}

/**
 * Applies scene properties (color, tempo, timeSignature) to a scene
 * @param scene - The LiveAPI scene object
 * @param props - Properties to apply
 * @returns What the scene's entry says about the color it ended up with
 */
function applySceneProperties(
  scene: LiveAPI,
  props: SceneProperties,
): LandedColor {
  const { color, tempo, timeSignature } = props;
  let landed: LandedColor = {};

  if (color != null) {
    scene.setColor(color);
    landed = landedColor(scene, color);
  }

  applyTempoProperty(scene, tempo);
  applyTimeSignatureProperty(scene, timeSignature);

  return landed;
}

/**
 * Applies scene properties in capture mode
 * @param sceneIndex - Index the capture landed at
 * @param props - Properties to apply
 * @returns What the scene's entry says about the color it ended up with
 */
function applyCaptureProperties(
  sceneIndex: number,
  props: SceneProperties,
): LandedColor {
  const { color, tempo, timeSignature } = props;

  if (color == null && tempo == null && timeSignature == null) {
    return {};
  }

  const scene = LiveAPI.from(livePath.scene(sceneIndex));

  return applySceneProperties(scene, { color, tempo, timeSignature });
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
  insertion: Insertion,
  props: SceneProperties & { name?: string },
): SceneResult {
  const sceneIndex = insertion.atIndex;

  // An index past the end has no scene to insert before, so fill the gap first.
  for (let i = 0; i < insertion.padCount; i++) {
    liveSet.call("create_scene", -1);
  }

  liveSet.call("create_scene", sceneIndex);

  const scene = LiveAPI.from(livePath.scene(sceneIndex));

  if (props.name != null) {
    scene.set("name", props.name);
  }

  const landed = applySceneProperties(scene, props);

  return {
    id: scene.id,
    path: formatObjectPath({ kind: "scene", sceneIndex: insertion.finalIndex }),
    ...(insertion.emptyBelow === 0
      ? {}
      : {
          created: createdRange(
            "s",
            insertion.finalIndex - insertion.emptyBelow,
            insertion.finalIndex - 1,
          ),
        }),
    ...landed,
  };
}
