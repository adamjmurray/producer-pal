// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  mockNonExistentObjects,
  registerMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { playback } from "#src/tools/session/playback.ts";
import { setupPlaybackLiveSet } from "./playback-test-helpers.ts";

/**
 * Register a scene, reachable by the given id and by its own path.
 * @param sceneIndex - The scene's index
 * @param id - The id a caller would pass in `ids`
 * @returns The scene's mock, to assert it fired
 */
function mockScene(sceneIndex: number, id?: string): RegisteredMockObject {
  return registerMockObject(id ?? livePath.scene(sceneIndex), {
    path: livePath.scene(sceneIndex),
    type: "Scene",
  });
}

/**
 * Register a session clip sitting in a scene.
 * @param id - The clip's id
 * @param trackIndex - The track it sits on
 * @param sceneIndex - The scene it sits in
 */
function mockSessionClip(
  id: string,
  trackIndex: number,
  sceneIndex: number,
): void {
  registerMockObject(id, {
    path: livePath.track(trackIndex).clipSlot(sceneIndex).clip(),
    type: "Clip",
  });
}

// Only one scene plays at a time, so every param that names a scene has to name
// the same one. Agreement fires it; disagreement is refused rather than ranked.
describe("playback play-scene target agreement", () => {
  beforeEach(() => {
    setupPlaybackLiveSet();
  });

  it("fires the scene a lone scene id names", () => {
    const scene = mockScene(3, "scene3");

    playback({ action: "play-scene", ids: "scene3" });

    expect(scene.call).toHaveBeenCalledWith("fire");
  });

  it("fires the scene a lone clip id sits in", () => {
    const scene = mockScene(3);

    mockSessionClip("clip1", 0, 3);
    playback({ action: "play-scene", ids: "clip1" });

    expect(scene.call).toHaveBeenCalledWith("fire");
  });

  // Scene 0 is falsy, so every hop that carries it has to read it as a value
  // rather than as "nothing named a scene".
  it("fires scene 0 named by an id alone", () => {
    const scene = mockScene(0);

    mockSessionClip("clip1", 0, 0);
    playback({ action: "play-scene", ids: "clip1" });

    expect(scene.call).toHaveBeenCalledWith("fire");
  });

  it("fires the scene when path and an id agree", () => {
    const scene = mockScene(3);

    mockSessionClip("clip1", 0, 3);
    playback({ action: "play-scene", path: "s3", ids: "clip1" });

    expect(scene.call).toHaveBeenCalledWith("fire");
  });

  it("fires the scene when sceneIndex and an id agree", () => {
    const scene = mockScene(3, "scene3");

    playback({ action: "play-scene", sceneIndex: 3, ids: "scene3" });

    expect(scene.call).toHaveBeenCalledWith("fire");
  });

  it("fires the scene when several ids agree on it", () => {
    const scene = mockScene(3);

    mockSessionClip("clip1", 0, 3);
    mockSessionClip("clip2", 2, 3);
    playback({ action: "play-scene", ids: "clip1,clip2" });

    expect(scene.call).toHaveBeenCalledWith("fire");
  });

  it("refuses a path and an id that name different scenes", () => {
    mockSessionClip("clip1", 0, 5);

    expect(() =>
      playback({ action: "play-scene", path: "s3", ids: "clip1" }),
    ).toThrow(
      'playback failed: action "play-scene" plays one scene, but got ' +
        'scene 3 from path "s3", scene 5 from ids "clip1"',
    );
  });

  it("refuses a sceneIndex and an id that name different scenes", () => {
    mockSessionClip("clip1", 0, 5);

    expect(() =>
      playback({ action: "play-scene", sceneIndex: 3, ids: "clip1" }),
    ).toThrow(
      'playback failed: action "play-scene" plays one scene, but got ' +
        'scene 3 from sceneIndex 3, scene 5 from ids "clip1"',
    );
  });

  it("refuses ids that name different scenes on their own", () => {
    mockSessionClip("clip1", 0, 3);
    mockSessionClip("clip2", 0, 5);

    expect(() =>
      playback({ action: "play-scene", ids: "clip1,clip2" }),
    ).toThrow(
      'playback failed: action "play-scene" plays one scene, but got ' +
        'scene 3 from ids "clip1", scene 5 from ids "clip2"',
    );
  });

  it("fires nothing when the scenes disagree", () => {
    const scene = mockScene(3);

    mockSessionClip("clip1", 0, 5);
    expect(() =>
      playback({ action: "play-scene", path: "s3", ids: "clip1" }),
    ).toThrow('action "play-scene" plays one scene');

    expect(scene.call).not.toHaveBeenCalledWith("fire");
  });
});

