// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { isProducerPalDevice } from "../is-producer-pal-device.ts";

const g = globalThis as Record<string, unknown>;

/**
 * Register the host device at a path and return an object at another path.
 *
 * @param hostPath - Where the Producer Pal device lives
 * @param objectPath - Path of the object under test
 * @returns The object under test
 */
function objectAgainstHost(hostPath: string, objectPath: string): LiveAPI {
  registerMockObject("this_device", {
    path: "this_device",
    returnPath: hostPath,
  });

  return registerMockObject(objectPath, {
    path: objectPath,
  }) as unknown as LiveAPI;
}

describe("isProducerPalDevice", () => {
  it("is true for the device itself", () => {
    const host = String(livePath.track(1).device(0));

    expect(isProducerPalDevice(objectAgainstHost(host, host))).toBe(true);
  });

  it("is true for a rack or chain holding it", () => {
    const host = "live_set tracks 1 devices 0 chains 0 devices 1";

    expect(
      isProducerPalDevice(
        objectAgainstHost(host, "live_set tracks 1 devices 0"),
      ),
    ).toBe(true);
    expect(
      isProducerPalDevice(
        objectAgainstHost(host, "live_set tracks 1 devices 0 chains 0"),
      ),
    ).toBe(true);
  });

  it("is false for another device", () => {
    const host = String(livePath.track(1).device(0));

    expect(
      isProducerPalDevice(
        objectAgainstHost(host, String(livePath.track(1).device(1))),
      ),
    ).toBe(false);
  });

  it("does not match a track whose index is only a prefix of the host's", () => {
    const host = "live_set tracks 10 devices 0";

    expect(
      isProducerPalDevice(objectAgainstHost(host, "live_set tracks 1")),
    ).toBe(false);
  });

  it("is false when the host device cannot be reached", () => {
    const originalLiveAPI = g.LiveAPI;

    g.LiveAPI = {
      from: vi.fn(() => {
        throw new Error("LiveAPI not available");
      }),
    };

    expect(
      isProducerPalDevice({ path: "live_set tracks 0 devices 0" } as LiveAPI),
    ).toBe(false);

    g.LiveAPI = originalLiveAPI;
  });

  it("is false when the host device has no path", () => {
    expect(
      isProducerPalDevice(
        objectAgainstHost("", String(livePath.track(0).device(0))),
      ),
    ).toBe(false);
  });
});
