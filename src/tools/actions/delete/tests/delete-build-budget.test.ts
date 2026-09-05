// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Budget test for a batch clip delete.
//
// Each clip cost three objects: one for the rack-chain check, one for the type
// check, and one to confirm the delete landed. Only the last is unavoidable —
// it has to be a fresh lookup, because the object the delete ran through still
// reports its old id. The track was resolved once per clip on top of that.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { liveApiBuildStats } from "#src/live-api-adapter/live-api-build-stats.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { deleteObject } from "#src/tools/actions/delete/delete.ts";

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({ warn: vi.fn() }));

const CLIPS = 6;
const clipIds = Array.from({ length: CLIPS }, (_, i) => String(101 + i));

/** One track holding CLIPS session clips. */
function setupClips(): void {
  registerMockObject("track-0", {
    path: livePath.track(0),
    properties: {
      clip_slots: children(...clipIds.map((_, i) => `slot${String(i)}`)),
    },
  });

  for (const [i, clipId] of clipIds.entries()) {
    registerMockObject(clipId, {
      path: livePath.track(0).clipSlot(i).clip(),
      type: "Clip",
      properties: { is_arrangement_clip: 0 },
    });
  }
}

/**
 * How many times the call resolved a target of this shape.
 * @param shape - Target shape, indices replaced with `*`
 * @returns Resolution count
 */
function resolves(shape: string): number {
  return liveApiBuildStats().byShape.find(([name]) => name === shape)?.[1] ?? 0;
}

describe("delete build budget", () => {
  beforeEach(setupClips);

  it("resolves each clip twice and the track once", () => {
    deleteObject({ type: "clip", id: clipIds.join(",") });

    // Two per clip: the checks share one object, and confirming the delete
    // needs its own fresh lookup.
    expect(resolves("id *")).toBe(CLIPS * 2);

    // One track for the batch. CLIPS means it was resolved per clip.
    expect(resolves("live_set tracks *")).toBe(1);
  });
});
