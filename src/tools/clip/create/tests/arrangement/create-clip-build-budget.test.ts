// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Budget test for creating several arrangement clips in one call.
//
// The destination track used to be rebuilt for every clip in the batch, on top
// of the one the existence check already resolved: 20 clips on one track cost
// 21 track objects against real Live, all of them the same target. Creating a
// clip never moves a track, so one object serves the whole call.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { liveApiBuildStats } from "#src/live-api-adapter/live-api-build-stats.ts";
import { createClip } from "#src/tools/clip/create/create-clip.ts";
import {
  registerArrangementTrack,
  setupArrangementClipMocks,
} from "../create-clip-test-helpers.ts";

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({ warn: vi.fn() }));

const CLIPS = 8;

/** Bar|beat starts for CLIPS clips, one per bar from bar 1. */
const starts = Array.from({ length: CLIPS }, (_, i) => `${String(i + 1)}|1`);

/**
 * How many times the call resolved a target of this shape.
 * @param shape - Target shape, indices replaced with `*`
 * @returns Resolution count
 */
function resolves(shape: string): number {
  return liveApiBuildStats().byShape.find(([name]) => name === shape)?.[1] ?? 0;
}

describe("createClip build budget", () => {
  beforeEach(setupArrangementClipMocks);

  it("resolves the destination track once for the whole batch", async () => {
    await createClip({
      path: "t0",
      arrangementStart: starts.join(","),
      notes: "C3 1|1",
    });

    // One track for CLIPS clips. CLIPS + 1 means it was rebuilt per clip.
    expect(resolves("live_set tracks *")).toBe(1);
  });

  it("resolves each destination track once when the batch spans tracks", async () => {
    registerArrangementTrack(1);

    await createClip({
      path: "t0,t1,t0,t1",
      arrangementStart: "1|1,2|1,3|1,4|1",
      notes: "C3 1|1",
    });

    // Two distinct tracks, two objects — not one per position.
    expect(resolves("live_set tracks *")).toBe(2);
  });
});
