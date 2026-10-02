// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import "../duplicate-mocks-test-helpers.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  registerClipMocks,
  children,
  registerClipSlot,
  registerMockObject,
  setupArrangementSceneMocks,
  setupSessionSceneMocks,
} from "#src/tools/actions/duplicate/helpers/duplicate-test-helpers.ts";
import { deleteMockObject } from "#src/test/mocks/mock-registry.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

interface DuplicateClipResult {
  id: string;
  path?: string;
}

interface DuplicateSceneResult {
  id?: string;
  path?: string;
  arrangementStart?: string;
  clips: DuplicateClipResult[];
}

describe("duplicate - scene duplication", () => {
  // has_clip can still be set on a slot Live hands back nothing for, so the
  // scan checks the clip itself before reporting it.
  it("leaves out a slot that says it has a clip but hands back none", async () => {
    setupSessionSceneMocks();
    deleteMockObject(livePath.track(1).clipSlot(1).clip());

    const result = (await duplicate({
      type: "scene",
      id: "scene1",
    })) as DuplicateSceneResult;

    expect(result.clips).toStrictEqual([
      { id: "live_set/tracks/0/clip_slots/1/clip", path: "t0/s1" },
    ]);
  });

  it("should duplicate a single scene to session view (default behavior)", async () => {
    const liveSet = setupSessionSceneMocks();

    const result = (await duplicate({
      type: "scene",
      id: "scene1",
    })) as DuplicateSceneResult;

    expect(result).toStrictEqual({
      id: "live_set/scenes/1",
      path: "s1",
      clips: [
        {
          id: "live_set/tracks/0/clip_slots/1/clip",
          path: "t0/s1",
        },
        {
          id: "live_set/tracks/1/clip_slots/1/clip",
          path: "t1/s1",
        },
      ],
    });

    expect(liveSet.call).toHaveBeenCalledWith("duplicate_scene", 0);
  });

  it("should duplicate multiple scenes with same name", async () => {
    const liveSet = setupSessionSceneMocks({ registerNewScene: false });

    // Register additional clip slots and mocks for second duplicated scene
    registerClipSlot(0, 2, true);
    registerClipSlot(1, 2, true);
    registerClipMocks(2, 2);

    const scene1 = registerMockObject("live_set/scenes/1", {
      path: livePath.scene(1),
    });
    const scene2 = registerMockObject("live_set/scenes/2", {
      path: livePath.scene(2),
    });

    const result = (await duplicate({
      type: "scene",
      id: "scene1",
      count: 2,
      name: "Custom Scene",
    })) as DuplicateSceneResult[];

    expect(result).toStrictEqual([
      {
        id: "live_set/scenes/1",
        path: "s1",
        clips: [
          {
            id: "live_set/tracks/0/clip_slots/1/clip",
            path: "t0/s1",
          },
          {
            id: "live_set/tracks/1/clip_slots/1/clip",
            path: "t1/s1",
          },
        ],
      },
      {
        id: "live_set/scenes/2",
        path: "s2",
        clips: [
          {
            id: "live_set/tracks/0/clip_slots/2/clip",
            path: "t0/s2",
          },
          {
            id: "live_set/tracks/1/clip_slots/2/clip",
            path: "t1/s2",
          },
        ],
      },
    ]);

    expect(liveSet.call).toHaveBeenCalledWith("duplicate_scene", 0);
    expect(liveSet.call).toHaveBeenCalledWith("duplicate_scene", 1);

    expect(scene1.set).toHaveBeenCalledWith("name", "Custom Scene");
    expect(scene2.set).toHaveBeenCalledWith("name", "Custom Scene");
  });

  it("should duplicate a scene without clips when withoutClips is true", async () => {
    const liveSet = setupArrangementSceneMocks();

    const slot0 = registerClipSlot(0, 1, true);
    const slot1 = registerClipSlot(1, 1, true);

    registerClipSlot(2, 1, false);
    registerClipMocks(2, 1);
    registerMockObject("live_set/scenes/1", { path: livePath.scene(1) });

    const result = (await duplicate({
      type: "scene",
      id: "scene1",
      withoutClips: true,
    })) as DuplicateSceneResult;

    expect(result).toStrictEqual({
      id: "live_set/scenes/1",
      path: "s1",
      clips: [],
    });

    expect(liveSet.call).toHaveBeenCalledWith("duplicate_scene", 0);

    // Verify delete_clip was called for clips in the duplicated scene
    expect(slot0.call).toHaveBeenCalledWith("delete_clip");
    expect(slot1.call).toHaveBeenCalledWith("delete_clip");

    const slot0DeleteCalls = slot0.call.mock.calls.filter(
      (c: unknown[]) => c[0] === "delete_clip",
    ).length;
    const slot1DeleteCalls = slot1.call.mock.calls.filter(
      (c: unknown[]) => c[0] === "delete_clip",
    ).length;

    expect(slot0DeleteCalls + slot1DeleteCalls).toBe(2);
  });

  it("should apply color when duplicating a scene", async () => {
    registerMockObject("scene1", { path: livePath.scene(0) });

    const liveSet = registerMockObject("live_set", {
      path: livePath.liveSet,
      properties: { tracks: [] },
    });

    const newScene = registerMockObject("live_set/scenes/1", {
      path: livePath.scene(1),
    });

    const result = (await duplicate({
      type: "scene",
      id: "scene1",
      color: "#00ff00",
    })) as DuplicateSceneResult;

    expect(liveSet.call).toHaveBeenCalledWith("duplicate_scene", 0);
    expect(newScene.set).toHaveBeenCalledWith("color", 0x00ff00);
    expect(result.id).toBe("live_set/scenes/1");
    expect(result.path).toBe("s1");
  });

  it("stops session scene copies at the request deadline", async () => {
    const liveSet = setupSessionSceneMocks();

    const result = await duplicate(
      { type: "scene", id: "scene1", count: 2 },
      { deadline: Date.now() - 1 },
    );

    expect(result).toStrictEqual([]);
    expect(liveSet.call).not.toHaveBeenCalledWith("duplicate_scene", 0);
    expect(capturedWarnings()).toContain(
      "Ran out of time after duplicating 0 of 2 scenes. Re-run for the rest.",
    );
  });
});

