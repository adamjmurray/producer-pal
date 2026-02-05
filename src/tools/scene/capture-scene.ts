// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

interface CapturedClip {
  id: string;
  trackIndex: number;
}

interface CaptureSceneResult {
  id: string;
  sceneIndex: number;
  clips: CapturedClip[];
}

interface CaptureSceneArgs {
  sceneIndex?: number;
  name?: string;
}

/**
 * Captures the currently playing clips into a new scene
 * @param args - The parameters
 * @param args.sceneIndex - Optional scene index to select before capturing
 * @param args.name - Optional name for the captured scene
 * @returns Result object with information about the captured scene
 */
export function captureScene({
  sceneIndex,
  name,
}: CaptureSceneArgs = {}): CaptureSceneResult {
  const liveSet = LiveAPI.from("live_set");
  const appView = LiveAPI.from("live_set view");

  if (sceneIndex != null) {
    const scene = LiveAPI.from(`live_set scenes ${sceneIndex}`);

    appView.set("selected_scene", `id ${scene.id}`);
  }

  const selectedScene = LiveAPI.from("live_set view selected_scene");
  const selectedSceneIndex = Number.parseInt(
    selectedScene.path.match(/live_set scenes (\d+)/)?.[1] ?? "",
  );

  if (Number.isNaN(selectedSceneIndex)) {
    throw new Error(
      `capture-scene failed: couldn't determine selected scene index`,
    );
  }

  liveSet.call("capture_and_insert_scene");

  const newSceneIndex = selectedSceneIndex + 1;
  const newScene = LiveAPI.from(`live_set scenes ${newSceneIndex}`);

  if (name != null) {
    newScene.set("name", name);
  }

  // Collect captured clips
  const clips: CapturedClip[] = [];
  const trackIds = liveSet.getChildIds("tracks");

  for (let trackIndex = 0; trackIndex < trackIds.length; trackIndex++) {
    const clip = LiveAPI.from(
      `live_set tracks ${trackIndex} clip_slots ${newSceneIndex} clip`,
    );

    if (clip.exists()) {
      clips.push({
        id: clip.id,
        trackIndex,
      });
    }
  }

  // Build optimistic result object
  return {
    id: newScene.id,
    sceneIndex: newSceneIndex,
    clips,
  };
}
