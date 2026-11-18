// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// The debug-build check for a LiveAPI object used after its request ended.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  beginLiveApiScope,
  endLiveApiScope,
  resetLiveApiTracking,
  untrackLiveApiObject,
} from "#src/live-api-adapter/live-api-release.ts";
import {
  guardStale,
  markReleased,
  unguard,
} from "#src/live-api-adapter/live-api-stale-check.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";

const STALE = /Stale LiveAPI object: "path" used after the request/;

/**
 * Get a track object in a request that has already ended.
 * @returns The object the ended request was handed
 */
function staleTrack(): LiveAPI {
  beginLiveApiScope();

  const track = LiveAPI.from(livePath.track(0));

  endLiveApiScope();

  return track;
}

describe("stale LiveAPI check", () => {
  // Outside Max, v8-max-console.error falls back to the Node console.
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetLiveApiTracking();
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("in a debug build", () => {
    beforeEach(() => {
      vi.stubEnv("ENABLE_STALE_LIVE_API_CHECK", "true");
    });

    it("warns once when an object is used after its request ended", () => {
      const track = staleTrack();

      expect(errorSpy).not.toHaveBeenCalled();

      void track.path;
      void track.path;

      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(String(errorSpy.mock.calls[0]?.[0])).toMatch(STALE);
    });

    it("warns on a write too", () => {
      const track = staleTrack();

      (track as unknown as { path: string }).path = "live_set";

      expect(String(errorSpy.mock.calls[0]?.[0])).toMatch(
        /Stale LiveAPI object: "path"/,
      );
    });

    it("stays quiet while the request is running", () => {
      beginLiveApiScope();

      const track = LiveAPI.from(livePath.track(0));

      expect(track.path).toBe(String(livePath.track(0)));
      expect(track.child("mixer_device").path).toBe(
        `${String(livePath.track(0))} mixer_device`,
      );

      endLiveApiScope();

      expect(errorSpy).not.toHaveBeenCalled();
    });

    it("stays quiet for the next request's wrapper on the same object", () => {
      staleTrack();
      beginLiveApiScope();

      const reused = LiveAPI.from(livePath.track(1));

      expect(reused.path).toBe(String(livePath.track(1)));

      endLiveApiScope();

      expect(errorSpy).not.toHaveBeenCalled();
    });

    it("hands back the same wrapper for a repeated stable target", () => {
      beginLiveApiScope();

      expect(LiveAPI.from(livePath.liveSet)).toBe(
        LiveAPI.from(livePath.liveSet),
      );

      endLiveApiScope();
    });

    it("runs methods against the real object", () => {
      const api = { path: "live_set", where: vi.fn() };
      const wrapper = guardStale(api as unknown as LiveAPI);

      (wrapper as unknown as typeof api).where();

      expect(api.where.mock.contexts[0]).toBe(api);
      expect(unguard(wrapper)).toBe(api);
    });

    it("forgets an object through its wrapper", () => {
      beginLiveApiScope();

      const track = LiveAPI.from(livePath.track(0));

      untrackLiveApiObject(track);
      endLiveApiScope();

      // Never released, so neither cleared nor stale.
      expect(track.path).toBe(String(livePath.track(0)));
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });

  describe("in a release build", () => {
    it("hands out the object itself", () => {
      const api = { path: "live_set" } as unknown as LiveAPI;

      expect(guardStale(api)).toBe(api);
      expect(unguard(api)).toBe(api);
    });

    it("never warns", () => {
      const track = staleTrack();

      markReleased(track);
      void track.path;

      expect(errorSpy).not.toHaveBeenCalled();
    });
  });
});