describe("duplicate - several session scenes", () => {
  // An inserted session scene shifts the copies below it, which is not the
  // same as burying them: every copy here is still there, just further down.
  it("reports a session scene copy where a later one shifted it to", async () => {
    registerMockObject("sceneA", { path: livePath.scene(0) });
    registerMockObject("sceneB", { path: livePath.scene(1) });
    registerMockObject("live_set", {
      path: livePath.liveSet,
      properties: { tracks: children("track0") },
      methods: {
        // Copying scene 0 inserts at 1, pushing sceneB's copy from 2 to 3.
        duplicate_scene: (index: unknown) => {
          if (index === 0) {
            registerMockObject("sceneCopyOfB", { path: livePath.scene(3) });
            registerMockObject("copyOfB", {
              path: livePath.track(0).clipSlot(3).clip(),
            });
          }
        },
      },
    });
    registerClipSlot(0, 1, true);
    registerClipSlot(0, 2, true);
    registerMockObject("sceneCopyOfA", { path: livePath.scene(1) });
    registerMockObject("sceneCopyOfB", { path: livePath.scene(2) });
    registerMockObject("copyOfA", {
      path: livePath.track(0).clipSlot(1).clip(),
    });
    registerMockObject("copyOfB", {
      path: livePath.track(0).clipSlot(2).clip(),
    });

    const result = (await duplicate({
      type: "scene",
      id: "sceneB,sceneA",
    })) as DuplicateSceneResult[];

    expect(result).toStrictEqual([
      {
        id: "sceneCopyOfB",
        path: "s3",
        clips: [{ id: "copyOfB", path: "t0/s3" }],
      },
      {
        id: "sceneCopyOfA",
        path: "s1",
        clips: [{ id: "copyOfA", path: "t0/s1" }],
      },
    ]);
  });
});

/**
 * One scene with no tracks, whose copies land at s1 and s2, and whose listed
 * calls to duplicate_scene throw.
 * @param failing - Which duplicate_scene calls throw, counting from 1
 * @returns The live_set mock
 */
function sceneCopiesFailingAt(
  failing: number[],
): ReturnType<typeof registerMockObject> {
  let calls = 0;

  registerMockObject("scene1", { path: livePath.scene(0) });
  registerMockObject("copyA", { path: livePath.scene(1) });
  registerMockObject("copyB", { path: livePath.scene(2) });

  return registerMockObject("live_set", {
    path: livePath.liveSet,
    properties: { tracks: children() },
    methods: {
      duplicate_scene: () => {
        calls++;

        if (failing.includes(calls)) {
          throw new Error("Live refused the copy");
        }
      },
    },
  });
}

describe("duplicate - a session scene copy that fails", () => {
  it("keeps the copies around it", async () => {
    const liveSet = sceneCopiesFailingAt([2]);

    const result = await duplicate({ type: "scene", id: "scene1", count: 3 });

    expect(result).toStrictEqual([
      { id: "copyA", path: "s1", clips: [] },
      { id: "scene1", ok: false, detail: "Live refused the copy" },
      { id: "copyB", path: "s2", clips: [] },
    ]);
    // The next copy follows the last one that landed, not the one that didn't.
    expect(liveSet.call).toHaveBeenLastCalledWith("duplicate_scene", 1);
  });

  it("reports every copy when none landed", async () => {
    sceneCopiesFailingAt([1, 2]);

    const result = await duplicate({ type: "scene", id: "scene1", count: 2 });

    expect(result).toStrictEqual([
      { id: "scene1", ok: false, detail: "Live refused the copy" },
      { id: "scene1", ok: false, detail: "Live refused the copy" },
    ]);
  });
});
