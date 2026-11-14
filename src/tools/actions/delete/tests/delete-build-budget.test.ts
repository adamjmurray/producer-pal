// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Budget test for a batch clip delete.
//
// Each clip cost three objects: one for the rack-chain check, one for the type
// check, and one to confirm the delete landed. Only the last is unavoidable —
// it has to be a fresh lookup, because the object the delete ran through still
// reports its old id. The track was resolved once per clip on top of that.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolves } from "#src/live-api-adapter/tests/objects/build-budget-resolves.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  registerMockObject,
  simulateMockDeletes,
} from "#src/test/mocks/mock-registry.ts";
import { deleteObject } from "#src/tools/actions/delete/delete.ts";

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  emitWarning: vi.fn(),
}));

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

// A track delete names the clips it removes. It resolves each slot and each
// arrangement clip once, and reads a name only for the clips it prints.
describe("track delete build budget", () => {
  const SLOTS = 3;
  const ARRANGEMENT = 20;
  const shownNames = 10;

  /** @returns How many `name` reads were made on the clip mocks */
  function nameReads(clips: Array<{ get: ReturnType<typeof vi.fn> }>): number {
    return clips
      .flatMap((clip) => clip.get.mock.calls)
      .filter(([property]) => property === "name").length;
  }

  it("resolves each slot and clip once, and reads only the shown names", () => {
    const clips: Array<ReturnType<typeof registerMockObject>> = [];

    simulateMockDeletes();
    registerMockObject("live_set", {
      path: livePath.liveSet,
      properties: { tracks: children("track-0") },
    });
    registerMockObject("track-0", {
      path: livePath.track(0),
      type: "Track",
      properties: {
        clip_slots: children(
          ...Array.from({ length: SLOTS }, (_, i) => `slot${i}`),
        ),
        arrangement_clips: children(
          ...Array.from({ length: ARRANGEMENT }, (_, i) => `arr${i}`),
        ),
      },
    });

    for (let i = 0; i < SLOTS; i++) {
      registerMockObject(`slot${i}`, {
        path: livePath.track(0).clipSlot(i),
        properties: { has_clip: 1 },
      });
      clips.push(
        registerMockObject(`clip${i}`, {
          path: livePath.track(0).clipSlot(i).clip(),
          type: "Clip",
          properties: { name: `S${i}` },
        }),
      );
    }

    for (let i = 0; i < ARRANGEMENT; i++) {
      clips.push(
        registerMockObject(`arr${i}`, {
          path: livePath.track(0).arrangementClip(i),
          type: "Clip",
          properties: { name: `A${i}`, start_time: i * 4 },
        }),
      );
    }

    const { detail } = deleteObject({ type: "track", path: "t0" }) as {
      detail: string;
    };

    expect(detail).toMatch(/^also deleted the 23 clips on this track: /);
    expect(detail).toMatch(/, and 13 more$/);
    // Only what is printed is read: 3 session clips and 7 arrangement ones.
    expect(nameReads(clips)).toBe(shownNames);
    // One resolve per slot, per session clip and per arrangement clip.
    expect(resolves("id slot*")).toBe(SLOTS);
    expect(resolves("live_set tracks * clip_slots * clip")).toBe(SLOTS);
    expect(resolves("id arr*")).toBe(ARRANGEMENT);
    // The song meter is read once for all the arrangement clips, plus the
    // delete's own Live Set.
    expect(resolves("live_set")).toBe(2);
  });
});
