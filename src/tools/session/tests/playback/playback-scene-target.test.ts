// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  mockNonExistentObjects,
  registerMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { toolDefPlayback } from "#src/tools/session/playback.def.ts";
import { playback } from "#src/tools/session/playback.ts";
import { resolveToolSchema } from "#src/tools/shared/tool-framework/resolve-tool-schema.ts";
import { unsetEmptyParams } from "#src/tools/shared/tool-framework/unset-empty-params.ts";
import { setupPlaybackLiveSet } from "./playback-test-helpers.ts";

/**
 * Register a scene, reachable by the given id and by its own path.
 * @param sceneIndex - The scene's index
 * @param id - The id a caller would pass in `ids`
 * @param name - The scene's name, defaulting to the Scene mock's
 * @returns The scene's mock, to assert it fired
 */
function mockScene(
  sceneIndex: number,
  id?: string,
  name?: string,
): RegisteredMockObject {
  return registerMockObject(id ?? livePath.scene(sceneIndex), {
    path: livePath.scene(sceneIndex),
    type: "Scene",
    ...(name != null && { properties: { name } }),
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

    playback({ action: "play-scene", id: "scene3" });

    expect(scene.call).toHaveBeenCalledWith("fire");
  });

  it("fires the scene a lone clip id sits in", () => {
    const scene = mockScene(3);

    mockSessionClip("clip1", 0, 3);
    playback({ action: "play-scene", id: "clip1" });

    expect(scene.call).toHaveBeenCalledWith("fire");
  });

  // A clip slot sits in a scene the same way a clip does, so its id names one
  // too — no extra handling, since both paths carry the scene index.
  it("fires the scene a clip slot id sits in", () => {
    const scene = mockScene(3);

    registerMockObject("slot1", {
      path: livePath.track(0).clipSlot(3),
      type: "ClipSlot",
    });
    playback({ action: "play-scene", id: "slot1" });

    expect(scene.call).toHaveBeenCalledWith("fire");
  });

  // A clip id names its scene without naming which one, so the response says.
  it("names the scene a clip id resolved to", () => {
    mockScene(3, undefined, "Chorus");
    mockSessionClip("clip1", 0, 3);

    expect(playback({ action: "play-scene", id: "clip1" })).toStrictEqual({
      currentTime: "NaN|NaN+nNaN/4",
      playing: true,
      sceneIndex: 3,
      sceneName: "Chorus",
    });
  });

  // Live shows an unnamed scene as its number, and readScene says the same.
  it("names an unnamed scene by its number", () => {
    mockScene(3, undefined, "");

    expect(playback({ action: "play-scene", sceneIndex: 3 })).toStrictEqual({
      currentTime: "NaN|NaN+nNaN/4",
      playing: true,
      sceneIndex: 3,
      sceneName: "4",
    });
  });

  // Only play-scene fires one, so nothing else may claim it did.
  it("names no scene for a clip action", () => {
    mockSessionClip("clip1", 0, 3);
    registerMockObject(livePath.track(0).clipSlot(3), {
      path: livePath.track(0).clipSlot(3),
    });

    const result = playback({ action: "play-session-clips", id: "clip1" });

    expect(result).not.toHaveProperty("sceneIndex");
    expect(result).not.toHaveProperty("sceneName");
  });

  // Scene 0 is falsy, so every hop that carries it has to read it as a value
  // rather than as "nothing named a scene".
  it("fires scene 0 named by an id alone", () => {
    const scene = mockScene(0);

    mockSessionClip("clip1", 0, 0);
    playback({ action: "play-scene", id: "clip1" });

    expect(scene.call).toHaveBeenCalledWith("fire");
  });

  // A caller that sends every param, filling the ones it has no value for with
  // null, must not be read as having named a second, conflicting scene. This
  // goes through the schema the tool registers, not straight to the handler.
  it("ignores a null sceneIndex beside a path", () => {
    const scene = mockScene(3);
    const params = resolveToolSchema(
      toolDefPlayback.toolOptions.inputSchema,
      {},
    ).validating;
    const raw = { action: "play-scene", path: "s3", sceneIndex: null };

    playback(z.object(params).parse(unsetEmptyParams(raw, params)));

    expect(scene.call).toHaveBeenCalledWith("fire");
  });

  // A blank is refused where the null is dropped: a number has no empty value,
  // so a caller sending one meant something and the call can't guess what.
  it("refuses a blank sceneIndex beside a path", () => {
    const params = resolveToolSchema(
      toolDefPlayback.toolOptions.inputSchema,
      {},
    ).validating;

    expect(() =>
      unsetEmptyParams(
        { action: "play-scene", path: "s3", sceneIndex: "" },
        params,
      ),
    ).toThrow("sceneIndex: a blank string is not a value for this param.");
  });

  it("fires the scene when path and an id agree", () => {
    const scene = mockScene(3);

    mockSessionClip("clip1", 0, 3);
    playback({ action: "play-scene", path: "s3", id: "clip1" });

    expect(scene.call).toHaveBeenCalledWith("fire");
  });

  it("fires the scene when sceneIndex and an id agree", () => {
    const scene = mockScene(3, "scene3");

    playback({ action: "play-scene", sceneIndex: 3, id: "scene3" });

    expect(scene.call).toHaveBeenCalledWith("fire");
  });

  it("fires the scene when several ids agree on it", () => {
    const scene = mockScene(3);

    mockSessionClip("clip1", 0, 3);
    mockSessionClip("clip2", 2, 3);
    playback({ action: "play-scene", id: "clip1,clip2" });

    expect(scene.call).toHaveBeenCalledWith("fire");
  });

  it("refuses a path and an id that name different scenes", () => {
    mockSessionClip("clip1", 0, 5);

    expect(() =>
      playback({ action: "play-scene", path: "s3", id: "clip1" }),
    ).toThrow(
      'playback failed: action "play-scene" plays one scene, but got ' +
        'scene 3 from path "s3", scene 5 from id "clip1"',
    );
  });

  it("refuses a sceneIndex and an id that name different scenes", () => {
    mockSessionClip("clip1", 0, 5);

    expect(() =>
      playback({ action: "play-scene", sceneIndex: 3, id: "clip1" }),
    ).toThrow(
      'playback failed: action "play-scene" plays one scene, but got ' +
        'scene 3 from sceneIndex 3, scene 5 from id "clip1"',
    );
  });

  it("refuses ids that name different scenes on their own", () => {
    mockSessionClip("clip1", 0, 3);
    mockSessionClip("clip2", 0, 5);

    expect(() => playback({ action: "play-scene", id: "clip1,clip2" })).toThrow(
      'playback failed: action "play-scene" plays one scene, but got ' +
        'scene 3 from id "clip1", scene 5 from id "clip2"',
    );
  });

  it("fires nothing when the scenes disagree", () => {
    const scene = mockScene(3);

    mockSessionClip("clip1", 0, 5);
    expect(() =>
      playback({ action: "play-scene", path: "s3", id: "clip1" }),
    ).toThrow('action "play-scene" plays one scene');

    expect(scene.call).not.toHaveBeenCalledWith("fire");
  });
});

