// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { sceneDisplayName } from "#src/tools/scene/scene-helpers.ts";
import { pathField } from "#src/tools/shared/validation/object-path-for-api.ts";

/** The scene play-scene fired, for the response */
export interface FiredScene {
  id: string;
  path?: string;
  name: string;
}

export interface PlaybackState {
  isPlaying: boolean;
  /**
   * Set by play-scene only. The scene can be named by a scene id or by a clip
   * in it, so the caller doesn't always know which one fired.
   */
  scene?: FiredScene;
}

/**
 * Handle playing a scene in session view
 * @param sceneIndex - Scene index to play
 * @returns Updated playback state
 */
export function handlePlayScene(sceneIndex: number | undefined): PlaybackState {
  if (sceneIndex == null) {
    throw new Error(
      `path "s<scene>" or a scene id is required for action "play-scene"`,
    );
  }

  const scene = LiveAPI.from(livePath.scene(sceneIndex));

  if (!scene.exists()) {
    throw new Error(`scene at index ${sceneIndex} does not exist`);
  }

  scene.call("fire");

  return {
    isPlaying: true,
    scene: {
      id: scene.id,
      ...pathField(scene),
      name: sceneDisplayName(scene, sceneIndex),
    },
  };
}
