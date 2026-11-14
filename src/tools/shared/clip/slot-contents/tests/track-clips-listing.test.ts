// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api-property-helpers.ts";
import {
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { listTrackClips } from "../track-clips-listing.ts";

describe("listTrackClips", () => {
  it("lists a session clip by its slot and skips a slot whose clip isn't there", () => {
    mockNonExistentObjects();
    registerMockObject("track", {
      path: livePath.track(1),
      type: "Track",
      properties: {
        clip_slots: children("slot-0", "slot-1", "slot-2"),
        take_lanes: children(),
        arrangement_clips: children(),
      },
    });
    registerMockObject("slot-0", {
      path: livePath.track(1).clipSlot(0),
      properties: { has_clip: 1 },
    });
    registerMockObject("clip-0", {
      path: livePath.track(1).clipSlot(0).clip(),
    });
    // Live says this slot holds a clip, but it can't be reached.
    registerMockObject("slot-1", {
      path: livePath.track(1).clipSlot(1),
      properties: { has_clip: 1 },
    });
    registerMockObject("slot-2", {
      path: livePath.track(1).clipSlot(2),
      properties: { has_clip: 0 },
    });

    expect(
      listTrackClips(LiveAPI.from(livePath.track(1))).map(
        ({ path, clip }) => `${path} ${clip.id}`,
      ),
    ).toStrictEqual(["t1/s0 clip-0"]);
  });
});
