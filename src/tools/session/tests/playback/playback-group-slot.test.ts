// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  mockNonExistentObjects,
  registerMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { playback } from "#src/tools/session/playback.ts";
import { setupPlaybackLiveSet } from "./playback-test-helpers.ts";

/** One track of a test Set, in track order; `id` is also its group's key. */
interface TrackSpec {
  id: string;
  /** The group it sits directly in */
  group?: string;
  foldable?: boolean;
  /** A clip playing on it (-1 when none) */
  playing?: number;
  /** A launch or stop queued on it (-1 when none) */
  fired?: number;
  /** The clip each scene holds, by scene index */
  clips?: Record<number, string>;
  /** Whether its empty slots have a stop button (default true) */
  stopButton?: boolean;
}

const SCENE = 0;

/**
 * Register tracks `t0`... with their slots in the scene under test, and each
 * group track's own slot. Anything past the last track doesn't exist.
 * @param layout - The tracks, in track order
 * @returns Each track's mock, and its slot's, by index
 */
function setUpTracks(layout: TrackSpec[]): {
  tracks: RegisteredMockObject[];
  slots: RegisteredMockObject[];
} {
  mockNonExistentObjects();

  const tracks: RegisteredMockObject[] = [];
  const slots: RegisteredMockObject[] = [];

  for (const [index, spec] of layout.entries()) {
    tracks.push(
      registerMockObject(spec.id, {
        path: livePath.track(index),
        type: "Track",
        properties: {
          group_track: ["id", spec.group ?? 0],
          is_foldable: spec.foldable === true ? 1 : 0,
          playing_slot_index: spec.playing ?? -1,
          fired_slot_index: spec.fired ?? -1,
        },
      }),
    );

    const slotPath = livePath.track(index).clipSlot(SCENE);
    const clipId = spec.clips?.[SCENE];

    if (clipId != null) {
      registerMockObject(clipId, { path: slotPath.clip() });
    }

    slots.push(
      registerMockObject(slotPath, {
        path: slotPath,
        properties: {
          has_clip: clipId == null ? 0 : 1,
          // A group's slot controls the clips of its members.
          controls_other_clips: spec.foldable === true ? 1 : 0,
          has_stop_button: spec.stopButton === false ? 0 : 1,
        },
      }),
    );
  }

  return { tracks, slots };
}

