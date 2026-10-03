// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Budget test for creating several arrangement clips on a lane that already
// holds clips.
//
// Live lays a new clip over whatever the lane held, so the call says afterwards
// what each clip cost. The lane is read once for the call and kept true as it
// writes; a scan before and after every clip would cost clips x lane objects.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { liveApiBuildStats } from "#src/live-api-adapter/live-api-build-stats.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { createNoteTrackingMethods } from "#src/test/helpers/mock-registry-test-helpers.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  lookupMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { createClip } from "#src/tools/clip/create/create-clip.ts";

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  warn: vi.fn(),
  warnOnce: vi.fn(),
}));

/** Clips already on the lane, well clear of where the call writes. */
const EXISTING = 10;

/** Clips the call creates, one per bar from bar 1. */
const CREATED = 8;

/** The ids on the lane now, in Live's order. */
let laneIds: string[];

/** Which create_midi_clip call (0-based) adds its clip, then fails. */
let failingCall: number | null;

/** The track's properties, which the registry reads through as they change. */
const trackProperties: Record<string, unknown> = {};

/** Put the lane's clip list in the track, where the next read finds it. */
function publishLane(): void {
  trackProperties.arrangement_clips = children(...laneIds);
}

/**
 * @param id - A clip on the lane
 * @param start - Where a new 4-beat clip begins
 * @returns Whether the new clip lays over it
 */
function coveredBy(id: string, start: number): boolean {
  const clip = lookupMockObject(id);
  const at = Number(clip?.properties.start_time);

  return at < start + 4 && at + 4 > start;
}

/** A lane holding EXISTING clips from bar 21 on, and a track that adds clips. */
function setupLane(): void {
  registerMockObject("live-set", {
    path: livePath.liveSet,
    properties: {
      signature_numerator: 4,
      signature_denominator: 4,
      scale_mode: 0,
    },
  });
  laneIds = [];
  failingCall = null;

  for (let i = 0; i < EXISTING; i++) {
    const id = `existing_${String(i)}`;
    const start = (20 + i) * 4;

    registerMockObject(id, {
      path: livePath.track(0).arrangementClip(i),
      type: "Clip",
      properties: { start_time: start, end_time: start + 4, length: 4 },
    });
    laneIds.push(id);
  }

  let made = 0;

  registerMockObject("track-0", {
    path: livePath.track(0),
    properties: trackProperties,
    methods: {
      create_midi_clip: (start) => {
        const id = `created_${String(made++)}`;

        registerMockObject(id, {
          path: livePath.track(0).arrangementClip(laneIds.length),
          type: "Clip",
          properties: {
            start_time: start,
            end_time: Number(start) + 4,
            length: 4,
          },
          methods: createNoteTrackingMethods(),
        });
        // Live lays the clip over whatever it covers.
        laneIds = laneIds.filter((other) => !coveredBy(other, Number(start)));
        laneIds.push(id);
        publishLane();

        if (made - 1 === failingCall) {
          throw new Error("Live refused");
        }

        return ["id", id];
      },
    },
  });
  publishLane();
}

/**
 * Create CREATED clips in one call, one per bar.
 * @returns The call's result
 */
async function createBatch(): Promise<unknown> {
  return await createClip({
    path: "t0",
    arrangementStart: Array.from(
      { length: CREATED },
      (_, i) => `${String(i + 1)}|1`,
    ).join(","),
    notes: "C3 1|1",
  });
}

/**
 * How many times the call built a clip that was on the lane to begin with.
 * @returns Resolutions of the existing clips, summed
 */
function existingClipReads(): number {
  return liveApiBuildStats()
    .byShape.filter(([shape]) => shape.startsWith("id existing_"))
    .reduce((sum, [, count]) => sum + count, 0);
}

describe("createClip lane build budget", () => {
  beforeEach(setupLane);

  // A scan of the lane per clip would read every existing clip CREATED times.
  it("reads each clip already on the lane once, however many it creates", async () => {
    await createBatch();

    expect(existingClipReads()).toBe(EXISTING);
  });

  it("reads the lane no more often for a longer batch", async () => {
    const start = Array.from({ length: CREATED * 2 }, (_, i) => `${i + 1}|1`);

    await createClip({
      path: "t0",
      arrangementStart: start.join(","),
      notes: "C3 1|1",
    });

    expect(existingClipReads()).toBe(EXISTING);
  });

  // Live made the second clip, then failed. The call can't see that clip, so
  // what it knew of the lane is no good: the third clip lands over a clip the
  // lane view would otherwise never have heard of, and must still say so.
  it("re-reads the lane after a create that failed once Live had changed it", async () => {
    failingCall = 1;
    // A clip at bar 3 for the third create to land over.
    registerMockObject("bar3", {
      path: livePath.track(0).arrangementClip(EXISTING),
      type: "Clip",
      properties: { start_time: 8, end_time: 12, length: 4 },
    });
    laneIds.push("bar3");
    publishLane();

    const result = (await createClip({
      path: "t0",
      arrangementStart: "1|1,2|1,3|1",
      notes: "C3 1|1",
    })) as { id: string; path?: string; detail?: string }[];

    expect(result.map((entry) => entry.path)).toStrictEqual([
      "t0[1|1]",
      "t0[2|1]",
      "t0[3|1]",
    ]);
    expect(result[2]?.detail).toContain("overwrote the clip at t0[3|1]");
    // The failure forgot the lane once, so the existing clips were read twice
    // in all: not once per clip.
    expect(existingClipReads()).toBe(EXISTING * 2);
  });
});
