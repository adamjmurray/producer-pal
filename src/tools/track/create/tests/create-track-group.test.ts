// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { registerCreateTrackLiveSet } from "./create-track-test-helpers.ts";
import { createTrack } from "../create-track.ts";

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  log: vi.fn(),
  warn: vi.fn(),
}));

// A path at a member's index puts the new track inside the group, which the
// path gives no hint of.
describe("createTrack inside a group track", () => {
  beforeEach(() => {
    registerCreateTrackLiveSet(() => ["id", "return_track_0"]);
    registerMockObject("group", {
      path: livePath.track(0),
      properties: { is_foldable: 1, group_track: ["id", 0] },
    });
  });

  it("says which group track the new track landed in", () => {
    registerMockObject("midi_track_1", {
      path: livePath.track(1),
      properties: { group_track: ["id", "group"] },
    });

    expect(createTrack({ path: "t1" })).toStrictEqual({
      id: "midi_track_1",
      path: "t1",
      detail: "inside group track t0 (id group)",
    });
  });

  it("names the direct group of a track in a nested one", () => {
    registerMockObject("inner", {
      path: livePath.track(1),
      properties: { is_foldable: 1, group_track: ["id", "group"] },
    });
    registerMockObject("midi_track_2", {
      path: livePath.track(2),
      properties: { group_track: ["id", "inner"] },
    });

    expect(createTrack({ path: "t2" })).toStrictEqual({
      id: "midi_track_2",
      path: "t2",
      detail: "inside group track t1 (id inner)",
    });
  });

  it("says nothing of a track outside every group", () => {
    registerMockObject("midi_track_-1", {
      path: livePath.track(2),
      properties: { group_track: ["id", 0] },
    });

    expect(createTrack({ path: "t+" })).toStrictEqual({
      id: "midi_track_-1",
      path: "t2",
    });
  });

  it("keeps the entry when the group can't be read after the track was made", () => {
    const made = registerMockObject("midi_track_1", {
      path: livePath.track(1),
    });

    made.get.mockImplementation((property: string) => {
      if (property === "group_track") {
        throw new Error("Live refused group_track");
      }

      return [0];
    });

    expect(createTrack({ path: "t1,t+" })).toStrictEqual([
      {
        id: "midi_track_1",
        path: "t1",
        detail: "Live refused group_track; already changed: track created",
      },
      expect.objectContaining({ path: "t3" }),
    ]);
  });
});
