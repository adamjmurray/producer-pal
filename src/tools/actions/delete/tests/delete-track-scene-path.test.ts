// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  capturedWarnings,
  clearCapturedWarnings,
} from "#src/shared/max/v8-warning-capture.ts";
import {
  type RegisteredMockObject,
  deleteMockObject,
  mockNonExistentObjects,
  registerMockObject,
  simulateMockDeletes,
} from "#src/test/mocks/mock-registry.ts";
import {
  putClipsInScene,
  registerSceneWorld,
  type SceneWorld,
} from "#src/tools/shared/clip/slot-contents/tests/scene-world-test-helpers.ts";
import { setupSceneMocks, setupTrackMocks } from "./delete-test-helpers.ts";
import { deleteObject } from "../delete.ts";

describe("deleteObject by track and scene path", () => {
  let liveSet: RegisteredMockObject;

  beforeEach(() => {
    clearCapturedWarnings();
    // delete confirms the object is gone, so the mock has to model it going away
    simulateMockDeletes();
    liveSet = registerMockObject("live_set", { path: livePath.liveSet });
  });

  it("deletes the track a path names", () => {
    setupTrackMocks({ track_2: String(livePath.track(1)) });

    expect(deleteObject({ path: "t1", type: "track" })).toStrictEqual({
      id: "track_2",
      deletedPath: "t1",
    });
    expect(liveSet.call).toHaveBeenCalledWith("delete_track", 1);
  });

  it("deletes a return track a path names", () => {
    setupTrackMocks({ ret_0: String(livePath.returnTrack(0)) });

    expect(deleteObject({ path: "rt0", type: "track" })).toStrictEqual({
      id: "ret_0",
      deletedPath: "rt0",
    });
    expect(liveSet.call).toHaveBeenCalledWith("delete_return_track", 0);
  });

  it("deletes the scene a path names", () => {
    liveSet = registerMockObject("live_set", {
      path: livePath.liveSet,
      properties: { tracks: children() },
    });
    setupSceneMocks({ scene_3: livePath.scene(2) });

    expect(deleteObject({ path: "s2", type: "scene" })).toStrictEqual({
      id: "scene_3",
      deletedPath: "s2",
    });
    expect(liveSet.call).toHaveBeenCalledWith("delete_scene", 2);
  });

  it("deletes tracks named by id and by path in one call", () => {
    setupTrackMocks({
      track_1: String(livePath.track(0)),
      track_2: String(livePath.track(1)),
    });

    const result = deleteObject({ id: "track_1", path: "t1", type: "track" });

    // Deletes highest index first so the earlier delete doesn't shift the
    // later one, but results come back in the order named: id before path.
    expect(result).toStrictEqual([
      { id: "track_1", deletedPath: "t0" },
      { id: "track_2", deletedPath: "t1" },
    ]);
  });

  // An empty place is a delete that needed no work: what was asked for has
  // already happened, so the entry says so and the call is not refused.
  it("reports a path that names nothing as nothing to delete", () => {
    mockNonExistentObjects();

    expect(deleteObject({ path: "s9", type: "scene" })).toStrictEqual({
      path: "s9",
      detail: "nothing to delete",
    });
    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("refuses a lone path that names the wrong kind of object", () => {
    expect(() => deleteObject({ path: "t0/s1", type: "track" })).toThrow(
      'invalid path "t0/s1" - names a clip slot, not a track; expected "t<index>", "rt<index>", or "mt"',
    );
    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("keeps a wrong-kind path in its slot beside a track it deleted", () => {
    setupTrackMocks({ track_1: String(livePath.track(0)) });

    expect(deleteObject({ path: "t0/s1, t0", type: "track" })).toStrictEqual([
      {
        path: "t0/s1",
        ok: false,
        detail:
          'invalid path "t0/s1" - names a clip slot, not a track; expected "t<index>", "rt<index>", or "mt"',
      },
      { id: "track_1", deletedPath: "t0" },
    ]);
    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("refuses to delete the main track, which Live has no call for", () => {
    registerMockObject("main", {
      path: livePath.masterTrack(),
      type: "Track",
    });

    expect(() => deleteObject({ path: "mt", type: "track" })).toThrow(
      "Live has no way to delete the main track mt (id main)",
    );
    expect(liveSet.call).not.toHaveBeenCalled();
    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("says a take lane can't be deleted, by path or by id", () => {
    registerMockObject("lane_1", {
      path: livePath.track(0).takeLane(1),
      type: "TakeLane",
    });

    expect(
      deleteObject({ path: "t0/l1", id: "lane_1", type: "track" }),
    ).toStrictEqual([
      {
        id: "lane_1",
        ok: false,
        detail:
          "t0/l1 (id lane_1) is a take lane, which Live's API can't delete; remove it in Live's UI",
      },
      {
        path: "t0/l1",
        ok: false,
        detail:
          "t0/l1 (id lane_1) is a take lane, which Live's API can't delete; remove it in Live's UI",
      },
    ]);
    expect(liveSet.call).not.toHaveBeenCalled();
  });

  // No delete type reaches a take lane. One that's there says what it is; one
  // that isn't is the wrong kind of path, like any other.
  it.each([
    [
      "track",
      'names a take lane, not a track; expected "t<index>", "rt<index>", or "mt"',
    ],
    ["scene", 'names a take lane, not a scene; expected "s<index>"'],
    [
      "device",
      'a take lane holds no devices; devices live on a track ("t0") or down its device chain ("t0/d0")',
    ],
  ])(
    "refuses take-lane paths, there or not, for type %s",
    (type, wrongKind) => {
      mockNonExistentObjects();
      registerMockObject("lane_1", {
        path: livePath.track(0).takeLane(1),
        type: "TakeLane",
      });

      expect(
        deleteObject({ path: "t0/l1, t0/l9, t99/l0", type }),
      ).toStrictEqual([
        {
          path: "t0/l1",
          ok: false,
          detail:
            "t0/l1 (id lane_1) is a take lane, which Live's API can't delete; remove it in Live's UI",
        },
        {
          path: "t0/l9",
          ok: false,
          detail: `invalid path "t0/l9" - ${wrongKind}`,
        },
        {
          path: "t99/l0",
          ok: false,
          detail: `invalid path "t99/l0" - ${wrongKind}`,
        },
      ]);
      expect(liveSet.call).not.toHaveBeenCalled();
    },
  );
});

// A scene's entry names every clip that went with it, regular and return track.
type Entry = Record<string, unknown>;

const FULL_DETAIL =
  'also deleted the 3 clips in this scene: t0/s0 "Step Sequencer", rt0/s0 "No Envs", rt1/s0 "With Env"';

describe("ppal-delete - scene clips", () => {
  let world: SceneWorld;

  beforeEach(() => {
    world = registerSceneWorld("13.0", 3);
    putClipsInScene(0, "");
    putClipsInScene(1, "", { clips: [{ kind: "t", index: 1, name: "Notes" }] });
  });

  it("names every clip the scene held, regular and return track", () => {
    expect(deleteObject({ type: "scene", path: "s0" })).toStrictEqual({
      id: "scene0",
      deletedPath: "s0",
      detail: FULL_DETAIL,
    });
    expect(world.liveSet.call).toHaveBeenCalledWith("delete_scene", 0);
    expect(world.returnSlotReads()).not.toStrictEqual([]);
  });

  it("names a lone clip in the singular, and leaves an empty scene alone", () => {
    expect(
      deleteObject({ type: "scene", path: "s1,s2" }) as Entry[],
    ).toStrictEqual([
      {
        id: "scene1",
        deletedPath: "s1",
        detail: 'also deleted the clip in this scene: t1/s1 "Notes"',
      },
      { id: "scene2", deletedPath: "s2" },
    ]);
  });

  it("gives each scene of a batch the clips it had, at the paths it had", () => {
    const result = deleteObject({ type: "scene", path: "s0,s1" }) as Entry[];

    expect(result.map((entry) => entry.deletedPath)).toStrictEqual([
      "s0",
      "s1",
    ]);
    expect(result[0]?.detail).toBe(FULL_DETAIL);
    expect(result[1]?.detail).toBe(
      'also deleted the clip in this scene: t1/s1 "Notes"',
    );
    // Highest first, so each scene is deleted at the index it was read at.
    expect(world.liveSet.call).toHaveBeenNthCalledWith(1, "delete_scene", 1);
    expect(world.liveSet.call).toHaveBeenNthCalledWith(2, "delete_scene", 0);
  });

  it("names a scene's clips by id too, and leaves out an unnamed clip's name", () => {
    putClipsInScene(2, "", { clips: [{ kind: "rt", index: 1, name: "" }] });

    expect(deleteObject({ type: "scene", id: "scene2" })).toStrictEqual({
      id: "scene2",
      deletedPath: "s2",
      detail: "also deleted the clip in this scene: rt1/s2",
    });
  });

  it("says nothing of clips when the delete throws and the scene survives", () => {
    world.liveSet.call.mockImplementation(() => {
      throw new Error("Live refused");
    });

    expect(() => deleteObject({ type: "scene", path: "s0" })).toThrow(
      "Live refused",
    );
  });

  it("keeps the entry, with the clips, when Live deleted the scene and then threw", () => {
    world.liveSet.call.mockImplementation(() => {
      deleteMockObject(livePath.scene(0));

      throw new Error("Live said no");
    });

    expect(deleteObject({ type: "scene", path: "s0" })).toStrictEqual({
      id: "scene0",
      deletedPath: "s0",
      detail: `Live said no; already changed: deleted the scene, ${FULL_DETAIL}`,
    });
  });
});

describe("ppal-delete - scene clips on Live 12", () => {
  it("lists the regular tracks' clips and never asks a return slot", () => {
    const world = registerSceneWorld("12.4.15", 1);

    putClipsInScene(0, "");

    expect(deleteObject({ type: "scene", path: "s0" })).toStrictEqual({
      id: "scene0",
      deletedPath: "s0",
      detail: 'also deleted the clip in this scene: t0/s0 "Step Sequencer"',
    });
    expect(world.returnSlotReads()).toStrictEqual([]);
  });
});
