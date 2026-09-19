// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  mockNonExistentObjects,
  registerMockObject,
  simulateMockDeletes,
} from "#src/test/mocks/mock-registry.ts";
import {
  liveApiAtDevicePath,
  invalidateDevicePathCache,
  withDevicePathCache,
} from "../with-device-path-cache.ts";

describe("withDevicePathCache", () => {
  const trackPath = livePath.track(0).toString();

  beforeEach(() => {
    registerMockObject("track-0", { path: livePath.track(0) });
  });

  it("hands back the same object for a repeated path", () => {
    withDevicePathCache(() => {
      expect(liveApiAtDevicePath(trackPath)).toBe(
        liveApiAtDevicePath(trackPath),
      );
    });
  });

  it("resolves fresh outside a scope", () => {
    expect(liveApiAtDevicePath(trackPath)).not.toBe(
      liveApiAtDevicePath(trackPath),
    );
  });

  it("never caches an id, which follows a path once resolved", () => {
    withDevicePathCache(() => {
      expect(liveApiAtDevicePath("id 1")).not.toBe(liveApiAtDevicePath("id 1"));
    });
  });

  it("resolves fresh after an index shift is announced", () => {
    withDevicePathCache(() => {
      const before = liveApiAtDevicePath(trackPath);

      invalidateDevicePathCache();

      expect(liveApiAtDevicePath(trackPath)).not.toBe(before);
    });
  });

  // A path can fail a lookup and then have a device created at it later in the
  // same call. A cached miss would answer "doesn't exist" for the new device.
  it("does not cache a path that resolved to nothing", () => {
    mockNonExistentObjects();

    withDevicePathCache(() => {
      const missing = livePath.track(0).device(3).toString();
      const before = liveApiAtDevicePath(missing);

      expect(before.exists()).toBe(false);

      registerMockObject("new-device", { path: livePath.track(0).device(3) });

      expect(liveApiAtDevicePath(missing).exists()).toBe(true);
    });
  });

  // The bug class this cache kept producing: a mutation renumbers devices, the
  // path now names something else, and nobody remembered to announce it. The
  // object itself is fine — it followed its target — so its path is the tell.
  it("resolves fresh when the cached object moved out from under the path", () => {
    const devicePath = livePath.track(0).device(0).toString();

    registerMockObject("dev-a", { path: livePath.track(0).device(0) });

    withDevicePathCache(() => {
      const before = liveApiAtDevicePath(devicePath);

      expect(before.id).toBe("dev-a");

      // Live re-sorts the chain: dev-a slides to devices 1 and dev-b takes the
      // slot. No invalidateDevicePathCache() call, on purpose.
      registerMockObject("dev-a", { path: livePath.track(0).device(1) });
      registerMockObject("dev-b", { path: livePath.track(0).device(0) });

      expect(liveApiAtDevicePath(devicePath).id).toBe("dev-b");
    });
  });

  // A deleted target keeps its id and clears its path, so the same check
  // catches it without knowing a delete happened.
  it("resolves fresh when the cached object was deleted", () => {
    simulateMockDeletes();

    withDevicePathCache(() => {
      const before = liveApiAtDevicePath(trackPath);

      LiveAPI.from(livePath.liveSet).call("delete_track", 0);

      expect(before.path).toBe("");
      expect(liveApiAtDevicePath(trackPath)).not.toBe(before);
    });
  });

  it("refuses an async callback rather than tearing the cache down early", () => {
    expect(() =>
      withDevicePathCache(async () => liveApiAtDevicePath(trackPath)),
    ) //
      .toThrow("synchronous callback");
  });

  it("restores the enclosing scope's cache when a nested one ends", () => {
    withDevicePathCache(() => {
      const outer = liveApiAtDevicePath(trackPath);

      withDevicePathCache(() => liveApiAtDevicePath(trackPath));

      expect(liveApiAtDevicePath(trackPath)).toBe(outer);
    });
  });

  it("drops the cache even when the scope throws", () => {
    let inner: LiveAPI | null = null;

    expect(() =>
      withDevicePathCache(() => {
        inner = liveApiAtDevicePath(trackPath);
        throw new Error("boom");
      }),
    ).toThrow("boom");

    withDevicePathCache(() => {
      expect(liveApiAtDevicePath(trackPath)).not.toBe(inner);
    });
  });
});
