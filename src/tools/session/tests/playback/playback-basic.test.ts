// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { LiveAPI } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { playback } from "#src/tools/session/playback.ts";
import {
  expectAllClipSlotsFired,
  expectLiveSetProperty,
  expectLoopLengthNotWritten,
  expectLoopOrderWarning,
  expectQuantizationFixApplied,
  setupClipWithNoTrackPath,
  setupDefaultTimeSignature,
  setupMultiClipMocks,
  setupPlaybackLiveSet,
} from "./playback-test-helpers.ts";

describe("transport", () => {
  let liveSet: RegisteredMockObject;

  beforeEach(() => {
    liveSet = setupDefaultTimeSignature();
  });

  it("should throw an error when action is missing", () => {
    expect(() => playback({})).toThrow("playback failed: action is required");
  });

  it("should throw an error for unknown action", () => {
    expect(() => playback({ action: "invalid-action" })).toThrow(
      "playback failed: unknown action",
    );
  });

  it("should handle play-arrangement action", () => {
    liveSet = setupPlaybackLiveSet();

    const result = playback({
      action: "play-arrangement",
      startTime: "5|1",
    });

    expect(liveSet.call).toHaveBeenCalledWith("start_playing");
    expectLiveSetProperty(liveSet, "start_time", 16); // bar 5 = 16 beats in 4/4
    expect(result).toStrictEqual({
      playing: true,
      currentTime: "5|1",
    });
  });

  it("should handle update-arrangement action with loop settings", () => {
    // loop_start/loop_length mirror the values this call sets (the mock's set()
    // doesn't feed back into get), so the reported loop reflects actual state.
    liveSet = setupPlaybackLiveSet({
      is_playing: 1,
      current_song_time: 10,
      loop_start: 8, // bar 3
      loop_length: 16, // bars 3–7
    });

    const result = playback({
      action: "update-arrangement",
      loop: true,
      loopStart: "3|1",
      loopEnd: "7|1",
    });

    expectLiveSetProperty(liveSet, "loop", true);
    expectLiveSetProperty(liveSet, "loop_start", 8); // bar 3 = 8 beats
    expectLiveSetProperty(liveSet, "loop_length", 16); // 24 - 8 = 16 beats
    // Only loop settings should be called - no back_to_arranger calls for update-arrangement
    expect(liveSet.set).toHaveBeenCalledTimes(3); // 3 for loop/start/length only

    expect(result).toStrictEqual({
      playing: true,
      currentTime: "3|3",
      arrangementLoop: {
        start: "3|1",
        end: "7|1",
      },
    });
  });

  it("skips a non-positive loop length (loopEnd at/before loopStart) and warns", () => {
    // Regression (#26): loopStart and loopEnd are independent, so loopEnd before
    // loopStart produced a negative loop_length written straight to the Live Set.
    liveSet = setupPlaybackLiveSet({ is_playing: 0, current_song_time: 0 });

    playback({
      action: "update-arrangement",
      loop: true,
      loopStart: "7|1", // beat 24
      loopEnd: "3|1", // beat 8 → length 8 - 24 = -16
    });

    expectLoopLengthNotWritten(liveSet);
    expectLoopOrderWarning();
  });

  it("skips a zero-length loop (loopEnd exactly at loopStart) and warns", () => {
    // Boundary of the non-positive guard (<= 0, not < 0): loopEnd landing
    // exactly on loopStart is a length of 0, which is just as invalid in Live
    // as a negative length — it must warn and skip, not write loop_length: 0.
    liveSet = setupPlaybackLiveSet({ is_playing: 0, current_song_time: 0 });

    playback({
      action: "update-arrangement",
      loop: true,
      loopStart: "3|1", // beat 8
      loopEnd: "3|1", // beat 8 → length 8 - 8 = 0
    });

    expectLoopLengthNotWritten(liveSet);
    expectLoopOrderWarning();
  });

  it("reports the actual loop bounds, not the rejected loopEnd, when loop length is non-positive", () => {
    // The Live Set's real loop is bars 1–2. A loopEnd at/before loopStart is
    // rejected (loop_length not written), so the response must echo the
    // unchanged actual loop — not the rejected request. Before the fix it
    // returned the rejected loopEnd, disagreeing with Live.
    liveSet = setupPlaybackLiveSet({
      loop: 1,
      loop_start: 0,
      loop_length: 4,
      is_playing: 0,
      current_song_time: 0,
    });

    const result = playback({
      action: "update-arrangement",
      loopStart: "2|1", // beat 4
      loopEnd: "1|1", // beat 0 → length 0 - 4 = -4, rejected
    });

    expectLoopLengthNotWritten(liveSet);
    expect(result.arrangementLoop).toStrictEqual({
      start: "1|1",
      end: "2|1",
    });
  });

  it("should handle different time signatures", () => {
    liveSet = setupPlaybackLiveSet({
      signature_numerator: 3,
      signature_denominator: 4,
      loop_length: 3,
    });

    const result = playback({
      action: "play-arrangement",
      startTime: "3|1",
    });

    expectLiveSetProperty(liveSet, "start_time", 6); // bar 3 = 6 beats in 3/4
    expect(result.currentTime).toBe("3|1");
    // Loop is off, so no arrangementLoop property
    expect(result.arrangementLoop).toBeUndefined();
  });

  it("should handle play-session-clips action with single clip", () => {
    liveSet = setupPlaybackLiveSet({ current_song_time: 5 });
    registerMockObject("clip1", {
      path: livePath.track(0).clipSlot(0).clip(),
    });
    const clipSlot0 = registerMockObject(livePath.track(0).clipSlot(0), {
      path: livePath.track(0).clipSlot(0),
    });

    const result = playback({
      action: "play-session-clips",
      id: "clip1",
    });

    expect(clipSlot0.call).toHaveBeenCalledWith("fire");
    expect(clipSlot0.call).toHaveBeenCalledTimes(1);

    // Verify NO quantization fix for single clip (stop/start should NOT be called)
    expect(liveSet.call).not.toHaveBeenCalledWith("stop_playing");
    expect(liveSet.call).not.toHaveBeenCalledWith("start_playing");

    expect(result).toStrictEqual({
      playing: true,
      currentTime: "2|2",
    });
  });

  // A permanent alias, not a migration: models reach for the plural on their
  // own, so it keeps working.
  it("still fires a clip named by the ids alias", () => {
    setupPlaybackLiveSet({ current_song_time: 5 });
    registerMockObject("clip1", {
      path: livePath.track(0).clipSlot(0).clip(),
    });
    const clipSlot0 = registerMockObject(livePath.track(0).clipSlot(0), {
      path: livePath.track(0).clipSlot(0),
    });

    playback({ action: "play-session-clips", ids: "clip1" });

    expect(clipSlot0.call).toHaveBeenCalledWith("fire");
  });

  it("should handle play-session-clips action with multiple clips", () => {
    const { liveSet: ls, clipSlots } = setupMultiClipMocks();

    liveSet = ls;

    playback({
      action: "play-session-clips",
      id: "clip1,clip2,clip3",
    });

    expectAllClipSlotsFired(clipSlots);

    // Verify quantization fix: stop_playing and start_playing should be called for multiple clips
    expectQuantizationFixApplied(liveSet);
  });

  it("should handle whitespace in ids", () => {
    const { liveSet: ls, clipSlots } = setupMultiClipMocks();

    liveSet = ls;

    playback({
      action: "play-session-clips",
      id: "clip1, clip2 , clip3",
    });

    // Should fire all 3 clips despite whitespace
    expectAllClipSlotsFired(clipSlots);

    // Verify quantization fix is applied for multiple clips
    expectQuantizationFixApplied(liveSet);
  });

  it("should throw error when required parameters are missing for play-session-clips", () => {
    expect(() => playback({ action: "play-session-clips" })).toThrow(
      'playback failed: id or path is required for action "play-session-clips"',
    );
  });

  // Skipping the only id leaves nothing to fire, so the call has no target.
  // Reporting playing: true here claimed a launch that never happened.
  it("refuses play-session-clips when no id names a clip", () => {
    mockNonExistentObjects();

    expect(() =>
      playback({ action: "play-session-clips", id: "nonexistent_clip" }),
    ).toThrow(
      'playback failed: id "nonexistent_clip" named no clip for action "play-session-clips"',
    );
    expect(outlet).toHaveBeenCalledWith(
      1,
      'playback: id "nonexistent_clip" does not exist',
    );
  });

  it("should throw error when clip slot doesn't exist for play-session-clips", () => {
    registerMockObject("clip1", {
      path: livePath.track(99).clipSlot(0).clip(),
    });
    // Clip slot at tracks 99 is NOT registered — falls through to shared mock
    mockNonExistentObjects();

    expect(() =>
      playback({
        action: "play-session-clips",
        id: "clip1",
      }),
    ).toThrow(
      "playback play-session-clips action failed: no clip slot at t99/s0",
    );
  });

  it("should handle play-scene action", () => {
    liveSet = setupPlaybackLiveSet({ current_song_time: 5 });

    const scene0 = registerMockObject(livePath.scene(0), {
      path: livePath.scene(0),
    });

    const result = playback({
      action: "play-scene",
      sceneIndex: 0,
    });

    expect(scene0.call).toHaveBeenCalledWith("fire");
    expect(result).toStrictEqual({
      playing: true,
      currentTime: "2|2",
    });
  });

  it("should throw an error when required parameters are missing for play-scene", () => {
    expect(() => playback({ action: "play-scene" })).toThrow(
      'playback failed: sceneIndex, path "s<scene>", or a scene id is required for action "play-scene"',
    );
  });

  it("should throw an error when scene doesn't exist for play-scene", () => {
    // Spy on LiveAPI.prototype.exists and make it return false
    const existsSpy = vi
      .spyOn(LiveAPI.prototype, "exists")
      .mockReturnValue(false);

    expect(() => playback({ action: "play-scene", sceneIndex: 999 })).toThrow(
      "playback failed: scene at index 999 does not exist",
    );

    existsSpy.mockRestore();
  });

  it("should handle stop-session-clips action with single clip", () => {
    liveSet = setupPlaybackLiveSet({ is_playing: 1, current_song_time: 5 });
    registerMockObject("clip1", {
      path: livePath.track(0).clipSlot(0).clip(),
    });
    const track0 = registerMockObject(livePath.track(0), {
      path: livePath.track(0),
    });

    const result = playback({
      action: "stop-session-clips",
      id: "clip1",
    });

    expect(track0.call).toHaveBeenCalledWith("stop_all_clips");
    expect(result).toStrictEqual({
      playing: true, // transport/arrangement can still be playing
      currentTime: "2|2",
    });
  });

  it("should handle stop-session-clips action with multiple clips", () => {
    liveSet = setupPlaybackLiveSet({ is_playing: 1, current_song_time: 5 });
    registerMockObject("clip1", {
      path: livePath.track(0).clipSlot(0).clip(),
    });
    registerMockObject("clip2", {
      path: livePath.track(1).clipSlot(1).clip(),
    });
    registerMockObject("clip3", {
      path: livePath.track(2).clipSlot(2).clip(),
    });
    const track0 = registerMockObject(livePath.track(0), {
      path: livePath.track(0),
    });
    const track1 = registerMockObject(livePath.track(1), {
      path: livePath.track(1),
    });
    const track2 = registerMockObject(livePath.track(2), {
      path: livePath.track(2),
    });

    playback({
      action: "stop-session-clips",
      id: "clip1,clip2,clip3",
    });

    expect(track0.call).toHaveBeenCalledWith("stop_all_clips");
    expect(track1.call).toHaveBeenCalledWith("stop_all_clips");
    expect(track2.call).toHaveBeenCalledWith("stop_all_clips");
  });

  it("should throw an error when required parameters are missing for stop-session-clips", () => {
    expect(() => playback({ action: "stop-session-clips" })).toThrow(
      'playback failed: id or path is required for action "stop-session-clips"',
    );
  });

  it("refuses stop-session-clips when no id names a clip", () => {
    mockNonExistentObjects();

    expect(() =>
      playback({ action: "stop-session-clips", id: "nonexistent_clip" }),
    ).toThrow(
      'playback failed: id "nonexistent_clip" named no clip for action "stop-session-clips"',
    );
    expect(outlet).toHaveBeenCalledWith(
      1,
      'playback: id "nonexistent_clip" does not exist',
    );
  });

  it("should throw error when clip has no trackIndex for play-session-clips", () => {
    setupClipWithNoTrackPath("clip1");

    expect(() =>
      playback({
        action: "play-session-clips",
        id: "clip1",
      }),
    ).toThrow(
      "playback play-session-clips action failed: could not determine track/scene for clipId=clip1",
    );
  });

  it("should throw error when clip has no trackIndex for stop-session-clips", () => {
    setupClipWithNoTrackPath("clip1");

    expect(() =>
      playback({
        action: "stop-session-clips",
        id: "clip1",
      }),
    ).toThrow(
      "playback stop-session-clips action failed: could not determine track/scene for clipId=clip1",
    );
  });

  it("should throw error when track does not exist for stop-session-clips", () => {
    registerMockObject("clip1", {
      path: livePath.track(99).clipSlot(0).clip(),
    });
    // Track at index 99 is NOT registered — make unregistered objects non-existent
    mockNonExistentObjects();

    expect(() =>
      playback({
        action: "stop-session-clips",
        id: "clip1",
      }),
    ).toThrow(
      "playback stop-session-clips action failed: track at index 99 does not exist",
    );
  });

  it("should handle stop-all-clips action", () => {
    liveSet = setupPlaybackLiveSet({ is_playing: 1, current_song_time: 5 });

    const result = playback({ action: "stop-all-session-clips" });

    expect(liveSet.call).toHaveBeenCalledWith("stop_all_clips");
    expect(result).toStrictEqual({
      playing: true, // transport/arrangement can still be playing
      currentTime: "2|2",
    });
  });

  it("should handle stop action", () => {
    liveSet = setupPlaybackLiveSet();

    const result = playback({ action: "stop" });

    expect(liveSet.call).toHaveBeenCalledWith("stop_playing");
    expectLiveSetProperty(liveSet, "start_time", 0);
    expect(result).toStrictEqual({
      playing: false,
      currentTime: "1|1",
    });
  });

  it("should handle loop end calculation correctly", () => {
    liveSet = setupPlaybackLiveSet({ loop_start: 8, loop_length: 16 });

    const result = playback({
      action: "update-arrangement",
      loopEnd: "9|1",
    });

    // loopEnd 9|1 = 32 beats, loopStart is 8 beats, so length should be 24
    expectLiveSetProperty(liveSet, "loop_length", 24);
    // Loop is off in the mock, so no arrangementLoop property
    expect(result.arrangementLoop).toBeUndefined();
  });

  it("should handle 6/8 time signature conversions", () => {
    liveSet = setupPlaybackLiveSet({
      signature_numerator: 6,
      signature_denominator: 8,
      loop_length: 3,
    });

    const result = playback({
      action: "play-arrangement",
      startTime: "2|1",
      loopStart: "1|1",
      loopEnd: "3|1",
    });

    // In 6/8, bar 2 = 3 Ableton beats (6 musical beats * 4/8)
    expectLiveSetProperty(liveSet, "start_time", 3);
    expectLiveSetProperty(liveSet, "loop_start", 0);
    expectLiveSetProperty(liveSet, "loop_length", 6); // 2 bars = 6 Ableton beats

    expect(result.currentTime).toBe("2|1");
    // Loop is off in the mock (loop: 0), so no arrangementLoop property
    expect(result.arrangementLoop).toBeUndefined();
  });

  it("should handle play-arrangement action without startTime (defaults to 0)", () => {
    liveSet = setupPlaybackLiveSet();

    const result = playback({
      action: "play-arrangement",
      // no startTime provided
    });

    expect(liveSet.call).toHaveBeenCalledWith("start_playing");
    expectLiveSetProperty(liveSet, "start_time", 0);
    expect(result.currentTime).toBe("1|1");
  });

  it("should throw error when both id and slots are provided", () => {
    expect(() =>
      playback({
        action: "play-session-clips",
        id: "clip1",
        slots: "0/0",
      }),
    ).toThrow("playback failed: id and slots are mutually exclusive");
  });

  it("should handle play-session-clips via slots with single slot", () => {
    liveSet = setupPlaybackLiveSet({ current_song_time: 5 });
    const clipSlot = registerMockObject(livePath.track(0).clipSlot(1), {
      path: livePath.track(0).clipSlot(1),
    });

    const result = playback({
      action: "play-session-clips",
      slots: "0/1",
    });

    expect(clipSlot.call).toHaveBeenCalledWith("fire");
    expect(clipSlot.call).toHaveBeenCalledTimes(1);
    // No quantization fix for single clip
    expect(liveSet.call).not.toHaveBeenCalledWith("stop_playing");
    expect(result).toStrictEqual({
      playing: true,
      currentTime: "2|2",
    });
  });

  it("should handle play-session-clips via slots with multiple slots", () => {
    liveSet = setupPlaybackLiveSet({ current_song_time: 5 });
    const clipSlot0 = registerMockObject(livePath.track(0).clipSlot(0), {
      path: livePath.track(0).clipSlot(0),
    });
    const clipSlot1 = registerMockObject(livePath.track(1).clipSlot(1), {
      path: livePath.track(1).clipSlot(1),
    });

    playback({
      action: "play-session-clips",
      slots: "0/0,1/1",
    });

    expect(clipSlot0.call).toHaveBeenCalledWith("fire");
    expect(clipSlot1.call).toHaveBeenCalledWith("fire");
    // Quantization fix applied for multiple clips
    expectQuantizationFixApplied(liveSet);
  });

  it("should handle stop-session-clips via slots", () => {
    liveSet = setupPlaybackLiveSet({ is_playing: 1, current_song_time: 5 });
    const track0 = registerMockObject(livePath.track(0), {
      path: livePath.track(0),
    });

    const result = playback({
      action: "stop-session-clips",
      slots: "0/0",
    });

    expect(track0.call).toHaveBeenCalledWith("stop_all_clips");
    expect(result).toStrictEqual({
      playing: true,
      currentTime: "2|2",
    });
  });

  it("should deduplicate tracks when stopping via slots on same track", () => {
    liveSet = setupPlaybackLiveSet({ is_playing: 1, current_song_time: 5 });
    const track0 = registerMockObject(livePath.track(0), {
      path: livePath.track(0),
    });

    playback({
      action: "stop-session-clips",
      slots: "0/0,0/1",
    });

    expect(track0.call).toHaveBeenCalledWith("stop_all_clips");
    expect(track0.call).toHaveBeenCalledTimes(1);
  });

  it("should throw error when clip slot does not exist for play-session-clips via slots", () => {
    liveSet = setupPlaybackLiveSet();
    mockNonExistentObjects();

    expect(() =>
      playback({
        action: "play-session-clips",
        slots: "99/0",
      }),
    ).toThrow(
      "playback play-session-clips action failed: no clip slot at t99/s0",
    );
  });

  it("should throw error when track does not exist for stop-session-clips via slots", () => {
    liveSet = setupPlaybackLiveSet();
    mockNonExistentObjects();

    expect(() =>
      playback({
        action: "stop-session-clips",
        slots: "99/0",
      }),
    ).toThrow(
      "playback stop-session-clips action failed: track at index 99 does not exist",
    );
  });
});
