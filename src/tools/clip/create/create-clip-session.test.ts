// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { livePath } from "#src/test/helpers/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { createNote } from "#src/test/test-data-builders.ts";
import { MAX_AUTO_CREATED_SCENES } from "#src/tools/constants.ts";
import { createClip } from "./create-clip.ts";

interface SessionClipSetupOptions {
  hasClip?: number;
  clipId?: string;
  clipProperties?: Record<string, unknown>;
}

function extractSceneIds(rawScenes: unknown): string[] {
  if (!Array.isArray(rawScenes)) {
    return [];
  }

  const ids: string[] = [];

  for (let i = 0; i < rawScenes.length; i += 2) {
    if (rawScenes[i] === "id" && rawScenes[i + 1] != null) {
      ids.push(String(rawScenes[i + 1]));
    }
  }

  return ids;
}

function buildScenesChildren(sceneIds: string[]): string[] {
  const result: string[] = [];

  for (const id of sceneIds) {
    result.push("id", id);
  }

  return result;
}

function setupLiveSet(
  properties: Record<string, unknown> = {},
): RegisteredMockObject {
  const mergedProps: Record<string, unknown> = {
    signature_numerator: 4,
    signature_denominator: 4,
    scenes: children("scene0"),
    ...properties,
  };
  let sceneIds = extractSceneIds(mergedProps.scenes);
  const liveSet = registerMockObject("live-set", {
    path: "live_set",
    properties: mergedProps,
  });

  liveSet.get.mockImplementation((prop: string) => {
    if (prop === "scenes") {
      return buildScenesChildren(sceneIds);
    }

    const value = mergedProps[prop];

    if (value !== undefined) {
      return Array.isArray(value) ? value : [value];
    }

    return [0];
  });

  liveSet.call.mockImplementation((method: string) => {
    if (method === "create_scene") {
      sceneIds = [...sceneIds, `scene${sceneIds.length}`];
    }

    return null;
  });

  return liveSet;
}

function setupTrack(trackIndex: number): RegisteredMockObject {
  return registerMockObject(`track-${trackIndex}`, {
    path: livePath.track(trackIndex),
  });
}

function setupSessionClip(
  trackIndex: number,
  sceneIndex: number,
  opts: SessionClipSetupOptions = {},
): { clipSlot: RegisteredMockObject; clip: RegisteredMockObject } {
  const clipSlot = registerMockObject(`clip-slot-${trackIndex}-${sceneIndex}`, {
    path: livePath.track(trackIndex).clipSlot(sceneIndex),
    properties: { has_clip: opts.hasClip ?? 0 },
  });
  const clip = registerMockObject(
    opts.clipId ??
      `live_set/tracks/${trackIndex}/clip_slots/${sceneIndex}/clip`,
    {
      path: livePath.track(trackIndex).clipSlot(sceneIndex).clip(),
      properties: opts.clipProperties,
    },
  );

  return { clipSlot, clip };
}

