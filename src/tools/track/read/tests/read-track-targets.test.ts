// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude Code (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { takeLaneRead } from "../helpers/read-take-lane.ts";
import { resolveReadTrackTarget } from "../helpers/read-track-targets.ts";

describe("takeLaneRead", () => {
  it("reads a lane path on its own as the lane", () => {
    expect(takeLaneRead({ path: "t0/l1" })).toStrictEqual({
      from: "path",
      path: { kind: "take-lane", trackIndex: 0, laneIndex: 1 },
      entry: "t0/l1",
    });
  });

  // The track read refuses a path beside another target, so a lane path must
  // not slip past that check.
  it.each([{ id: "5" }, { trackId: "5" }, { trackIndex: 0 }])(
    "leaves a lane path sent beside %j to the track read",
    (other) => {
      expect(takeLaneRead({ path: "t0/l1", ...other })).toBeUndefined();
    },
  );

  it("leaves a path naming something other than a lane alone", () => {
    expect(takeLaneRead({ path: "t0" })).toBeUndefined();
  });
});

describe("resolveReadTrackTarget", () => {
  it("reads a track with no category of its own as a regular track", () => {
    registerMockObject("loose-track", { type: "Track" });

    expect(resolveReadTrackTarget({ trackId: "loose-track" })).toStrictEqual({
      track: expect.objectContaining({ id: "loose-track" }),
      category: "regular",
      trackIndex: null,
    });
  });
});
