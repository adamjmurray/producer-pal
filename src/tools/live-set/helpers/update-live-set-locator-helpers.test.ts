// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  stopPlaybackIfNeeded,
  waitForPlayheadPosition,
} from "./update-live-set-locator-helpers.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

describe("stopPlaybackIfNeeded", () => {
  it("stops playback and warns when the set is playing", () => {
    const liveSet = registerMockObject("live_set", {
      path: "live_set",
      properties: { is_playing: 1 },
    });

    const stopped = stopPlaybackIfNeeded(LiveAPI.from("live_set"));

    expect(stopped).toBe(true);
    expect(liveSet.call).toHaveBeenCalledWith("stop_playing");
    expect(capturedWarnings()).toContain("Playback stopped to modify locators");
  });

  it("does nothing when the set is stopped (is_playing 0 is not playing)", () => {
    const liveSet = registerMockObject("live_set", {
      path: "live_set",
      properties: { is_playing: 0 },
    });

    const stopped = stopPlaybackIfNeeded(LiveAPI.from("live_set"));

    expect(stopped).toBe(false);
    expect(liveSet.call).not.toHaveBeenCalledWith("stop_playing");
    expect(capturedWarnings()).toHaveLength(0);
  });
});

describe("waitForPlayheadPosition", () => {
  /**
   * Register a live_set whose current_song_time reads back as `position`.
   * @param position - The value get("current_song_time") returns
   * @returns A LiveAPI handle for the registered live_set
   */
  function liveSetAt(position: number): LiveAPI {
    registerMockObject("live_set", {
      path: "live_set",
      properties: { current_song_time: position },
    });

    return LiveAPI.from("live_set");
  }

  beforeEach(() => {
    // Clear any previous registration so each case controls the playhead.
    registerMockObject("live_set", { path: "live_set" });
  });

  it("resolves without warning once the playhead reaches the target", async () => {
    await waitForPlayheadPosition(liveSetAt(16), 16);

    expect(capturedWarnings()).toHaveLength(0);
  });

  it("warns when the playhead never reaches the target", async () => {
    await waitForPlayheadPosition(liveSetAt(9999), 16);

    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining("Playhead position did not reach target 16"),
    );
  });

  it("treats a difference of exactly the epsilon as not reached", async () => {
    // SAME_TIME_EPSILON is 0.001; the tolerance is strict (< not <=).
    await waitForPlayheadPosition(liveSetAt(0.001), 0);

    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining("did not reach target 0"),
    );
  });
});
