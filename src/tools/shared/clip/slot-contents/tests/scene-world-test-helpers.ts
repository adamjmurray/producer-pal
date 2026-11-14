// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  deleteMockObject,
  lookupMockObject,
  mockNonExistentObjects,
  type RegisteredMockObject,
  registerMockObject,
  registerPendingMockObject,
  simulateMockDeletes,
} from "#src/test/mocks/mock-registry.ts";

/** The Live version a Live 13 beta reports. */
export const LIVE_13 = "13.0";

/** A clip the world puts in a scene: a track, and the clip's name there. */
interface WorldClip {
  /** "t" for a regular track, "rt" for a return track */
  kind: "t" | "rt";
  index: number;
  name: string;
}

/** What a full scene holds: one clip on a regular track, two on return tracks. */
export const FULL_SCENE: WorldClip[] = [
  { kind: "t", index: 0, name: "Step Sequencer" },
  { kind: "rt", index: 0, name: "No Envs" },
  { kind: "rt", index: 1, name: "With Env" },
];

/** The mocks a test looks at. */
export interface SceneWorld {
  liveSet: RegisteredMockObject;
  /** Every read of a return-track slot, which Live 12 must never make */
  returnSlotReads: () => unknown[];
}

/** How a slot's `delete_clip` fails: throws before or after the clip is gone. */
export type SlotFailure = "refuses" | "throws after deleting";

/**
 * A Live Set with two tracks, two return tracks and `sceneCount` scenes. Slots
 * of regular and return tracks exist in every scene, empty until a clip is
 * put in one, and deleting a slot's clip removes it. The return slots are
 * registered on Live 12 too, so a read that wrongly goes there finds them.
 * @param liveVersion - The version Live reports
 * @param sceneCount - How many scenes there are
 * @returns The mocks the tests look at
 */
export function registerSceneWorld(
  liveVersion = LIVE_13,
  sceneCount = 1,
): SceneWorld {
  mockNonExistentObjects();
  simulateMockDeletes();
  registerMockObject("live_app", {
    path: "live_app",
    methods: { get_version_string: () => liveVersion },
  });

  const liveSet = registerMockObject("live_set", {
    path: livePath.liveSet,
    type: "Song",
    properties: {
      tracks: children("track0", "track1"),
      return_tracks: children("return0", "return1"),
      scenes: children(
        ...Array.from({ length: sceneCount }, (_, i) => `scene${i}`),
      ),
    },
  });

  for (let scene = 0; scene < sceneCount; scene++) {
    registerMockObject(`scene${scene}`, {
      path: livePath.scene(scene),
      type: "Scene",
      properties: { name: `Scene ${scene + 1}` },
    });
  }

  for (let index = 0; index < 2; index++) {
    registerMockObject(`track${index}`, {
      path: livePath.track(index),
      type: "Track",
      properties: { name: ["Synth", "Drums"][index] },
    });
    registerMockObject(`return${index}`, {
      path: livePath.returnTrack(index),
      type: "Track",
      properties: { name: ["A-Echo", "B-Hall"][index] },
    });
  }

  for (let scene = 0; scene < sceneCount; scene++) {
    for (let index = 0; index < 2; index++) {
      registerMockObject(`t${index}s${scene}`, {
        path: livePath.track(index).clipSlot(scene),
        properties: { has_clip: 0 },
      });
      registerMockObject(`r${index}s${scene}`, {
        path: livePath.returnTrack(index).clipSlot(scene),
        properties: { has_clip: 0 },
      });
    }
  }

  return {
    liveSet,
    // Looked up when asked: a test may put a clip in a slot, replacing its mock.
    returnSlotReads: () =>
      Array.from({ length: 20 }, (_, i) =>
        lookupMockObject(
          undefined,
          livePath.returnTrack(i % 2).clipSlot(Math.floor(i / 2)),
        ),
      ).flatMap((slot) => slot?.get.mock.calls ?? []),
  };
}

/**
 * Put clips in a scene's slots. Ids are `<prefix><path>`, as `copy-rt0/s1`.
 * @param sceneIndex - The scene
 * @param idPrefix - Starts every clip's id
 * @param options - What to put there, and how
 * @param options.clips - The clips; a full scene by default
 * @param options.pending - Make the regular tracks' clips appear only when a
 *   call creates the scene (a duplicate), the way Live puts a copy's clips there
 * @param options.failures - Slots, as paths, whose `delete_clip` fails
 * @returns The clip mocks, in the order given
 */
export function putClipsInScene(
  sceneIndex: number,
  idPrefix: string,
  options: {
    clips?: WorldClip[];
    pending?: boolean;
    failures?: Record<string, SlotFailure>;
  } = {},
): RegisteredMockObject[] {
  const { clips = FULL_SCENE, pending = false, failures = {} } = options;

  return clips.map(({ kind, index, name }) => {
    // Live's scene insert makes the regular tracks' slots, and the mock models
    // only that; return-track slots are always there.
    const register =
      pending && kind === "t" ? registerPendingMockObject : registerMockObject;
    const owner =
      kind === "t" ? livePath.track(index) : livePath.returnTrack(index);
    const slotPath = owner.clipSlot(sceneIndex);
    const path = `${kind}${index}/s${sceneIndex}`;
    const failure = failures[path];
    const id = `${idPrefix}${path}`;

    register(`${kind}${index}s${sceneIndex}`, {
      path: slotPath,
      properties: { has_clip: 1 },
      methods:
        failure == null
          ? undefined
          : {
              delete_clip: () => {
                if (failure === "throws after deleting") {
                  deleteMockObject(`${String(slotPath)} clip`);
                }

                throw new Error(`Live refused to delete ${path}`);
              },
            },
    });

    return register(id, {
      path: slotPath.clip(),
      type: "Clip",
      properties: {
        name,
        is_midi_clip: kind === "t" ? 1 : 0,
        is_audio_clip: 0,
        is_arrangement_clip: 0,
        length: 4,
      },
    });
  });
}
