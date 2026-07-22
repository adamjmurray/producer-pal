// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { describe, expect, it } from "vitest";
import { readLiveSetScaleMask } from "./scale-mask.ts";

describe("readLiveSetScaleMask", () => {
  it("returns undefined when scale_mode is 0 (no scale active)", () => {
    // A concrete, non-chromatic scale is registered so that if the scaleMode===0
    // short-circuit is skipped the function would compute a real mask (2741).
    // The short-circuit must win: the result is undefined.
    registerMockObject("live-set", {
      path: livePath.liveSet,
      type: "Song",
      properties: {
        scale_mode: 0,
        root_note: 0,
        scale_intervals: [0, 2, 4, 5, 7, 9, 11], // C major
      },
    });

    expect(readLiveSetScaleMask()).toBeUndefined();
  });

  it("returns the pitch-class mask when a non-chromatic scale is active", () => {
    registerMockObject("live-set", {
      path: livePath.liveSet,
      type: "Song",
      properties: {
        scale_mode: 1,
        root_note: 0,
        scale_intervals: [0, 2, 4, 5, 7, 9, 11], // C major
      },
    });

    expect(readLiveSetScaleMask()).toBe(2741);
  });

  it("returns undefined for a chromatic scale (a chromatic mask is a no-op)", () => {
    registerMockObject("live-set", {
      path: livePath.liveSet,
      type: "Song",
      properties: {
        scale_mode: 1,
        root_note: 0,
        scale_intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      },
    });

    expect(readLiveSetScaleMask()).toBeUndefined();
  });
});