// A group track's slot fires the slot of every track inside it, so its entry
// says what that did to them: read before the fire, from the tracks themselves.
describe("playback - firing a group track's slot", () => {
  beforeEach(() => {
    setupPlaybackLiveSet();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("names the clips it launches and the tracks it stops", () => {
    const { slots } = setUpTracks([
      { id: "group", foldable: true },
      { id: "a", group: "group", clips: { [SCENE]: "clipA" } },
      { id: "b", group: "group", playing: 2 },
    ]);

    const result = playback({
      action: "play-session-clips",
      path: "t0/s0",
    });

    expect(slots[0]?.call).toHaveBeenCalledWith("fire");
    expect(result.clip).toStrictEqual({
      path: "t0/s0",
      detail:
        "launched t1/s0 (id clipA); stopped t2 (id b), which has no clip in s0",
    });
  });

  it("counts a track queued to launch as one it stops", () => {
    setUpTracks([
      { id: "group", foldable: true },
      { id: "a", group: "group", fired: 3 },
    ]);

    const result = playback({ action: "play-session-clips", path: "t0/s0" });

    expect(result.clip).toStrictEqual({
      path: "t0/s0",
      detail: "stopped t1 (id a), which has no clip in s0",
    });
  });

  it("says which several tracks it stops, each with its id", () => {
    setUpTracks([
      { id: "group", foldable: true },
      { id: "a", group: "group", playing: 0 },
      { id: "b", group: "group", fired: 1 },
    ]);

    const result = playback({ action: "play-session-clips", path: "t0/s0" });

    expect(result.clip).toStrictEqual({
      path: "t0/s0",
      detail: "stopped t1 (id a), t2 (id b), which have no clip in s0",
    });
  });

  it("says nothing of a track the fire leaves alone", () => {
    setUpTracks([
      { id: "group", foldable: true },
      { id: "a", group: "group", clips: { [SCENE]: "clipA" } },
      // Nothing to stop: it isn't playing.
      { id: "b", group: "group" },
      // Playing, but an empty slot with no stop button does nothing.
      { id: "c", group: "group", playing: 0, stopButton: false },
    ]);

    const result = playback({ action: "play-session-clips", path: "t0/s0" });

    expect(result.clip).toStrictEqual({
      path: "t0/s0",
      detail: "launched t1/s0 (id clipA)",
    });
  });

  it("adds no detail when nothing inside is affected", () => {
    setUpTracks([
      { id: "group", foldable: true },
      { id: "a", group: "group" },
      { id: "b", group: "group", playing: 0, stopButton: false },
    ]);

    const result = playback({ action: "play-session-clips", path: "t0/s0" });

    expect(result.clip).toStrictEqual({ path: "t0/s0" });
  });

  it("reaches the tracks of a nested group, and lists no group itself", () => {
    setUpTracks([
      { id: "outer", foldable: true },
      { id: "inner", group: "outer", foldable: true, playing: 0 },
      { id: "a", group: "inner", clips: { [SCENE]: "clipA" } },
      { id: "b", group: "inner", playing: 1 },
      { id: "c", group: "outer", clips: { [SCENE]: "clipC" } },
      // Outside the outer group
      { id: "d", playing: 0 },
    ]);

    const result = playback({ action: "play-session-clips", path: "t0/s0" });

    expect(result.clip).toStrictEqual({
      path: "t0/s0",
      detail:
        "launched t2/s0 (id clipA), t4/s0 (id clipC); stopped t3 (id b), which has no clip in s0",
    });
  });

  it("still skips a group slot with no clips under it in that scene", () => {
    const { slots } = setUpTracks([
      { id: "group", foldable: true },
      { id: "a", group: "group" },
    ]);

    // Every member's slot in this scene is empty, so the group controls none.
    (slots[0] as RegisteredMockObject).properties.controls_other_clips = 0;

    expect(() =>
      playback({ action: "play-session-clips", path: "t0/s0" }),
    ).toThrow("no clip to play");
    expect(slots[0]?.call).not.toHaveBeenCalledWith("fire");
  });

  it("gives an ordinary track's slot no detail", () => {
    setUpTracks([{ id: "a", clips: { [SCENE]: "clipA" } }]);

    const result = playback({ action: "play-session-clips", path: "t0/s0" });

    expect(result.clip).toStrictEqual({ id: "clipA", path: "t0/s0" });
  });
});

describe("playback - stopping a group track's slot", () => {
  beforeEach(() => {
    setupPlaybackLiveSet();
  });

  it("names the tracks inside that were playing or queued", () => {
    const { tracks } = setUpTracks([
      { id: "group", foldable: true },
      { id: "a", group: "group", playing: 0 },
      { id: "idle", group: "group" },
      { id: "inner", group: "group", foldable: true, playing: 0 },
      { id: "b", group: "inner", fired: 2 },
    ]);

    const result = playback({ action: "stop-session-clips", path: "t0/s0" });

    expect(tracks[0]?.call).toHaveBeenCalledExactlyOnceWith("stop_all_clips");
    expect(result.clip).toStrictEqual({
      path: "t0/s0",
      detail: "stopped the tracks in this group track: t1 (id a), t4 (id b)",
    });
  });

  it("says the track when only one was playing", () => {
    setUpTracks([
      { id: "group", foldable: true },
      { id: "a", group: "group", playing: 1 },
    ]);

    const result = playback({ action: "stop-session-clips", path: "t0/s0" });

    expect(result.clip).toStrictEqual({
      path: "t0/s0",
      detail: "stopped the track in this group track: t1 (id a)",
    });
  });

  it("adds no detail when none of its tracks was playing", () => {
    const { tracks } = setUpTracks([
      { id: "group", foldable: true },
      { id: "a", group: "group" },
    ]);

    const result = playback({ action: "stop-session-clips", path: "t0/s0" });

    expect(tracks[0]?.call).toHaveBeenCalledWith("stop_all_clips");
    expect(result.clip).toStrictEqual({ path: "t0/s0" });
  });

  it("gives a member track's own slot no detail", () => {
    setUpTracks([
      { id: "group", foldable: true },
      { id: "a", group: "group", playing: 0 },
    ]);

    const result = playback({ action: "stop-session-clips", path: "t1/s0" });

    expect(result.clip).toStrictEqual({ path: "t1/s0" });
  });

  it("names the group once when two of its slots are stopped", () => {
    const { tracks } = setUpTracks([
      { id: "group", foldable: true },
      { id: "a", group: "group", playing: 0 },
    ]);

    // The second slot is the same group's, in another scene.
    registerMockObject("slot1", {
      path: livePath.track(0).clipSlot(1),
      properties: { has_clip: 0 },
    });

    const result = playback({
      action: "stop-session-clips",
      path: "t0/s0,t0/s1",
    });

    expect(tracks[0]?.call).toHaveBeenCalledExactlyOnceWith("stop_all_clips");
    expect(result.clip).toStrictEqual([
      {
        path: "t0/s0",
        detail: "stopped the track in this group track: t1 (id a)",
      },
      { path: "t0/s1" },
    ]);
  });
});

// Live changed before a later throw, so the entry says only what is true.
describe("playback - a failure around a group track's slot", () => {
  let liveSet: RegisteredMockObject;

  beforeEach(() => {
    liveSet = setupPlaybackLiveSet();
  });

  it("claims no launch when the fire itself throws", () => {
    const { slots } = setUpTracks([
      { id: "group", foldable: true },
      { id: "a", group: "group", clips: { [SCENE]: "clipA" } },
      { id: "solo", clips: { [SCENE]: "clipS" } },
    ]);

    slots[0]?.call.mockImplementation(() => {
      throw new Error("Live refused fire");
    });

    const result = playback({
      action: "play-session-clips",
      path: "t0/s0,t2/s0",
    });

    expect(result.clip).toStrictEqual([
      { path: "t0/s0", ok: false, detail: "Live refused fire" },
      { id: "clipS", path: "t2/s0" },
    ]);
  });

  it("keeps the fire in the error when the transport restart then throws", () => {
    const { slots } = setUpTracks([
      { id: "group", foldable: true },
      { id: "a", group: "group", clips: { [SCENE]: "clipA" } },
      { id: "solo", clips: { [SCENE]: "clipS" } },
    ]);

    liveSet.call.mockImplementation((name: string) => {
      if (name === "start_playing") {
        throw new Error("Live refused start_playing");
      }
    });

    expect(() =>
      playback({ action: "play-session-clips", path: "t0/s0,t2/s0" }),
    ).toThrow(
      "Live refused start_playing; already changed: session clips fired, transport stopped",
    );
    expect(slots[0]?.call).toHaveBeenCalledWith("fire");
  });

  it("claims no stop when the group's stop throws", () => {
    const { tracks } = setUpTracks([
      { id: "group", foldable: true },
      { id: "a", group: "group", playing: 0 },
      { id: "solo" },
    ]);

    tracks[0]?.call.mockImplementation(() => {
      throw new Error("Live refused stop_all_clips");
    });

    const result = playback({
      action: "stop-session-clips",
      path: "t0/s0,t2/s0",
    });

    expect(result.clip).toStrictEqual([
      { path: "t0/s0", ok: false, detail: "Live refused stop_all_clips" },
      { path: "t2/s0" },
    ]);
  });
});
