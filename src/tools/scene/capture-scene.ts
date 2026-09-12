// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { toLiveApiId } from "#src/tools/shared/utils.ts";
import { slotPath } from "#src/tools/shared/validation/helpers/object-path-helpers.ts";
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
 * @returns The captured scene, plus its index for the caller's follow-up writes
 */
export function captureScene({
  sceneIndex,
  name,
}: CaptureSceneArgs = {}): CaptureSceneResult & { sceneIndex: number } {
  if (sceneIndex === 0) {
    throw new Error(
      "capture can't insert at s0 - it always inserts after an existing scene. Use s1 or later, or s+ to append",
    );
  }

  const liveSet = LiveAPI.from(livePath.liveSet);
  const appView = LiveAPI.from(livePath.view.song);

  if (sceneIndex != null) {
    // capture_and_insert_scene inserts after the selection, so select the scene
    // before the target index. "s+" resolves to the scene count, whose
    // predecessor is the last scene. An index past the end has no predecessor
    // to select, so pad with empty scenes first, same as create mode.
    validateSceneIndexCap([sceneIndex]);
    ensureSceneCountForIndex(liveSet, sceneIndex);

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

  liveSet.call("capture_and_insert_scene");

  const newSceneIndex = selectedSceneIndex + 1;
  const newScene = LiveAPI.from(livePath.scene(newSceneIndex));

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
    path: formatObjectPath({ kind: "scene", sceneIndex: newSceneIndex }),
    sceneIndex: newSceneIndex,
    clips,
  };
}
