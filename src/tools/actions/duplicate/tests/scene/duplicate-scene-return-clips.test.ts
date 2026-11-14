// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Scene copies and the Live 13 return-track clips a scene holds.

import { beforeEach, describe, expect, it } from "vitest";
import "../duplicate-mocks-test-helpers.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  mockNonExistentObjects,
  registerPendingMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import {
  createStandardMidiClipMock,
  registerClipSlot,
  registerMockObject,
  setupArrangementSceneMocks,
} from "#src/tools/actions/duplicate/helpers/duplicate-test-helpers.ts";
import {
  registerArrangementClip,
  registerTrackWithArrangementDup,
} from "#src/tools/actions/duplicate/helpers/duplicate-arrangement-test-helpers.ts";
import {
  putClipsInScene,
  registerSceneWorld,
  type SceneWorld,
} from "#src/tools/shared/clip/slot-contents/tests/scene-world-test-helpers.ts";

type Entry = Record<string, unknown>;

/** The copy of the full scene, as the result lists it. */
const COPY_CLIPS = [
  { id: "copy-t0/s1", path: "t0/s1" },
  { id: "copy-rt0/s1", path: "rt0/s1" },
  { id: "copy-rt1/s1", path: "rt1/s1" },
];

/**
 * A one-scene Set holding the full scene, and the scene Live will make as its
 * copy, holding a copy of each clip.
 * @param liveVersion - The version Live reports
 * @param failures - Slots of the copy whose delete fails
 * @returns The world
 */
function registerSceneAndCopy(
  liveVersion: string,
  failures: Parameters<typeof putClipsInScene>[2] = {},
): SceneWorld {
  const world = registerSceneWorld(liveVersion, 1);

  putClipsInScene(0, "");
  registerPendingMockObject("scene-copy", {
    path: livePath.scene(1),
    type: "Scene",
  });
  putClipsInScene(1, "copy-", { pending: true, ...failures });

  return world;
}

describe("ppal-duplicate scene - return-track clips", () => {
  beforeEach(() => {
    registerSceneAndCopy("13.0");
  });

  it("lists the copy's regular and return-track clips, in track order", async () => {
    expect(await duplicate({ type: "scene", id: "scene0" })).toStrictEqual({
      id: "scene-copy",
      path: "s1",
      clips: COPY_CLIPS,
    });
  });

  it("clears every clip of the copy, return tracks included", async () => {
    const result = (await duplicate({
      type: "scene",
      id: "scene0",
      withoutClips: true,
    })) as Entry;

    expect(result).toStrictEqual({ id: "scene-copy", path: "s1", clips: [] });

    for (const path of [
      livePath.track(0).clipSlot(1).clip(),
      livePath.returnTrack(0).clipSlot(1).clip(),
      livePath.returnTrack(1).clipSlot(1).clip(),
    ]) {
      expect(LiveAPI.from(path).exists()).toBe(false);
    }

    // The source scene keeps its clips.
    expect(
      LiveAPI.from(livePath.returnTrack(0).clipSlot(0).clip()).exists(),
    ).toBe(true);
  });

  it("lists the clips Live wouldn't clear, and still clears the rest", async () => {
    registerSceneAndCopy("13.0", { failures: { "rt0/s1": "refuses" } });

    const result = (await duplicate({
      type: "scene",
      id: "scene0",
      withoutClips: true,
    })) as Entry;

    expect(result).toStrictEqual({
      id: "scene-copy",
      path: "s1",
      clips: [{ id: "copy-rt0/s1", path: "rt0/s1" }],
      detail:
        "the scene was made, but couldn't clear the clip at rt0/s1: Live refused to delete rt0/s1",
    });
    expect(LiveAPI.from(livePath.track(0).clipSlot(1).clip()).exists()).toBe(
      false,
    );
    expect(
      LiveAPI.from(livePath.returnTrack(1).clipSlot(1).clip()).exists(),
    ).toBe(false);
  });

  it("counts a clip gone when Live threw after deleting it", async () => {
    registerSceneAndCopy("13.0", {
      failures: { "rt0/s1": "throws after deleting" },
    });

    expect(
      await duplicate({ type: "scene", id: "scene0", withoutClips: true }),
    ).toStrictEqual({ id: "scene-copy", path: "s1", clips: [] });
  });
});

describe("ppal-duplicate scene - return-track clips on Live 12", () => {
  it("lists the regular tracks' clips and never asks a return slot", async () => {
    const world = registerSceneAndCopy("12.4.15");

    expect(await duplicate({ type: "scene", id: "scene0" })).toStrictEqual({
      id: "scene-copy",
      path: "s1",
      clips: [COPY_CLIPS[0]],
    });
    expect(world.returnSlotReads()).toStrictEqual([]);
  });
});

describe("ppal-duplicate scene - to the arrangement", () => {
  /**
   * A scene with one clip on a regular track and `returnClips` on return
   * tracks, and the track that copies it.
   * @param liveVersion - The version Live reports
   * @param returnClips - How many return tracks hold a clip in the scene
   */
  function setupScene(liveVersion: string, returnClips: number): void {
    mockNonExistentObjects();

    const liveSet = setupArrangementSceneMocks(1);

    registerMockObject("live_app", {
      path: "live_app",
      methods: { get_version_string: () => liveVersion },
    });
    liveSet.properties.return_tracks = children("return0", "return1");

    for (let index = 0; index < returnClips; index++) {
      registerMockObject(`r${index}s0`, {
        path: livePath.returnTrack(index).clipSlot(0),
        properties: { has_clip: 1 },
      });
      registerMockObject(`rclip${index}`, {
        path: livePath.returnTrack(index).clipSlot(0).clip(),
        properties: { name: "Env", is_midi_clip: 0, is_audio_clip: 0 },
      });
    }

    registerClipSlot(0, 0, true, createStandardMidiClipMock());
    registerTrackWithArrangementDup(0);
    registerArrangementClip(0, 0, 16);
  }

  it("copies the regular clips and says the return-track clips weren't", async () => {
    setupScene("13.0", 2);

    const result = (await duplicate({
      type: "scene",
      id: "scene1",
      toPath: "[5|1]",
    })) as Entry;

    expect(result.clips).toStrictEqual([
      { id: "live_set tracks 0 arrangement_clips 0", path: "t0[5|1]" },
    ]);
    expect(result.detail).toBe(
      "the 2 return-track clips (rt0/s0, rt1/s0) were not copied: the arrangement has no return-track clips",
    );
  });

  it("names a lone return-track clip", async () => {
    setupScene("13.0", 1);

    const result = (await duplicate({
      type: "scene",
      id: "scene1",
      toPath: "[5|1]",
    })) as Entry;

    expect(result.detail).toBe(
      "the return-track clip at rt0/s0 was not copied: the arrangement has no return-track clips",
    );
  });

  it("says so when the return-track clips are all the scene holds", async () => {
    setupScene("13.0", 1);
    registerClipSlot(0, 0, false);

    const result = (await duplicate({
      type: "scene",
      id: "scene1",
      toPath: "[5|1]",
    })) as Entry;

    expect(result).toStrictEqual({
      clips: [],
      detail:
        "the scene has no clips on regular tracks, and the return-track clip at rt0/s0 was not copied: the arrangement has no return-track clips",
    });
  });

  it("says nothing of return tracks on Live 12", async () => {
    setupScene("12.4.15", 2);

    const result = (await duplicate({
      type: "scene",
      id: "scene1",
      toPath: "[5|1]",
    })) as Entry;

    expect(result.detail).toBeUndefined();
  });
});