// A scene launch fires every track, so the track in "t0/s1" is surplus rather
// than a contradiction. Drop it and fire the scene the caller already named.
describe("playback play-scene from a clip slot", () => {
  beforeEach(() => {
    setupPlaybackLiveSet();
  });

  it("fires the scene a clip slot sits in", () => {
    const scene = mockScene(1);

    playback({ action: "play-scene", path: "t0/s1" });

    expect(scene.call).toHaveBeenCalledWith("fire");
  });

  it("recovers from the deprecated slots the same way", () => {
    const scene = mockScene(1);

    playback({ action: "play-scene", slots: "0/1" });

    expect(scene.call).toHaveBeenCalledWith("fire");
  });

  it("says nothing about dropping the track", () => {
    const warn = vi.spyOn(console, "warn");

    mockScene(1);
    playback({ action: "play-scene", path: "t0/s1" });

    expect(warn).not.toHaveBeenCalled();
  });

  it("fires the scene when several positions sit in it", () => {
    const scene = mockScene(1);

    playback({ action: "play-scene", path: "t0/s1,t2/s1" });

    expect(scene.call).toHaveBeenCalledWith("fire");
  });

  // The old rule refused any list mixing a scene with a position, on shape
  // alone. Now the shapes both name scene 1, so there is nothing to refuse.
  it("fires the scene when a scene and a position in it agree", () => {
    const scene = mockScene(1);

    playback({ action: "play-scene", path: "s1,t0/s1" });

    expect(scene.call).toHaveBeenCalledWith("fire");
  });

  it("fires the scene when a position and sceneIndex agree", () => {
    const scene = mockScene(1);

    playback({ action: "play-scene", path: "t0/s1", sceneIndex: 1 });

    expect(scene.call).toHaveBeenCalledWith("fire");
  });

  it("refuses positions in different scenes, naming each", () => {
    expect(() =>
      playback({ action: "play-scene", path: "t0/s1,t2/s3" }),
    ).toThrow(
      'playback failed: action "play-scene" plays one scene, but got ' +
        'scene 1 from path "t0/s1", scene 3 from path "t2/s3"',
    );
  });

  // Quoting "t0/s1" back at a slots caller would hand them a value slots
  // rejects, so each entry is named the way the param it came from is written.
  it("quotes disagreeing slots entries in slots spelling", () => {
    expect(() => playback({ action: "play-scene", slots: "0/1,2/3" })).toThrow(
      'playback failed: action "play-scene" plays one scene, but got ' +
        'scene 1 from slots "0/1", scene 3 from slots "2/3"',
    );
  });

  it("refuses a position that disagrees with sceneIndex", () => {
    expect(() =>
      playback({ action: "play-scene", path: "t0/s1", sceneIndex: 3 }),
    ).toThrow(
      'playback failed: action "play-scene" plays one scene, but got ' +
        'scene 1 from path "t0/s1", scene 3 from sceneIndex 3',
    );
  });

  // The reverse direction stays refused: firing clips one at a time is not what
  // launching a scene does, so recovering would swap which Live call runs.
  it("does not recover a scene path for play-session-clips", () => {
    expect(() =>
      playback({ action: "play-session-clips", path: "s3" }),
    ).toThrow('invalid path "s3" - names a scene');
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
    playback({ action: "play-scene", sceneIndex: 3, id: "gone" });

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
    playback({ action: "play-scene", sceneIndex: 3, id: "clip1" });

    expect(scene.call).toHaveBeenCalledWith("fire");
    expect(warn).toHaveBeenCalledWith(
      "playback: t0[1|1] (id clip1) is in no scene (found Clip); action " +
        '"play-scene" takes a scene id or a session clip id',
    );
  });

  it("skips an id of the wrong type entirely", () => {
    const warn = vi.spyOn(console, "warn");
    const scene = mockScene(3);

    registerMockObject("track9", { path: livePath.track(5), type: "Track" });
    playback({ action: "play-scene", sceneIndex: 3, id: "track9" });

    expect(scene.call).toHaveBeenCalledWith("fire");
    expect(warn).toHaveBeenCalledWith(
      "playback: t5 (id track9) is in no scene (found Track); action " +
        '"play-scene" takes a scene id or a session clip id',
    );
  });

  it("refuses the action when no id named a scene and nothing else did", () => {
    registerMockObject("track9", { path: livePath.track(5), type: "Track" });

    expect(() => playback({ action: "play-scene", id: "track9" })).toThrow(
      'playback failed: path "s<scene>" or a scene id is required',
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
      'sceneIndex ignored: action "play-session-clips" acts on clip ' +
        'slots; use action "play-scene" for the whole scene',
    );
  });

  it("warns that stop-session-clips ignored it", () => {
    const warn = vi.spyOn(console, "warn");

    registerMockObject(livePath.track(0), { path: livePath.track(0) });
    playback({ action: "stop-session-clips", path: "t0/s1", sceneIndex: 3 });

    expect(warn).toHaveBeenCalledWith(
      'sceneIndex ignored: action "stop-session-clips" acts on clip ' +
        'slots; use action "play-scene" for the whole scene',
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
