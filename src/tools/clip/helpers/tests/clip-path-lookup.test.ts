// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  clearMockRegistry,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { clipIdsAtPaths } from "../clip-path-lookup.ts";

/**
 * Put a clip in a session slot.
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

describe("clipIdsAtPaths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
    mockNonExistentObjects();
  });

  it("resolves session positions to the clips sitting there", () => {
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

  it("warns and skips an entry that names no session position", () => {
    const warn = vi.spyOn(console, "warn");

    registerClipAt(2, 3, "clip_b");

    expect(clipIdsAtPaths("t0,t2/s3", "delete")).toStrictEqual(["clip_b"]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("a track has no one clip"),
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
