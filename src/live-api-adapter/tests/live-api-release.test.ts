// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Releasing the path listeners Live arms behind every LiveAPI object: what gets
// tracked, and when the release actually fires.

import { beforeEach, describe, expect, it, vi } from "vitest";
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
  // Outside Max, v8-max-console.error falls back to the Node console.
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

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
    expect(errorSpy).toHaveBeenCalledWith(
      "Failed to release 1 LiveAPI object(s): nope",
    );
    // The Max console, not outlet 1 — outlet 1 is what reaches the model.
    expect(vi.mocked(outlet)).not.toHaveBeenCalled();
  });

  it("reports the first failure when several objects refuse", () => {
    beginLiveApiScope();

    trackUnclearable("first");
    trackUnclearable("second");

    endLiveApiScope();

    expect(errorSpy).toHaveBeenCalledWith(
      "Failed to release 2 LiveAPI object(s): first",
    );
  });

  it("keeps a stray end of scope from breaking the next request", () => {
    // The count never goes below 0. Without that it goes negative here, and no
    // balanced begin/end after it ever reaches 0 again — so from this point on
    // nothing is released for the life of the device.
    endLiveApiScope();
    beginLiveApiScope();

    const track = LiveAPI.from(livePath.track(0));

    endLiveApiScope();

    expect(track.path).toBe("");
  });

  it("releases nothing on a stray end of scope", () => {
    // A stray end closes no scope, so it must not release either. Whatever is
    // tracked with none open belongs to a caller that never opened one, and a
    // cleared path reports id "0" — the object silently stops existing.
    const track = LiveAPI.from(livePath.track(0));

    endLiveApiScope();

    expect(track.path).toBe(String(livePath.track(0)));
  });

  it("reports a first failure that has no message, not the next one's", () => {
    beginLiveApiScope();

    trackUnclearable("");
    trackUnclearable("second");

    endLiveApiScope();

    expect(errorSpy).toHaveBeenCalledWith(
      "Failed to release 2 LiveAPI object(s): ",
    );
  });

  it("retargets a released object instead of building another", () => {
    beginLiveApiScope();

    const first = LiveAPI.from(livePath.track(0));

    endLiveApiScope();
    beginLiveApiScope();

    const second = LiveAPI.from(livePath.track(1));

    expect(second).toBe(first);
    expect(second.path).toBe(String(livePath.track(1)));

    endLiveApiScope();
  });

  it("resets a mode the last request left behind", () => {
    beginLiveApiScope();

    const first = LiveAPI.from(livePath.track(0));

    // What the ppal-live-api set_mode operation leaves behind: follow the
    // object rather than the path.
    first.mode = 1;

    endLiveApiScope();
    beginLiveApiScope();

    expect(LiveAPI.from(livePath.track(1)).mode).toBe(0);

    endLiveApiScope();
  });

  it("hands out a distinct object per call within one request", () => {
    // The pool only refills once no scope is open, so nothing a request is
    // still holding can come back to it mid-flight.
    beginLiveApiScope();

    const first = LiveAPI.from(livePath.track(0));
    const second = LiveAPI.from(livePath.track(1));

    expect(second).not.toBe(first);
    expect(first.path).toBe(String(livePath.track(0)));
    expect(second.path).toBe(String(livePath.track(1)));

    endLiveApiScope();
  });

  it("builds a fresh object for an id target instead of retargeting", () => {
    // goto can't take the "id N" form. Measured on 12.4.3 it reports success
    // and leaves the object nonexistent, so an id always builds.
    beginLiveApiScope();

    const first = LiveAPI.from(livePath.track(0));

    endLiveApiScope();
    beginLiveApiScope();

    const byId = LiveAPI.from(5);

    expect(byId).not.toBe(first);
    expect(byId.path).toBe("id 5");

    endLiveApiScope();
  });

  it("pools the objects getChildren built", () => {
    beginLiveApiScope();

    const liveSet = LiveAPI.from(livePath.liveSet);

    liveSet.get = vi.fn().mockReturnValue(["id", "1", "id", "2"]);

    const children = liveSet.getChildren("tracks");

    endLiveApiScope();
    beginLiveApiScope();

    const reused = LiveAPI.from(livePath.track(0));

    expect([liveSet, ...children]).toContain(reused);

    endLiveApiScope();
  });

  it("does not reuse an object that refused to be cleared", () => {
    beginLiveApiScope();

    // Its path setter throws, so the release can't know where it points.
    trackUnclearable("nope");

    endLiveApiScope();
    beginLiveApiScope();

    const next = LiveAPI.from(livePath.track(0));

    expect(next.path).toBe(String(livePath.track(0)));

    endLiveApiScope();
  });

  it("forgets pooled objects on reset", () => {
    beginLiveApiScope();

    const first = LiveAPI.from(livePath.track(0));

    endLiveApiScope();
    resetLiveApiTracking();
    beginLiveApiScope();

    const second = LiveAPI.from(livePath.track(1));

    expect(second).not.toBe(first);

    endLiveApiScope();
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