describe("createClip - session view", () => {
  it("should create a single clip with notes", async () => {
    setupLiveSet();
    setupTrack(0);
    const { clipSlot, clip } = setupSessionClip(0, 0, {
      clipId: "clip_0_0",
      clipProperties: {
        signature_numerator: 4,
        signature_denominator: 4,
        length: 4,
      },
    });

    const result = await createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: "0",
      notes: "C3 D3 E3 1|1",
      name: "New Clip",
      color: "#FF0000",
      looping: true,
      auto: "play-clip",
    });

    expect(clipSlot.call).toHaveBeenCalledWith("create_clip", 4);
    expect(clip.set).toHaveBeenCalledWith("name", "New Clip");
    expect(clip.set).toHaveBeenCalledWith("color", 16711680);
    expect(clip.set).toHaveBeenCalledWith("looping", 1);
    expect(clip.call).toHaveBeenCalledWith("add_new_notes", {
      notes: [
        createNote(),
        createNote({ pitch: 62 }),
        createNote({ pitch: 64 }),
      ],
    });
    expect(clipSlot.call).toHaveBeenCalledWith("fire");

    expect(result).toStrictEqual({
      id: "clip_0_0",
      trackIndex: 0,
      sceneIndex: 0,
      noteCount: 3,
      length: "1:0",
    });
  });

  it("should fire the scene when auto=play-scene", async () => {
    setupLiveSet();
    setupTrack(0);
    setupSessionClip(0, 0, {
      clipProperties: { signature_numerator: 4, signature_denominator: 4 },
    });
    const scene0 = registerMockObject("scene0-handle", {
      path: livePath.scene(0),
    });

    const result = await createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: "0",
      notes: "C3 1|1",
      auto: "play-scene",
    });

    expect(scene0.call).toHaveBeenCalledWith("fire");
    expect(result).toStrictEqual({
      id: "live_set/tracks/0/clip_slots/0/clip",
      trackIndex: 0,
      sceneIndex: 0,
      noteCount: 1,
      length: "1:0",
    });
  });

  it("should throw error when scene does not exist for auto=play-scene", async () => {
    mockNonExistentObjects();
    setupLiveSet();
    setupTrack(0);
    setupSessionClip(0, 0, {
      clipProperties: { signature_numerator: 4, signature_denominator: 4 },
    });

    await expect(
      createClip({
        view: "session",
        trackIndex: 0,
        sceneIndex: "0",
        notes: "C3 1|1",
        auto: "play-scene",
      }),
    ).rejects.toThrow(
      'createClip auto="play-scene" failed: scene at sceneIndex=0 does not exist',
    );
  });

  it("should throw error for invalid auto value", async () => {
    setupLiveSet();
    setupTrack(0);
    setupSessionClip(0, 0, {
      clipProperties: { signature_numerator: 4, signature_denominator: 4 },
    });

    await expect(
      createClip({
        view: "session",
        trackIndex: 0,
        sceneIndex: "0",
        auto: "invalid-value",
      }),
    ).rejects.toThrow('createClip failed: unknown auto value "invalid-value"');
  });

  it("should create multiple clips at specified scene indices", async () => {
    const liveSet = setupLiveSet({
      scenes: children("scene0"), // Only 1 existing scene, so create scenes 1, 2, 3
    });

    setupTrack(0);
    const { clipSlot: slot1, clip: clip1 } = setupSessionClip(0, 1, {
      clipId: "clip_0_1",
    });
    const { clipSlot: slot2, clip: clip2 } = setupSessionClip(0, 2, {
      clipId: "clip_0_2",
    });
    const { clipSlot: slot3, clip: clip3 } = setupSessionClip(0, 3, {
      clipId: "clip_0_3",
    });

    const result = await createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: "1,2,3", // Create clips at scenes 1, 2, and 3
      name: "Loop",
      color: "#00FF00",
    });

    const createSceneCalls = liveSet.call.mock.calls.filter(
      (call: unknown[]) => call[0] === "create_scene",
    );

    expect(createSceneCalls).toHaveLength(3);
    expect(slot1.call).toHaveBeenCalledWith("create_clip", 4);
    expect(slot2.call).toHaveBeenCalledWith("create_clip", 4);
    expect(slot3.call).toHaveBeenCalledWith("create_clip", 4);
    expect(clip1.set).toHaveBeenCalledWith("name", "Loop");
    expect(clip2.set).toHaveBeenCalledWith("name", "Loop 2");
    expect(clip3.set).toHaveBeenCalledWith("name", "Loop 3");

    expect(result).toStrictEqual([
      { id: "clip_0_1", trackIndex: 0, sceneIndex: 1 },
      { id: "clip_0_2", trackIndex: 0, sceneIndex: 2 },
      { id: "clip_0_3", trackIndex: 0, sceneIndex: 3 },
    ]);
  });

  it("should auto-create scenes when sceneIndex exceeds existing scenes", async () => {
    const liveSet = setupLiveSet({
      scenes: children("scene1", "scene2"), // 2 existing scenes
    });

    setupTrack(0);
    const { clipSlot } = setupSessionClip(0, 4);

    await createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: "4", // Needs scenes at indices 2, 3, 4
      name: "Future Clip",
    });

    const createSceneCalls = liveSet.call.mock.calls.filter(
      (call: unknown[]) => call[0] === "create_scene",
    );

    expect(createSceneCalls).toHaveLength(3);
    expect(clipSlot.call).toHaveBeenCalledWith("create_clip", 4);
  });

  it("should emit warning and return empty array if clip already exists", async () => {
    setupLiveSet();
    setupTrack(0);
    const { clipSlot } = setupSessionClip(0, 0, { hasClip: 1 });

    const result = await createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: "0",
      name: "This Should Fail",
    });

    expect(clipSlot.call).not.toHaveBeenCalledWith(
      "create_clip",
      expect.anything(),
    );
    expect(result).toStrictEqual([]);
  });

  it("should emit warning and return empty array if sceneIndex exceeds maximum", async () => {
    setupLiveSet();
    setupTrack(0);

    const result = await createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: String(MAX_AUTO_CREATED_SCENES),
      name: "This Should Fail",
    });

    expect(result).toStrictEqual([]);
  });
});
