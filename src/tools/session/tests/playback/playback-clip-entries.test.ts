// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";
import {
  mockNonExistentObjects,
  registerMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { playback } from "#src/tools/session/playback.ts";
import {
  registerClipSlot,
  setupPlaybackLiveSet,
} from "./playback-test-helpers.ts";

/**
 * Register a session clip and the slot it sits in.
 * @param id - The clip's id
 * @param trackIndex - The track it sits on
 * @param sceneIndex - The scene it sits in
 * @returns The clip slot's mock, to assert it fired
 */
function mockClipInSlot(
  id: string,
  trackIndex: number,
  sceneIndex: number,
): RegisteredMockObject {
  registerMockObject(id, {
    path: livePath.track(trackIndex).clipSlot(sceneIndex).clip(),
  });

  return registerClipSlot(trackIndex, sceneIndex);
}

// A call naming N clip slots answers with N entries, in the order it named
// them, so the caller can pair a result to the target it wrote.
describe("playback clip entries", () => {
  let liveSet: RegisteredMockObject;

  beforeEach(() => {
    liveSet = setupPlaybackLiveSet();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps a bad id's slot and fires the rest", () => {
    const slot = mockClipInSlot("clip2", 1, 0);

    mockNonExistentObjects();

    const result = playback({
      action: "play-session-clips",
      id: "999999,clip2",
    });

    expect(slot.call).toHaveBeenCalledWith("fire");
    expect(result.clip).toStrictEqual([
      { id: "999999", ok: false, detail: 'id "999999" does not exist' },
      { id: "clip2", path: "t1/s0" },
    ]);
    // The reason is the entry's, so nothing warns it too.
    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("answers ids first, then paths, as the call named them", () => {
    mockClipInSlot("clip1", 0, 0);
    mockClipInSlot("clip2", 1, 1);
    // An empty slot is a target like any other — firing one stops its track.
    registerClipSlot(2, 2);
    mockNonExistentObjects();

    const result = playback({
      action: "play-session-clips",
      id: "clip1",
      path: "t2/s2,t1/s1",
    });

    expect(result.clip).toStrictEqual([
      { id: "clip1", path: "t0/s0" },
      { path: "t2/s2" },
      { id: "clip2", path: "t1/s1" },
    ]);
  });

  it("fires a slot named twice once, and says where the work happened", () => {
    const slot = mockClipInSlot("clip1", 0, 0);

    const result = playback({
      action: "play-session-clips",
      id: "clip1",
      path: "t0/s0",
    });

    expect(slot.call).toHaveBeenCalledExactlyOnceWith("fire");
    expect(result.clip).toStrictEqual([
      { id: "clip1", detail: 'named again as "t0/s0" later in this call' },
      { id: "clip1", path: "t0/s0" },
    ]);
  });

  it("names a missing slot back in the caller's own spelling", () => {
    mockClipInSlot("clip1", 0, 0);
    mockNonExistentObjects();

    const result = playback({
      action: "play-session-clips",
      slots: "0/0,99/0",
    });

    expect(result.clip).toStrictEqual([
      { id: "clip1", path: "t0/s0" },
      { path: "99/0", ok: false, detail: "no clip slot at t99/s0" },
    ]);
  });

  it("stops the tracks it could reach and keeps the rest of the slots", () => {
    mockClipInSlot("clip1", 0, 0);

    const track0 = registerMockObject(livePath.track(0), {
      path: livePath.track(0),
    });

    mockNonExistentObjects();

    const result = playback({
      action: "stop-session-clips",
      id: "clip1,999999",
    });

    expect(track0.call).toHaveBeenCalledExactlyOnceWith("stop_all_clips");
    expect(result.clip).toStrictEqual([
      { id: "clip1", path: "t0/s0" },
      { id: "999999", ok: false, detail: 'id "999999" does not exist' },
    ]);
  });

  it("stops a track once for two of its slots", () => {
    mockClipInSlot("clip1", 0, 0);
    mockClipInSlot("clip2", 0, 1);

    const track0 = registerMockObject(livePath.track(0), {
      path: livePath.track(0),
    });

    const result = playback({
      action: "stop-session-clips",
      path: "t0/s0,t0/s1",
    });

    expect(track0.call).toHaveBeenCalledExactlyOnceWith("stop_all_clips");
    expect(result.clip).toStrictEqual([
      { id: "clip1", path: "t0/s0" },
      { id: "clip2", path: "t0/s1" },
    ]);
  });

  it("tries a track again for its next slot when a stop threw", () => {
    mockClipInSlot("clip1", 0, 0);
    mockClipInSlot("clip2", 0, 1);

    const track0 = registerMockObject(livePath.track(0), {
      path: livePath.track(0),
    });

    track0.call.mockImplementationOnce(() => {
      throw new Error("Live refused the stop");
    });

    const result = playback({
      action: "stop-session-clips",
      path: "t0/s0,t0/s1",
    });

    // The stop that never happened is not reported as done.
    expect(track0.call).toHaveBeenCalledTimes(2);
    expect(result.clip).toStrictEqual([
      { path: "t0/s0", ok: false, detail: "Live refused the stop" },
      { id: "clip2", path: "t0/s1" },
    ]);
  });

  // Firing nothing can't start the transport, and claiming it did sends the
  // caller looking for a launch that never happened.
  it("claims no launch when every clip named was skipped", () => {
    mockNonExistentObjects();

    const result = playback({
      action: "play-session-clips",
      id: "999998,999999",
    });

    expect(liveSet.call).not.toHaveBeenCalledWith("start_playing");
    expect(result.playing).toBe(false);
    expect(result.clip).toHaveLength(2);
  });

  // `clip` mirrors the singular `id`/`path` params: a lone target comes back
  // unwrapped, several as a list.
  it("answers one clip on its own and several as a list", () => {
    mockClipInSlot("clip1", 0, 0);
    mockClipInSlot("clip2", 1, 0);

    expect(
      playback({ action: "play-session-clips", id: "clip1" }).clip,
    ).toStrictEqual({ id: "clip1", path: "t0/s0" });
    expect(
      playback({ action: "play-session-clips", id: "clip1,clip2" }).clip,
    ).toStrictEqual([
      { id: "clip1", path: "t0/s0" },
      { id: "clip2", path: "t1/s0" },
    ]);
    // A trailing comma is not a second target.
    expect(
      playback({ action: "play-session-clips", id: "clip1," }).clip,
    ).toStrictEqual({ id: "clip1", path: "t0/s0" });
  });

  it("has no clip field when the action takes no clips", () => {
    expect(playback({ action: "stop-all-session-clips" })).not.toHaveProperty(
      "clip",
    );
  });

  it("gives a clip Live fails on its own entry and still fires the rest", () => {
    const slots = [
      mockClipInSlot("clip0", 0, 0),
      mockClipInSlot("clip1", 1, 0),
      mockClipInSlot("clip2", 2, 0),
    ];

    (slots[1] as RegisteredMockObject).call.mockImplementation(() => {
      throw new Error("Live refused the launch");
    });

    const result = playback({
      action: "play-session-clips",
      id: "clip0,clip1,clip2",
    });

    expect(result.clip).toStrictEqual([
      { id: "clip0", path: "t0/s0" },
      { id: "clip1", ok: false, detail: "Live refused the launch" },
      { id: "clip2", path: "t2/s0" },
    ]);
    expect(slots[2]?.call).toHaveBeenCalledWith("fire");
    // The two that fired are what the transport restart is about.
    expect(liveSet.call).toHaveBeenCalledWith("start_playing");
    expect(result.playing).toBe(true);
  });

  it("throws when the one clip's launch fails", () => {
    const slot = mockClipInSlot("clip0", 0, 0);

    slot.call.mockImplementation(() => {
      throw new Error("Live refused the launch");
    });

    expect(() =>
      playback({ action: "play-session-clips", id: "clip0" }),
    ).toThrow("Live refused the launch");
  });

  it("leaves the clips the deadline never reached as skips", () => {
    const start = 1_000_000;
    let now = start;

    vi.spyOn(Date, "now").mockImplementation(() => now);

    const first = mockClipInSlot("clip0", 0, 0);

    mockClipInSlot("clip1", 1, 0);
    mockClipInSlot("clip2", 2, 0);
    // The first launch uses up the time.
    first.call.mockImplementation(() => {
      now = start + 5000;
    });

    const result = playback(
      { action: "play-session-clips", id: "clip0,clip1,clip2" },
      { deadline: start + 1000 },
    );

    expect(result.clip).toStrictEqual([
      { id: "clip0", path: "t0/s0" },
      {
        id: "clip1",
        ok: false,
        detail: "the request ran out of time; re-run for this clip",
      },
      {
        id: "clip2",
        ok: false,
        detail: "the request ran out of time; re-run for this clip",
      },
    ]);
    expect(result.playing).toBe(true);
  });

  describe("an empty slot", () => {
    // Firing an empty slot stops whatever its track is playing, so a play never
    // fires one.
    it("is skipped, not fired, and the other slots still fire", () => {
      const slot = mockClipInSlot("clip0", 0, 0);
      const empty = registerClipSlot(1, 0, false);

      const result = playback({
        action: "play-session-clips",
        path: "t1/s0,t0/s0",
      });

      expect(empty.call).not.toHaveBeenCalledWith("fire");
      expect(slot.call).toHaveBeenCalledWith("fire");
      expect(result.clip).toStrictEqual([
        { path: "t1/s0", ok: false, detail: "no clip to play" },
        { id: "clip0", path: "t0/s0" },
      ]);
      expect(result.playing).toBe(true);
    });

    it("refuses a call whose only slot is empty, firing nothing", () => {
      const empty = registerClipSlot(1, 0, false);

      expect(() =>
        playback({ action: "play-session-clips", path: "t1/s0" }),
      ).toThrow("no clip to play");
      expect(empty.call).not.toHaveBeenCalled();
    });

    it("leaves out of the multi-clip restart and playing what never fired", () => {
      mockClipInSlot("clip0", 0, 0);
      registerClipSlot(1, 0, false);
      registerClipSlot(2, 0, false);

      const result = playback({
        action: "play-session-clips",
        path: "t0/s0,t1/s0,t2/s0",
      });

      // Only one slot fired, so there is no second launch to sync.
      expect(liveSet.call).not.toHaveBeenCalledWith("stop_playing");
      expect(liveSet.call).not.toHaveBeenCalledWith("start_playing");
      expect(result.playing).toBe(true);
    });

    it("keeps the transport as it was when every slot is empty", () => {
      liveSet = setupPlaybackLiveSet({ is_playing: 0 });
      registerClipSlot(1, 0, false);
      registerClipSlot(2, 0, false);

      const result = playback({
        action: "play-session-clips",
        path: "t1/s0,t2/s0",
      });

      expect(result.playing).toBe(false);
      expect(result.clip).toStrictEqual([
        { path: "t1/s0", ok: false, detail: "no clip to play" },
        { path: "t2/s0", ok: false, detail: "no clip to play" },
      ]);
    });

    // A group track's slot holds no clip but launches its children's clips.
    it("fires a group track's slot, which holds no clip but controls others", () => {
      const path = livePath.track(0).clipSlot(0);
      const group = registerMockObject(path, {
        path,
        properties: { has_clip: 0, controls_other_clips: 1 },
      });

      // No clip object under it, as in Live: the entry has a path and no id.
      mockNonExistentObjects();

      const result = playback({
        action: "play-session-clips",
        path: "t0/s0",
      });

      expect(group.call).toHaveBeenCalledWith("fire");
      expect(result).toStrictEqual({ playing: true, clip: { path: "t0/s0" } });
    });

    it("skips a slot with no clip that controls no others", () => {
      const path = livePath.track(0).clipSlot(0);
      const slot = registerMockObject(path, {
        path,
        properties: { has_clip: 0, controls_other_clips: 0 },
      });

      expect(() =>
        playback({ action: "play-session-clips", path: "t0/s0" }),
      ).toThrow("no clip to play");
      expect(slot.call).not.toHaveBeenCalledWith("fire");
    });

    it("still stops its track on stop-session-clips", () => {
      const track = registerMockObject(livePath.track(1), {
        path: livePath.track(1),
      });

      registerClipSlot(1, 0, false);

      const result = playback({
        action: "stop-session-clips",
        path: "t1/s0",
      });

      expect(track.call).toHaveBeenCalledWith("stop_all_clips");
      // The mock reports a clip in every slot, so the entry carries an id here.
      expect(result.clip).toStrictEqual({
        id: "live_set/tracks/1/clip_slots/0/clip",
        path: "t1/s0",
      });
    });
  });
});
