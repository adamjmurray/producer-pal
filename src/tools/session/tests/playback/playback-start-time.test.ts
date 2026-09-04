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

  it("reports the playhead separately from the start position", () => {
    // The two are independent, so the result carries both.
    liveSet = setupPlaybackLiveSet({
      is_playing: 1,
      current_song_time: 10,
      start_time: 32,
    });

    const result = playback({
      action: "update-arrangement",
      startTime: "9|1",
    });

    expect(result.currentTime).toBe("3|3");
    expect(result.startTime).toBe("9|1");
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

  it("omits the start position when the call didn't set it", () => {
    const result = playback({ action: "update-arrangement", loop: true });

    expect(liveSet.set).not.toHaveBeenCalledWith(
      "start_time",
      expect.anything(),
    );
    expect(result.startTime).toBeUndefined();
  });

  it("omits the start position for session actions", () => {
    const result = playback({ action: "stop-all-session-clips" });

    expect(result.startTime).toBeUndefined();
  });

  it("reports the start position play-arrangement reset to the song start", () => {
    // No startTime given, so play-arrangement plays from bar 1 — and says so.
    const result = playback({ action: "play-arrangement" });

    expectLiveSetProperty(liveSet, "start_time", 0);
    expect(result.startTime).toBe("1|1");
  });
});
