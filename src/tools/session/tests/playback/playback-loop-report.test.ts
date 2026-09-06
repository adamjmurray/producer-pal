// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { playback } from "#src/tools/session/playback.ts";
import {
  expectLiveSetProperty,
  expectLoopNotReadBack,
  expectLoopNotWritten,
  setupPlaybackLiveSet,
} from "./playback-test-helpers.ts";

// A playback result never says back what the call told it, and it can't check
// the loop it wrote: `live_set loop` answers a read in the same request with
// the value from before the set, so the state a call reported after writing it
// was always the state it had just replaced.
describe("the loop a playback result reports", () => {
  it("reports the loop play-arrangement will obey when the call didn't set it", () => {
    // Governing state: the playback that just started obeys this loop, and the
    // caller may never have read it.
    setupPlaybackLiveSet({
      start_time: 0,
      loop: 1,
      loop_start: 8, // bar 3
      loop_length: 16, // bars 3–7
    });

    const result = playback({ action: "play-arrangement" });

    expect(result).toStrictEqual({
      playing: true,
      startTime: "1|1",
      loop: true,
      loopStart: "3|1",
      loopEnd: "7|1",
    });
  });

  it("says nothing about a loop it turned on, but says where it is", () => {
    // The Live Set's loop is off, and this call turns it on. The on/off state
    // is the caller's own word, so it isn't repeated — and isn't read back,
    // which would answer "off". The bounds are what the caller didn't say.
    const liveSet = setupPlaybackLiveSet({
      start_time: 0,
      loop: 0,
      loop_start: 8,
      loop_length: 16,
    });

    const result = playback({ action: "play-arrangement", loop: true });

    expectLiveSetProperty(liveSet, "loop", true);
    expect(result).toStrictEqual({
      playing: true,
      startTime: "1|1",
      loopStart: "3|1",
      loopEnd: "7|1",
    });
    expectLoopNotReadBack(liveSet);
  });

  it("says nothing about bounds a loop it turned off won't use", () => {
    const liveSet = setupPlaybackLiveSet({
      start_time: 0,
      loop: 1,
      loop_start: 8,
      loop_length: 16,
    });

    const result = playback({ action: "play-arrangement", loop: false });

    expectLiveSetProperty(liveSet, "loop", false);
    expect(result).toStrictEqual({ playing: true, startTime: "1|1" });
    expectLoopNotReadBack(liveSet);
  });

  it("says nothing about a loop a call that plays nothing set", () => {
    // Nothing was played, so no loop governs what this call did.
    const liveSet = setupPlaybackLiveSet({ loop: 0, loop_start: 8 });

    const result = playback({ action: "update-arrangement", loop: true });

    expectLiveSetProperty(liveSet, "loop", true);
    expect(result).toStrictEqual({ playing: false });
    expectLoopNotReadBack(liveSet);
  });

  // The bug this guards: stop reported the loop by reading it back, so four
  // toggles in a row each answered with the state of the call before them.
  it("says nothing about a loop a stop set", () => {
    const liveSet = setupPlaybackLiveSet({ loop: 1, loop_start: 8 });

    const result = playback({ action: "stop", loop: false });

    expectLiveSetProperty(liveSet, "loop", false);
    expect(result).toStrictEqual({ playing: false });
    expectLoopNotReadBack(liveSet);
  });

  it("reports the loop a refused write left alone, where playback obeys it", () => {
    // The plan is refused whole, so nothing was written: the loop the playback
    // just started obeys is the old one, and the caller was told none of it.
    const liveSet = setupPlaybackLiveSet({
      start_time: 0,
      loop: 1,
      loop_start: 8, // bar 3
      loop_length: 16, // bars 3–7
    });

    const result = playback({
      action: "play-arrangement",
      loopStart: "9|1",
      loopEnd: "5|1", // before loopStart, so the whole plan is refused
    });

    expectLoopNotWritten(liveSet);
    expect(result).toStrictEqual({
      playing: true,
      startTime: "1|1",
      loop: true,
      loopStart: "3|1",
      loopEnd: "7|1",
    });
  });

  it("reports the end that slid when the caller named the other", () => {
    // Naming one end slides the whole loop, so the end the caller didn't name
    // moved — and nothing but the result reveals where it landed.
    const liveSet = setupPlaybackLiveSet({
      loop_start: 16, // where this call slides it: bar 5
      loop_length: 16,
    });

    const result = playback({ action: "update-arrangement", loopEnd: "9|1" });

    expectLiveSetProperty(liveSet, "loop_start", 16);
    expect(result).toStrictEqual({ playing: false, loopStart: "5|1" });
  });

  it("reports the far end when the caller named the near one", () => {
    const liveSet = setupPlaybackLiveSet({
      loop_start: 8, // bar 3, where this call puts it
      loop_length: 16,
    });

    const result = playback({ action: "update-arrangement", loopStart: "3|1" });

    expectLiveSetProperty(liveSet, "loop_start", 8);
    expect(result).toStrictEqual({ playing: false, loopEnd: "7|1" });
  });
});
