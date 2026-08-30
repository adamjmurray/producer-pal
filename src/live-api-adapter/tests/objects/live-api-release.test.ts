// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Releasing the path listeners Live arms behind every LiveAPI object: what gets
// tracked, and when the release actually fires.

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_POOLED_OBJECTS,
  beginLiveApiScope,
  endLiveApiScope,
  resetLiveApiTracking,
  trackLiveApiObject,
  untrackLiveApiObject,
} from "#src/live-api-adapter/live-api-release.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

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

/**
 * Track an object whose path setter silently does nothing, standing in for a
 * path write Live ignores rather than rejects.
 *
 * @returns The tracked object, still pointing where it started
 */
function trackSilentlyUnclearable(): LiveAPI {
  const api = {
    mode: 0,

    get path(): string {
      return String(livePath.track(0));
    },

    set path(_value: string) {
      // Live ignoring the write.
    },
  };

  return trackLiveApiObject(api as unknown as LiveAPI);
}

/**
 * Track an object that clears normally but ignores an id write, standing in for
 * the way Live drops a bad id without saying so.
 *
 * @param id - What it reports afterwards: the target it never left, or "0"
 * @returns The tracked object
 */
function trackIdDeaf(id: string): LiveAPI {
  let path = String(livePath.track(0));

  const api = {
    mode: 0,

    get path(): string {
      return path;
    },

    set path(value: string) {
      path = value;
    },

    get id(): string {
      return id;
    },

    set id(_value: string) {
      // Live ignoring the write.
    },
  };

  return trackLiveApiObject(api as unknown as LiveAPI);
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
    // The Max console, not the response — a release failure has no request to
    // ride, so the model never sees it.
    expect(capturedWarnings()).toHaveLength(0);
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

  it("retargets a released object to an id target too", () => {
    beginLiveApiScope();

    const first = LiveAPI.from(livePath.track(0));

    endLiveApiScope();
    beginLiveApiScope();

    const byId = LiveAPI.from(5);

    expect(byId).toBe(first);
    expect(byId.path).toBe("id 5");

    endLiveApiScope();
  });

  it("builds an object for an id target when the pool is empty", () => {
    beginLiveApiScope();

    const byId = LiveAPI.from(5);

    expect(byId.path).toBe("id 5");

    endLiveApiScope();
  });

  it("builds instead of handing back an object that ignored an id write", () => {
    // A bad id doesn't throw — Live leaves the object on its old target. Only
    // reachable if the release let an uncleared object into the pool, but the
    // cost of being wrong is a read or write landing on someone else's object.
    beginLiveApiScope();

    const deaf = trackIdDeaf("7");

    endLiveApiScope();
    beginLiveApiScope();

    const byId = LiveAPI.from(5);

    expect(byId).not.toBe(deaf);
    expect(byId.path).toBe("id 5");

    endLiveApiScope();
  });

  it("keeps an object an id write left pointing at nothing", () => {
    // "0" is not the id that was asked for, but it is a truthful answer: the
    // object points nowhere, which is what a bad id means. Rebuilding would
    // land on exactly the same result for more work.
    beginLiveApiScope();

    const nowhere = trackIdDeaf("0");

    endLiveApiScope();
    beginLiveApiScope();

    expect(LiveAPI.from(5)).toBe(nowhere);

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

    // The children, not liveSet: the free list is LIFO and they were released
    // last, so this fails if getChildren's objects never reached it.
    expect(children).toContain(reused);

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

  it("does not reuse an object whose clear was silently ignored", () => {
    beginLiveApiScope();

    const stuck = trackSilentlyUnclearable();

    endLiveApiScope();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("path did not clear"),
    );

    beginLiveApiScope();

    expect(LiveAPI.from(livePath.track(1))).not.toBe(stuck);

    endLiveApiScope();
  });

  it("neither releases nor pools an object it was told to forget", () => {
    beginLiveApiScope();

    const forgotten = LiveAPI.from(livePath.track(0));

    untrackLiveApiObject(forgotten);
    endLiveApiScope();

    // Untouched by the release, so it never reaches the free list either.
    expect(forgotten.path).toBe(String(livePath.track(0)));

    beginLiveApiScope();

    expect(LiveAPI.from(livePath.track(1))).not.toBe(forgotten);

    endLiveApiScope();
  });

  it("ignores an object it was never tracking", () => {
    beginLiveApiScope();

    const tracked = LiveAPI.from(livePath.track(0));

    untrackLiveApiObject({} as unknown as LiveAPI);
    endLiveApiScope();

    expect(tracked.path).toBe("");
  });

  it("stops pooling once the free list is full", () => {
    // The ceiling bounds memory: one big request can build far more objects
    // than any later one needs, and without a cap they all stay on the list.
    const overflow = 10;

    beginLiveApiScope();

    const built = new Set<LiveAPI>();

    for (let i = 0; i < MAX_POOLED_OBJECTS + overflow; i++) {
      built.add(LiveAPI.from(i + 1));
    }

    endLiveApiScope();
    beginLiveApiScope();

    let reused = 0;

    for (let i = 0; i < MAX_POOLED_OBJECTS + overflow; i++) {
      if (built.has(LiveAPI.from(livePath.track(i)))) reused++;
    }

    expect(reused).toBe(MAX_POOLED_OBJECTS);

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
