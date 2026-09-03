// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { children } from "#src/test/mocks/mock-live-api-property-helpers.ts";
import {
  clearMockRegistry,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { clipIdPerPath, clipIdsAtPaths } from "../clip-path-lookup.ts";

/**
 * Fills a clip slot.
 * @param trackIndex - 0-based track index
 * @param sceneIndex - 0-based scene index
 * @param id - The clip's id
 */
function registerClipAt(
  trackIndex: number,
  sceneIndex: number,
  id: string,
): void {
  registerMockObject(id, {
    path: livePath.track(trackIndex).clipSlot(sceneIndex).clip(),
  });
}

/**
 * Puts a clip on a track's main arrangement lane.
 * @param trackIndex - 0-based track index
 * @param startTime - Where the clip starts, in Ableton beats
 * @param id - The clip's id
 */
function registerArrangementClipAt(
  trackIndex: number,
  startTime: number,
  id: string,
): void {
  registerMockObject(id, {
    path: livePath.track(trackIndex).arrangementClip(0),
    properties: { start_time: startTime },
  });
  registerMockObject(`track_${String(trackIndex)}`, {
    path: livePath.track(trackIndex),
    type: "Track",
    properties: { arrangement_clips: children(id) },
  });
}

describe("clipIdsAtPaths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
    mockNonExistentObjects();
  });

  it("resolves clip slots to the clips sitting there", () => {
    registerClipAt(0, 1, "clip_a");
    registerClipAt(2, 3, "clip_b");

    expect(clipIdsAtPaths("t0/s1,t2/s3", "updateClip")).toStrictEqual([
      "clip_a",
      "clip_b",
    ]);
  });

  it("returns nothing for an empty param", () => {
    expect(clipIdsAtPaths("", "updateClip")).toStrictEqual([]);
  });

  // One bad entry costs its own clip, not the whole batch — the same deal ids
  // already get from skipInvalid.
  it("warns and skips an empty slot, keeping the rest", () => {
    const warn = vi.spyOn(console, "warn");

    registerClipAt(2, 3, "clip_b");

    expect(clipIdsAtPaths("t0/s1,t2/s3", "updateClip")).toStrictEqual([
      "clip_b",
    ]);
    expect(warn).toHaveBeenCalledWith('updateClip: no clip at path "t0/s1"');
  });

  // A bare track names every clip in its arrangement, so it is refused as a
  // source and the message shows the complete form.
  it("warns and skips an entry that names more than one clip", () => {
    const warn = vi.spyOn(console, "warn");

    registerClipAt(2, 3, "clip_b");

    expect(clipIdsAtPaths("t0,t2/s3", "delete")).toStrictEqual(["clip_b"]);
    expect(warn).toHaveBeenCalledWith(
      'delete: invalid path "t0" - a track\'s arrangement holds many clips; ' +
        'name the one to act on by where it starts, as "t0[5|1]"',
    );
  });

  // 4/4, so bar 5 is beat 16.
  it("resolves a complete arrangement path to the clip starting there", () => {
    registerArrangementClipAt(0, 16, "clip_arr");

    expect(clipIdsAtPaths("t0[5|1]", "updateClip")).toStrictEqual(["clip_arr"]);
  });

  it("warns and skips an arrangement path where no clip starts", () => {
    const warn = vi.spyOn(console, "warn");

    registerArrangementClipAt(0, 16, "clip_arr");

    expect(clipIdsAtPaths("t0[9|1]", "updateClip")).toStrictEqual([]);
    expect(warn).toHaveBeenCalledWith('updateClip: no clip at path "t0[9|1]"');
  });

  it("refuses a param that names no clip at all", () => {
    // A list that names nothing is malformed structure, so it is refused
    // before anything runs — the same as `id: ","`. Nothing is lost by
    // throwing: the caller drops the stray comma and retries.
    expect(() => clipIdsAtPaths(",", "updateClip")).toThrow(
      'invalid path "," - it names nothing',
    );
  });

  it("names the caller's param in warnings", () => {
    const warn = vi.spyOn(console, "warn");

    clipIdsAtPaths("t0/s1", "updateClip", "clipPath");

    expect(warn).toHaveBeenCalledWith(
      'updateClip: no clip at clipPath "t0/s1"',
    );
  });
});

describe("clipIdPerPath", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
    mockNonExistentObjects();
  });

  // Slots and arrangement positions mix in one list, and an entry that names
  // nothing keeps its place so a paired list stays aligned.
  it("keeps one entry per path across both kinds of location", () => {
    registerClipAt(1, 1, "clip_slot");
    registerArrangementClipAt(0, 16, "clip_arr");

    expect(clipIdPerPath("t0[5|1],t0,t1/s1", "updateClip")).toStrictEqual([
      "clip_arr",
      null,
      "clip_slot",
    ]);
  });
});
