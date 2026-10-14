// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  lookupMockObject,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { copyClipToSlot } from "#src/tools/shared/clip/copy-clip-to-slot.ts";
import { recreateClipInSlot } from "#src/tools/shared/clip/recreate-clip.ts";
import { recreateIntoSlot } from "#src/tools/shared/clip/recreate-into-slot.ts";

vi.mock(import("#src/tools/shared/clip/copy-clip-to-slot.ts"), () => ({
  copyClipToSlot: vi.fn(),
}));
vi.mock(import("#src/tools/shared/clip/recreate-clip.ts"), () => ({
  recreateClipInSlot: vi.fn(),
}));

/**
 * A track whose slot 0 holds the clip being replaced, followed by the given
 * slots. Slot 0 is the destination.
 * @param otherSlotHasClip - has_clip for each slot after the destination
 */
function registerTrack(otherSlotHasClip: number[]): void {
  const hasClips = [1, ...otherSlotHasClip];
  const ids = hasClips.map((_, i) => `slot${i}`);

  registerMockObject("track-0", {
    path: livePath.track(0),
    properties: { clip_slots: children(...ids) },
  });

  for (const [sceneIndex, hasClip] of hasClips.entries()) {
    registerMockObject(ids[sceneIndex] as string, {
      path: livePath.track(0).clipSlot(sceneIndex),
      properties: { has_clip: hasClip },
    });
  }

  registerMockObject("live-set", {
    path: livePath.liveSet,
    properties: { scenes: children(...ids) },
  });
}

/**
 * Re-creates a clip into the occupied slot 0, with the copy onto it refused.
 * @returns The call, for expect().toThrow
 */
function recreateWithCopyRefused(): () => void {
  vi.mocked(recreateClipInSlot).mockReturnValue(LiveAPI.from("id built"));
  vi.mocked(copyClipToSlot).mockImplementation(() => {
    throw new Error("Live says no");
  });

  return () =>
    recreateIntoSlot(
      LiveAPI.from("id source"),
      { trackIndex: 0, sceneIndex: 0 },
      LiveAPI.from(livePath.track(0).clipSlot(0)),
      {},
      [],
    );
}

/** Makes Live refuse to delete the clip built in slot 1. */
function refuseDelete(): void {
  (
    lookupMockObject("slot1") as { methods: Record<string, () => void> }
  ).methods.delete_clip = () => {
    throw new Error("delete says no");
  };
}

describe("recreateIntoSlot when the copy onto the destination throws", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes the clip built in a free slot before the throw goes on", () => {
    registerTrack([0]);

    expect(recreateWithCopyRefused()).toThrow("Live says no");
    expect(lookupMockObject("slot1")?.call).toHaveBeenCalledWith("delete_clip");
  });

  it("goes on with the copy's error when the delete throws and the clip is gone", () => {
    mockNonExistentObjects();
    registerTrack([0]);
    refuseDelete();

    expect(recreateWithCopyRefused()).toThrow(/^Live says no$/);
  });

  it("names the clip it couldn't delete, with the copy's error", () => {
    registerTrack([0]);
    refuseDelete();
    registerMockObject("stray", {
      path: livePath.track(0).clipSlot(1).clip(),
      type: "Clip",
    });

    expect(recreateWithCopyRefused()).toThrow(
      "Live says no; couldn't delete the clip built at t0/s1, it is still there",
    );
  });

  it("names the clip when it can't be read back either", () => {
    registerTrack([0]);
    refuseDelete();

    const exists = vi.spyOn(LiveAPI.prototype, "exists");

    exists.mockImplementation(() => {
      throw new Error("read says no");
    });

    expect(recreateWithCopyRefused()).toThrow(
      "Live says no; couldn't delete the clip built at t0/s1, it is still there",
    );
    exists.mockRestore();
  });

  it("removes the temp scene when no slot is free", () => {
    registerTrack([1]);

    const liveSet = lookupMockObject("live-set");

    expect(recreateWithCopyRefused()).toThrow("Live says no");
    expect(liveSet?.call).toHaveBeenCalledWith("create_scene", -1);
    expect(liveSet?.call).toHaveBeenCalledWith("delete_scene", 2);
  });
});
