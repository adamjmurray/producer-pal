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
import {
  registerClipSlot,
  setupPlaybackLiveSet,
} from "./playback-test-helpers.ts";

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
  registerClipSlot(0, 1);
}

/** The target param each action needs, so the call gets as far as the timeline. */
function targetFor(action: string): Record<string, unknown> {
  if (action === "play-scene") {
    return { sceneIndex: 3 };
  }

  if (action === "play-session-clips" || action === "stop-session-clips") {
    return { path: "t0/s1" };
  }

  return {};
}

// They are written to the Live Set before the action runs, so a session action
// that took them would fire a scene *and* move the playhead. It is refused
// instead, before anything is written, since the action or the param is the
// mistake and nothing says which.
describe("playback arrangement params on a session action", () => {
  let liveSet: RegisteredMockObject;

  beforeEach(() => {
    liveSet = setupPlaybackLiveSet();
  });

  it.each(SESSION_ACTIONS)("refuses startTime on %s", (action) => {
    registerTargets();

    expect(() =>
      playback({ ...targetFor(action), action, startTime: "5|1" }),
    ).toThrow(
      'startTime is only for action "play-arrangement", "update-arrangement" ' +
        `or "stop"; this call has action "${action}". Change the action or ` +
        "drop startTime.",
    );
    expect(liveSet.set).not.toHaveBeenCalled();
  });

  it("names every timeline param it refused, in one message", () => {
    registerTargets();

    expect(() =>
      playback({
        action: "play-scene",
        sceneIndex: 3,
        startTime: "5|1",
        loop: false,
        loopEnd: "9|1",
      }),
    ).toThrow(/startTime, loop, loopEnd are only for action/);
    expect(liveSet.set).not.toHaveBeenCalled();
  });

  // The caller's own spelling, not the one it folds into.
  it("names the retired locator param as it was sent", () => {
    registerTargets();

    expect(() =>
      playback({
        action: "play-scene",
        sceneIndex: 3,
        startLocator: "no-such-locator",
      }),
    ).toThrow(/^startLocator is only for action/);
  });

  it("counts a blank as not sent", () => {
    registerTargets();

    expect(() =>
      playback({
        action: "play-scene",
        sceneIndex: 3,
        startTime: "",
        loopStart: "null",
      }),
    ).not.toThrow();
    expect(liveSet.set).not.toHaveBeenCalledWith(
      "start_time",
      expect.anything(),
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