// A bad id is a bad id, not a second scene: warn and skip it, the way the rest
// of the tool treats ids, and let whatever else named a scene carry the call.
describe("playback play-scene ids that name no scene", () => {
  beforeEach(() => {
    setupPlaybackLiveSet();
  });

  it("skips an id that does not exist, and says so", () => {
    const warn = vi.spyOn(console, "warn");
    const scene = mockScene(3);

    mockNonExistentObjects();
    playback({ action: "play-scene", sceneIndex: 3, ids: "gone" });

    expect(scene.call).toHaveBeenCalledWith("fire");
    expect(warn).toHaveBeenCalledWith('playback: id "gone" does not exist');
  });

  it("skips an id that sits in no scene, naming its type", () => {
    const warn = vi.spyOn(console, "warn");
    const scene = mockScene(3);

    registerMockObject("clip1", {
      path: livePath.track(0).arrangementClip(0),
      type: "Clip",
    });
    playback({ action: "play-scene", sceneIndex: 3, ids: "clip1" });

    expect(scene.call).toHaveBeenCalledWith("fire");
    expect(warn).toHaveBeenCalledWith(
      'playback: id "clip1" is in no scene (found Clip); action ' +
        '"play-scene" takes a scene id or a session clip id',
    );
  });

  it("skips an id of the wrong type entirely", () => {
    const warn = vi.spyOn(console, "warn");
    const scene = mockScene(3);

    registerMockObject("track9", { path: livePath.track(5), type: "Track" });
    playback({ action: "play-scene", sceneIndex: 3, ids: "track9" });

    expect(scene.call).toHaveBeenCalledWith("fire");
    expect(warn).toHaveBeenCalledWith(
      'playback: id "track9" is in no scene (found Track); action ' +
        '"play-scene" takes a scene id or a session clip id',
    );
  });

  it("refuses the action when no id named a scene and nothing else did", () => {
    registerMockObject("track9", { path: livePath.track(5), type: "Track" });

    expect(() => playback({ action: "play-scene", ids: "track9" })).toThrow(
      'playback failed: sceneIndex, path "s<scene>", or a scene id is required',
    );
  });
});

// sceneIndex used to vanish without a word on the clip actions, the same
// silent-drop the path params were fixed for.
describe("playback sceneIndex on an action that acts on clips", () => {
  beforeEach(() => {
    setupPlaybackLiveSet();
    registerMockObject(livePath.track(0).clipSlot(1), {
      path: livePath.track(0).clipSlot(1),
    });
  });

  it("warns that play-session-clips ignored it", () => {
    const warn = vi.spyOn(console, "warn");

    playback({ action: "play-session-clips", path: "t0/s1", sceneIndex: 3 });

    expect(warn).toHaveBeenCalledWith(
      'sceneIndex ignored: action "play-session-clips" acts on session ' +
        'positions; use action "play-scene" for the whole scene',
    );
  });

  it("warns that stop-session-clips ignored it", () => {
    const warn = vi.spyOn(console, "warn");

    registerMockObject(livePath.track(0), { path: livePath.track(0) });
    playback({ action: "stop-session-clips", path: "t0/s1", sceneIndex: 3 });

    expect(warn).toHaveBeenCalledWith(
      'sceneIndex ignored: action "stop-session-clips" acts on session ' +
        'positions; use action "play-scene" for the whole scene',
    );
  });

  it("warns that stop ignored it", () => {
    const warn = vi.spyOn(console, "warn");

    playback({ action: "stop", sceneIndex: 3 });

    expect(warn).toHaveBeenCalledWith(
      'sceneIndex ignored: action "stop" takes no target',
    );
  });
});
