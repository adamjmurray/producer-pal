// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Budget tests for copying one clip to several destinations in one call.
//
// Every copy re-resolved what the whole batch shares: the slot the clip is read
// from, the clip in it, and the destination track. Copying a clip moves none of
// them, so one object of each serves the call.

import { describe, expect, it } from "vitest";
import { liveApiBuildStats } from "#src/live-api-adapter/live-api-build-stats.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import "../duplicate-mocks-test-helpers.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import {
  registerSessionClipForArrangementDup,
  registerArrangementClip,
} from "#src/tools/actions/duplicate/helpers/duplicate-arrangement-test-helpers.ts";
import { registerMockObject as registerDuplicateMock } from "#src/tools/actions/duplicate/helpers/duplicate-test-helpers.ts";

const COPIES = 6;

/**
 * How many times the call resolved a target of this shape.
 * @param shape - Target shape, indices replaced with `*`
 * @returns Resolution count
 */
function resolves(shape: string): number {
  return liveApiBuildStats().byShape.find(([name]) => name === shape)?.[1] ?? 0;
}

describe("duplicate build budget", () => {
  it("resolves the source slot and the destination track once for a session batch", async () => {
    registerDuplicateMock("clip1", {
      path: livePath.track(0).clipSlot(0).clip(),
      properties: { is_midi_clip: 1 },
    });
    registerDuplicateMock("live_set/tracks/0", {
      path: livePath.track(0),
      properties: { has_midi_input: 1, is_frozen: 0 },
    });
    registerDuplicateMock("live_set/tracks/0/clip_slots/0", {
      path: livePath.track(0).clipSlot(0),
      properties: { has_clip: 1 },
      methods: {
        duplicate_clip_to: () => null,
      },
    });

    for (let scene = 1; scene <= COPIES; scene++) {
      registerMockObject(`live_set/tracks/0/clip_slots/${String(scene)}`, {
        path: livePath.track(0).clipSlot(scene),
        properties: { has_clip: 0 },
      });
    }

    await duplicate({
      type: "clip",
      id: "clip1",
      toPath: Array.from(
        { length: COPIES },
        (_, i) => `t0/s${String(i + 1)}`,
      ).join(","),
    });

    // One source slot and one destination track for the batch. COPIES means
    // they were resolved per copy.
    expect(resolves("live_set tracks * clip_slots *")).toBe(COPIES + 1);
    expect(resolves("live_set tracks *")).toBe(1);
  });

  it("resolves the source clip and the destination track once for an arrangement batch", async () => {
    registerSessionClipForArrangementDup({ is_midi_clip: 1 });

    for (let i = 1; i <= COPIES; i++) {
      registerArrangementClip(0, i, i * 4);
    }

    await duplicate({
      type: "clip",
      id: "clip1",
      arrangementStart: Array.from(
        { length: COPIES },
        (_, i) => `${String(i + 1)}|1`,
      ).join(","),
    });

    // The caller already holds the source clip, so the copies reuse it instead
    // of rebuilding one per position. "clip*" is the source clip's mock id.
    expect(resolves("clip*")).toBe(1);

    // One track for the batch. COPIES means it was resolved per copy.
    expect(resolves("live_set tracks *")).toBe(1);
  });
});
