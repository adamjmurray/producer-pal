// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";

const LIVE_SAYS_NO = "Live says no";

/** A Live Set whose scenes can be counted after a call has run. */
export interface SceneWorld {
  /** How many scenes the Set has right now */
  sceneCount: () => number;
}

/** How Live fails a scratch clip: it can't be read, or a write to it is refused. */
export type ClipFault = "unreadable" | "create-refused" | "set-refused";

/**
 * Registers a Set with one audio track (t0) and a stateful scene list: the
 * scene calls the audio helpers make grow and shrink it, so a test can see
 * what they left behind. The Set starts with one scene, holding a clip unless
 * told otherwise, so a helper that needs a session slot has to make a scene of
 * its own.
 * @param firstSceneIsEmpty - Whether the one scene the Set starts with is empty
 * @param fault - How Live fails a scratch clip, if it does: `create-refused`
 *   makes no clip at all; `set-refused` makes one that rejects the first write
 * @returns The scene count, read live
 */
export function registerSceneWorld(
  firstSceneIsEmpty = false,
  fault?: ClipFault,
): SceneWorld {
  const ids: string[] = [];
  // Mutated as scenes come and go: the registry reads it live.
  const properties: Record<string, unknown> = {
    scenes: children(),
    tracks: children("scene_world_track"),
    song_length: 100,
  };

  /**
   * @param index - Where the scene goes
   * @param empty - Whether it holds no clips
   * @returns The answer Live gives to create_scene
   */
  function addScene(index: number, empty: boolean): unknown {
    const id = `scene_world_${ids.length}`;

    ids.splice(index, 0, id);
    properties.scenes = children(...ids);
    registerMockObject(id, {
      path: livePath.scene(index),
      type: "Scene",
      properties: { is_empty: empty ? 1 : 0 },
    });
    registerSlot(index, fault);

    return ["id", id];
  }

  mockNonExistentObjects();
  registerMockObject("live-set", {
    path: livePath.liveSet,
    type: "Song",
    properties,
    methods: {
      create_scene: (index) => addScene(Number(index), true),
      delete_scene: (index) => {
        ids.splice(Number(index), 1);
        properties.scenes = children(...ids);
      },
    },
  });
  registerMockObject("scene_world_track", {
    path: livePath.track(0),
    type: "Track",
    properties: { has_midi_input: 0, track_index: 0 },
    methods: {
      duplicate_clip_to_arrangement: () => {
        registerMockObject("scene_world_arrangement_clip", {
          path: livePath.track(0).arrangementClip(0),
          type: "Clip",
          properties: { is_arrangement_clip: 1 },
        });

        return ["id", "scene_world_arrangement_clip"];
      },
    },
  });
  addScene(0, firstSceneIsEmpty);

  return { sceneCount: () => ids.length };
}

/**
 * A clip slot on t0 that makes an audio clip when asked.
 * @param sceneIndex - The slot's scene
 * @param fault - How Live fails the clip it makes, if it does
 */
function registerSlot(sceneIndex: number, fault?: ClipFault): void {
  registerMockObject(`scene_world_slot_${sceneIndex}`, {
    path: livePath.track(0).clipSlot(sceneIndex),
    type: "ClipSlot",
    methods: {
      create_audio_clip: () => {
        if (fault === "create-refused") {
          throw new Error(LIVE_SAYS_NO);
        }

        const clip = registerMockObject(
          `scene_world_session_clip_${sceneIndex}`,
          {
            path: livePath.track(0).clipSlot(sceneIndex).clip(),
            type: "Clip",
            properties: { end_marker: 16 },
          },
        );

        if (fault === "unreadable") {
          clip.get.mockImplementation(() => {
            throw new Error(LIVE_SAYS_NO);
          });
        }

        if (fault === "set-refused") {
          clip.set.mockImplementation(() => {
            throw new Error(LIVE_SAYS_NO);
          });
        }

        return null;
      },
    },
  });
}
