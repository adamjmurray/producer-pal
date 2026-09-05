// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  registerMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { playback } from "#src/tools/session/playback.ts";
import { setupPlaybackLiveSet } from "./playback-test-helpers.ts";

/** The actions that work the session or the transport, not the arrangement. */
const SESSION_ACTIONS = [
  "play-scene",
  "play-session-clips",
  "stop-session-clips",
  "stop-all-session-clips",
];

/** Everything any of the actions might fire, so each call gets that far. */
function registerTargets(): void {
  registerMockObject(livePath.scene(3), { path: livePath.scene(3) });
  registerMockObject(livePath.track(0), { path: livePath.track(0) });
  registerMockObject(livePath.track(0).clipSlot(1), {
    path: livePath.track(0).clipSlot(1),
  });
}

/** The target param each action needs, so the call gets as far as the timeline. */
function targetFor(action: string): Record<string, unknown> {
  if (action === "play-scene") return { sceneIndex: 3 };

  if (action === "play-session-clips" || action === "stop-session-clips") {
    return { path: "t0/s1" };
  }

  return {};
}

// These are written to the Live Set before the action runs, so a session action
// used to apply them anyway — firing a scene *and* moving the playhead, silently.
describe("playback arrangement params on a session action", () => {
  let liveSet: RegisteredMockObject;

  beforeEach(() => {
    liveSet = setupPlaybackLiveSet();
  });

  it.each(SESSION_ACTIONS)("does not move the playhead for %s", (action) => {
    registerTargets();
    playback({ ...targetFor(action), action, startTime: "5|1" });

    expect(liveSet.set).not.toHaveBeenCalledWith("start_time", 16);
  });

  it.each(SESSION_ACTIONS)("says it ignored startTime on %s", (action) => {
    const warn = vi.spyOn(console, "warn");

    registerTargets();
    playback({ ...targetFor(action), action, startTime: "5|1" });

    expect(warn).toHaveBeenCalledWith(
      `startTime ignored: action "${action}" doesn't take arrangement ` +
        `timeline params; use "play-arrangement" or "update-arrangement" for ` +
        `the start position and loop`,
    );
  });

  // loopEnd is here too because it writes loop_length, not loop_start — a
  // separate write that has to be dropped on its own.
  it("does not touch the arrangement loop either", () => {
    const warn = vi.spyOn(console, "warn");

    registerTargets();
    playback({
      action: "play-scene",
      sceneIndex: 3,
      loop: true,
      loopStart: "5|1",
      loopEnd: "9|1",
    });

    expect(liveSet.set).not.toHaveBeenCalledWith("loop", true);
    expect(liveSet.set).not.toHaveBeenCalledWith("loop_start", 16);
    expect(liveSet.set).not.toHaveBeenCalledWith(
      "loop_length",
      expect.anything(),
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("loop/loopStart/loopEnd ignored"),
    );
  });

  // The result reports the loop the Live Set actually has. Echoing the param
  // would claim a loop the call refused to set.
  it("reports the Live Set's own loop, not the param it dropped", () => {
    liveSet = setupPlaybackLiveSet({ loop: 0 });
    registerTargets();

    const result = playback({
      action: "play-scene",
      sceneIndex: 3,
      loop: true,
    });

    expect(result.loop).toBeUndefined();
  });

  // A locator resolves against the arrangement too, so it goes the same way.
  it("drops startLocator without looking it up", () => {
    const warn = vi.spyOn(console, "warn");

    registerTargets();
    playback({
      action: "play-scene",
      sceneIndex: 3,
      startLocator: "no-such-locator",
    });

    expect(liveSet.set).not.toHaveBeenCalledWith(
      "start_time",
      expect.anything(),
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("startLocator ignored"),
    );
  });

  // The two params can't be used together, but neither one applies here, so
  // there is nothing to refuse.
  it("does not refuse startTime with startLocator once both are dropped", () => {
    registerTargets();

    expect(() =>
      playback({
        action: "play-scene",
        sceneIndex: 3,
        startTime: "5|1",
        startLocator: "locator-0",
      }),
    ).not.toThrow();
  });

  it("names every param it dropped, in one warning", () => {
    const warn = vi.spyOn(console, "warn");

    registerTargets();
    playback({
      action: "play-scene",
      sceneIndex: 3,
      startTime: "5|1",
      loop: false,
      loopEnd: "9|1",
    });

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("startTime/loop/loopEnd ignored"),
    );
  });

  it("says nothing when the caller sent none of them", () => {
    const warn = vi.spyOn(console, "warn");

    registerTargets();
    playback({ action: "stop-all-session-clips" });

    expect(warn).not.toHaveBeenCalled();
  });
});

describe("playback arrangement params on an arrangement action", () => {
  let liveSet: RegisteredMockObject;

  beforeEach(() => {
    liveSet = setupPlaybackLiveSet();
  });

  it.each(["play-arrangement", "update-arrangement", "stop"])(
    "still applies startTime on %s",
    (action) => {
      const warn = vi.spyOn(console, "warn");

      playback({ action, startTime: "5|1" });

      expect(liveSet.set).toHaveBeenCalledWith("start_time", 16);
      expect(warn).not.toHaveBeenCalled();
    },
  );

  it("still applies the loop params", () => {
    playback({ action: "update-arrangement", loop: true, loopStart: "5|1" });

    expect(liveSet.set).toHaveBeenCalledWith("loop", true);
    expect(liveSet.set).toHaveBeenCalledWith("loop_start", 16);
  });
});
