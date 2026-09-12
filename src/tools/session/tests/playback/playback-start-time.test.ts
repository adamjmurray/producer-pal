// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { type RegisteredMockObject } from "#src/test/mocks/mock-registry.ts";
import { playback } from "#src/tools/session/playback.ts";
import {
  expectLiveSetProperty,
  setupPlaybackLiveSet,
} from "./playback-test-helpers.ts";

describe("playback - arrangement start position", () => {
  let liveSet: RegisteredMockObject;

  beforeEach(() => {
    liveSet = setupPlaybackLiveSet();
  });

  it("reports the start position update-arrangement set", () => {
    // start_time mirrors the value this call sets (the mock's set() doesn't
    // feed back into get), so the reported startTime is the actual state.
    liveSet = setupPlaybackLiveSet({ start_time: 32 });

    const result = playback({
      action: "update-arrangement",
      startTime: "9|1",
    });

    expectLiveSetProperty(liveSet, "start_time", 32); // bar 9 = 32 beats in 4/4
    expect(result.startTime).toBe("9|1");
  });

  it("reports the Live Set's start position, not the requested one", () => {
    // Live is free to snap or clamp what we wrote, so the reported value is
    // read back off the Live Set. Here it answers bar 4 for a request of bar 9.
    liveSet = setupPlaybackLiveSet({ start_time: 12 });

    const result = playback({
      action: "update-arrangement",
      startTime: "9|1",
    });

    expectLiveSetProperty(liveSet, "start_time", 32);
    expect(result.startTime).toBe("4|1");
  });

  it("reports the start position, never the playhead", () => {
    // Setting the start position leaves the playhead alone, so the two
    // disagree — and the playhead is the one that can't be reported. Live
    // updates it asynchronously, so a read in this same request would answer
    // wherever it was before the call.
    // The playhead sits at bar 3+ and the start position at bar 9. Nothing
    // reads current_song_time any more — that's the point of the case.
    liveSet = setupPlaybackLiveSet({
      is_playing: 1,
      current_song_time: 10,
      start_time: 32,
    });

    const result = playback({
      action: "update-arrangement",
      startTime: "9|1",
    });

    expect(result.startTime).toBe("9|1");
    expect(result).not.toHaveProperty("currentTime");
  });

  it("uses the song time signature for the start position", () => {
    liveSet = setupPlaybackLiveSet({
      signature_numerator: 3,
      signature_denominator: 4,
      start_time: 9,
    });

    const result = playback({
      action: "update-arrangement",
      startTime: "3|1",
    });

    expectLiveSetProperty(liveSet, "start_time", 6); // bar 3 = 6 beats in 3/4
    // The Live Set answers 9 beats, which is bar 4 in 3/4, not the bar 3 asked
    // for: the reported value is read back, not echoed, and uses the meter.
    expect(result.startTime).toBe("4|1");
  });

  it("omits the start position when update-arrangement only set the loop", () => {
    // Nothing moved it, so there's nothing to report.
    liveSet = setupPlaybackLiveSet({ start_time: 32 });

    const result = playback({ action: "update-arrangement", loop: true });

    expect(liveSet.set).not.toHaveBeenCalledWith(
      "start_time",
      expect.anything(),
    );
    expect(result.startTime).toBeUndefined();
  });

  it("omits the start position for session actions", () => {
    liveSet = setupPlaybackLiveSet({ start_time: 32 });

    const result = playback({ action: "stop-all-session-clips" });

    expect(result.startTime).toBeUndefined();
  });

  it("puts the start position back after stopping, and says nothing", () => {
    // Live's second press of stop sends the start position to the top, so
    // stop writes back what it read. The caller's position outlives the
    // transport, and a call that changed nothing reports nothing.
    liveSet = setupPlaybackLiveSet({ start_time: 32 });

    const result = playback({ action: "stop" });

    expectLiveSetProperty(liveSet, "start_time", 32);
    expect(result.startTime).toBeUndefined();
  });

  it("reports where play-arrangement began without being told", () => {
    // The start position governs where playback starts, and the caller may
    // never have read it, so play-arrangement reports it either way.
    liveSet = setupPlaybackLiveSet({ start_time: 32 });

    const result = playback({ action: "play-arrangement" });

    expect(liveSet.set).not.toHaveBeenCalledWith(
      "start_time",
      expect.anything(),
    );
    expect(result.startTime).toBe("9|1");
  });

  it("parks the start position on stop, for the next play", () => {
    liveSet = setupPlaybackLiveSet({ start_time: 32 });

    const result = playback({ action: "stop", startTime: "9|1" });

    expectLiveSetProperty(liveSet, "start_time", 32);
    expect(result.startTime).toBe("9|1");
  });
});
