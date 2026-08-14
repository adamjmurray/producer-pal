// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Releasing the path listeners Live arms behind every LiveAPI object: what gets
// tracked, and when the release actually fires.

import { describe, expect, it, vi } from "vitest";
import {
  beginLiveApiScope,
  endLiveApiScope,
  resetLiveApiTracking,
  trackLiveApiObject,
} from "#src/live-api-adapter/live-api-release.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";

/**
 * Track an object whose path can't be cleared, standing in for a Live API
 * object that has gone away underneath us.
 *
 * @param error - The message its path setter throws
 */
function trackUnclearable(error: string): void {
  trackLiveApiObject({
    set path(_value: string) {
      throw new Error(error);
    },
  } as unknown as LiveAPI);
}

describe("live-api release", () => {
  it("clears the path of every object built during a request", () => {
    beginLiveApiScope();

    const track = LiveAPI.from(livePath.track(0));
    const mixer = track.child("mixer_device");

    expect(track.path).toBe(String(livePath.track(0)));

    endLiveApiScope();

    expect(track.path).toBe("");
    expect(mixer.path).toBe("");
  });

  it("tracks the objects getChildren builds", () => {
    beginLiveApiScope();

    const liveSet = LiveAPI.from(livePath.liveSet);

    liveSet.get = vi.fn().mockReturnValue(["id", "1", "id", "2"]);

    const children = liveSet.getChildren("tracks");

    expect(children.map((child) => child.path)).toStrictEqual(["id 1", "id 2"]);

    endLiveApiScope();

    expect(children.map((child) => child.path)).toStrictEqual(["", ""]);
  });

  it("waits for the last overlapping request before releasing", () => {
    // Requests overlap whenever a tool awaits. Releasing at the end of the
    // first one would clear paths the second still needs — a cleared path
    // reports id "0", so the object silently stops existing.
    beginLiveApiScope();

    const first = LiveAPI.from(livePath.track(0));

    beginLiveApiScope();

    const second = LiveAPI.from(livePath.track(1));

    endLiveApiScope();

    expect(first.path).toBe(String(livePath.track(0)));
    expect(second.path).toBe(String(livePath.track(1)));

    endLiveApiScope();

    expect(first.path).toBe("");
    expect(second.path).toBe("");
  });

  it("forgets the objects it has already released", () => {
    beginLiveApiScope();

    const track = LiveAPI.from(livePath.track(0));

    endLiveApiScope();

    // Stands in for a later request building its own object at this path.
    (track as unknown as { path: string }).path = String(livePath.track(0));

    beginLiveApiScope();
    endLiveApiScope();

    // Keep tracking them and the array grows for the life of the device: every
    // request re-clears every object ever built, and none of them can be GC'd.
    expect(track.path).toBe(String(livePath.track(0)));
  });

  it("releases the rest when one object refuses to be cleared", () => {
    beginLiveApiScope();

    trackUnclearable("nope");

    const track = LiveAPI.from(livePath.track(0));

    endLiveApiScope();

    expect(track.path).toBe("");
    // console.warn() reaches the MCP response through outlet 1.
    expect(vi.mocked(outlet).mock.calls).toContainEqual([
      1,
      "Failed to release 1 LiveAPI object(s): nope",
    ]);
  });

  it("reports the first failure when several objects refuse", () => {
    beginLiveApiScope();

    trackUnclearable("first");
    trackUnclearable("second");

    endLiveApiScope();

    expect(vi.mocked(outlet).mock.calls).toContainEqual([
      1,
      "Failed to release 2 LiveAPI object(s): first",
    ]);
  });

  it("keeps a stray end of scope from breaking the next request", () => {
    // The count is clamped at 0. Without that it goes negative here, and no
    // balanced begin/end after it ever reaches 0 again — so from this point on
    // nothing is released for the life of the device.
    endLiveApiScope();
    beginLiveApiScope();

    const track = LiveAPI.from(livePath.track(0));

    endLiveApiScope();

    expect(track.path).toBe("");
  });

  it("forgets tracked objects without touching them on reset", () => {
    beginLiveApiScope();

    const track = LiveAPI.from(livePath.track(0));

    resetLiveApiTracking();
    beginLiveApiScope();
    endLiveApiScope();

    expect(track.path).toBe(String(livePath.track(0)));
  });
});
