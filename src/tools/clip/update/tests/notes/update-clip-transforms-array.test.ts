// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  mockMergeNoteTracking,
  setupMidiClipMock,
  setupUpdateClipMocks,
  type UpdateClipMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";

const C3 = {
  pitch: 60,
  start_time: 0,
  duration: 1,
  velocity: 100,
  probability: 1,
  velocity_deviation: 0,
};

/**
 * Read back the velocity of the single note added to a clip via add_new_notes.
 * @param clip - Registered mock clip
 * @returns The velocity of the first added note
 */
function addedVelocity(clip: UpdateClipMocks["clip123"]): number {
  const calls = clip.call.mock.calls.filter(
    (c: unknown[]) => c[0] === "add_new_notes",
  );
  const last = calls.at(-1) as [string, { notes: { velocity: number }[] }];

  return last[1].notes[0]?.velocity as number;
}

describe("updateClip - transforms array (per-clip cycling)", () => {
  let mocks: UpdateClipMocks;

  beforeEach(() => {
    mocks = setupUpdateClipMocks();
    setupMidiClipMock(mocks.clip123, { length: 4 });
    setupMidiClipMock(mocks.clip456, { length: 4 });
    setupMidiClipMock(mocks.clip789, { is_arrangement_clip: 1, length: 4 });
    mockMergeNoteTracking(mocks.clip123, [{ ...C3 }]);
    mockMergeNoteTracking(mocks.clip456, [{ ...C3 }]);
    mockMergeNoteTracking(mocks.clip789, [{ ...C3 }]);
  });

  it("applies a single-element transform array to one clip", async () => {
    const result = await updateClip({
      ids: "123",
      transforms: ["velocity = 50"],
    });

    expect(result).toStrictEqual({ id: "123", noteCount: 1, transformed: 1 });
    expect(addedVelocity(mocks.clip123)).toBe(50);
  });

  it("cycles a single-element array across multiple clips (modulo)", async () => {
    await updateClip({
      ids: "123, 456",
      transforms: ["velocity = 42"],
    });

    expect(addedVelocity(mocks.clip123)).toBe(42);
    expect(addedVelocity(mocks.clip456)).toBe(42);
  });

  it("applies distinct per-clip entries when the array matches ids", async () => {
    await updateClip({
      ids: "123, 456",
      transforms: ["velocity = 10", "velocity = 20"],
    });

    expect(addedVelocity(mocks.clip123)).toBe(10);
    expect(addedVelocity(mocks.clip456)).toBe(20);
  });

  it("cycles via modulo when there are more clips than entries", async () => {
    await updateClip({
      ids: "123, 456, 789",
      transforms: ["velocity = 11", "velocity = 22"],
    });

    // 3 clips, 2 entries → 11, 22, 11 (clip index 2 % 2 = 0)
    expect(addedVelocity(mocks.clip123)).toBe(11);
    expect(addedVelocity(mocks.clip456)).toBe(22);
    expect(addedVelocity(mocks.clip789)).toBe(11);
  });

  it("warns when more transform entries are given than clips", async () => {
    await updateClip({
      ids: "123",
      transforms: ["velocity = 1", "velocity = 2"],
    });

    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining(
        "updateClip: 2 transforms provided but only 1 clips — ignoring extra",
      ),
    );
  });

  it("keeps clip.index/clip.count correct across the full set (seq trap)", async () => {
    // velocity = clip.index*20 + clip.count. With 3 clips, clip.count MUST be 3
    // for every clip (a naive per-clip updateClip call would see count = 1).
    // Values stay <=127 so velocity clamping doesn't mask the assertion.
    await updateClip({
      ids: "123, 456, 789",
      transforms: ["velocity = clip.index * 20 + clip.count"],
    });

    expect(addedVelocity(mocks.clip123)).toBe(3); // 0*20 + 3
    expect(addedVelocity(mocks.clip456)).toBe(23); // 1*20 + 3
    expect(addedVelocity(mocks.clip789)).toBe(43); // 2*20 + 3
  });

  it("does not transform when transforms array is empty", async () => {
    await updateClip({ ids: "123", transforms: [] });

    expect(mocks.clip123.call).not.toHaveBeenCalledWith(
      "add_new_notes",
      expect.anything(),
    );
    expect(vi.mocked(outlet)).not.toHaveBeenCalledWith(
      1,
      expect.stringContaining("transforms provided but only"),
    );
  });
});
