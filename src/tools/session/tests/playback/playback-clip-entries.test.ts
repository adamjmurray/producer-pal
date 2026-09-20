// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
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

  it("keeps a bad id's slot and fires the rest", () => {
    const slot = mockClipInSlot("clip2", 1, 0);

    mockNonExistentObjects();

    const result = playback({
      action: "play-session-clips",
      id: "999999,clip2",
    });

    expect(slot.call).toHaveBeenCalledWith("fire");
    expect(result.clips).toStrictEqual([
      { id: "999999", ok: false, reason: 'id "999999" does not exist' },
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

    expect(result.clips).toStrictEqual([
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
    expect(result.clips).toStrictEqual([
      { id: "clip1", path: "t0/s0" },
      {
        id: "clip1",
        path: "t0/s0",
        reason: "already named as id clip1 earlier in this call",
      },
    ]);
  });

  it("names a missing slot back in the caller's own spelling", () => {
    mockClipInSlot("clip1", 0, 0);
    mockNonExistentObjects();

    const result = playback({
      action: "play-session-clips",
      slots: "0/0,99/0",
    });

    expect(result.clips).toStrictEqual([
      { id: "clip1", path: "t0/s0" },
      { path: "99/0", ok: false, reason: "no clip slot at t99/s0" },
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
    expect(result.clips).toStrictEqual([
      { id: "clip1", path: "t0/s0" },
      { id: "999999", ok: false, reason: 'id "999999" does not exist' },
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
    expect(result.clips).toHaveLength(2);
  });
});
