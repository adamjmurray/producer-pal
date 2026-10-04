// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { errorMessage } from "#src/shared/error-message.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { withCreatedScenes } from "#src/tools/shared/clip/create-missing-scenes.ts";
import { toLiveApiId } from "#src/tools/shared/helpers/live-api-values.ts";
import { slotPath } from "#src/tools/shared/validation/helpers/object-paths.ts";
import { formatObjectPath } from "#src/tools/shared/validation/object-path.ts";
import {
  ensureSceneCountForIndex,
  validateSceneIndexCap,
} from "./helpers/scene-slots.ts";

interface CapturedClip {
  id: string;
  path: string;
}

export interface CaptureSceneResult {
  id: string;
  path: string;
  /** The empty scenes the capture had to add first, when it added any */
  created?: string;
  clips: CapturedClip[];
}

interface CaptureSceneArgs {
  sceneIndex?: number;
  name?: string;
}

/**
 * Captures the currently playing clips into a new scene
 * @param args - The parameters
 * @param args.sceneIndex - Optional index the new scene should land at
 * @param args.name - Optional name for the captured scene
 * @param landed - Told once the scene exists, so a throw after that can say so
 * @returns The captured scene, plus its index for the caller's follow-up writes
 * @throws Error when Live captures no scene, naming the empty scenes added first
 */
export function captureScene(
  { sceneIndex, name }: CaptureSceneArgs = {},
  landed: (
    phrase: string,
    partial?: Record<string, unknown>,
  ) => void = () => {},
): CaptureSceneResult & { sceneIndex: number } {
  if (sceneIndex === 0) {
    throw new Error(
      "capture can't insert at s0 - it always inserts after an existing scene. Use s1 or later, or s+ to append",
    );
  }

  const liveSet = LiveAPI.from(livePath.liveSet);
  let padded: string | null = null;

  if (sceneIndex != null) {
    // capture_and_insert_scene inserts after the selection, so select the scene
    // before the target index. "s+" resolves to the scene count, whose
    // predecessor is the last scene. An index past the end has no predecessor
    // to select, so pad with empty scenes first, same as create mode. The
    // result leaves the selection change out on purpose, to stay short.
    validateSceneIndexCap([sceneIndex]);
    padded = ensureSceneCountForIndex(liveSet, sceneIndex);
  }

  // The empty scenes stay in the Set whatever happens next.
  const withPadding = (error: unknown): Error =>
    padded == null
      ? (error as Error)
      : new Error(withCreatedScenes(errorMessage(error), padded), {
          cause: error,
        });

  let selectedSceneIndex: number;

  try {
    selectedSceneIndex = selectAndCapture(liveSet, sceneIndex);
  } catch (error) {
    throw withPadding(error);
  }

  const newSceneIndex = selectedSceneIndex + 1;
  const newScene = LiveAPI.from(livePath.scene(newSceneIndex));

  const path = formatObjectPath({ kind: "scene", sceneIndex: newSceneIndex });

  landed("scene captured", {
    id: newScene.id,
    path,
    ...(padded == null ? {} : { created: padded }),
  });

  if (name != null) {
    newScene.set("name", name);
  }

  // Collect captured clips
  const clips: CapturedClip[] = [];
  const trackIds = liveSet.getChildIds("tracks");

  for (let trackIndex = 0; trackIndex < trackIds.length; trackIndex++) {
    const clip = LiveAPI.from(
      livePath.track(trackIndex).clipSlot(newSceneIndex).clip(),
    );

    if (clip.exists()) {
      clips.push({
        id: clip.id,
        path: slotPath(trackIndex, newSceneIndex),
      });
    }
  }

  // Build optimistic result object
  return {
    id: newScene.id,
    path,
    ...(padded == null ? {} : { created: padded }),
    sceneIndex: newSceneIndex,
    clips,
  };
}

// --- Helpers below main export ---

/**
 * Selects the scene the capture goes after, when a place was asked for, and
 * captures.
 * @param liveSet - The LiveAPI live_set object
 * @param sceneIndex - Where the new scene should land, or undefined for after
 *   the selected scene
 * @returns The index of the scene the capture went after
 * @throws Error when the selected scene can't be told, or Live refuses
 */
function selectAndCapture(
  liveSet: LiveAPI,
  sceneIndex: number | undefined,
): number {
  if (sceneIndex != null) {
    const appView = LiveAPI.from(livePath.view.song);
    const scene = LiveAPI.from(livePath.scene(sceneIndex - 1));

    appView.setProperty("selected_scene", toLiveApiId(scene.id));
  }

  const selectedScene = LiveAPI.from(livePath.view.selectedScene);
  const selectedSceneIndex = Number.parseInt(
    selectedScene.path.match(/live_set scenes (\d+)/)?.[1] ?? "",
  );

  if (Number.isNaN(selectedSceneIndex)) {
    throw new Error(`couldn't determine selected scene index`);
  }

  const count = liveSet.getChildCount("scenes");

  liveSet.call("capture_and_insert_scene");

  // A scene already stands where the capture goes, so only the count tells that
  // Live made one rather than ignored the call.
  if (liveSet.getChildCount("scenes") <= count) {
    throw new Error("Live did not capture a scene");
  }

  return selectedSceneIndex;
}
