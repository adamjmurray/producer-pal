// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
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

describe("updateClip - transforms (single string, broadcast across ids)", () => {
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

  it("applies a transform string to one clip", async () => {
    const result = await updateClip({
      id: "123",
      transforms: "velocity = 50",
    });

    expect(result).toStrictEqual({
      id: "123",
      path: "t0/s0",
      noteCount: 1,
      transformed: 1,
    });
    expect(addedVelocity(mocks.clip123)).toBe(50);
  });

  it("broadcasts one transform string across multiple clips", async () => {
    await updateClip({
      id: "123, 456",
      transforms: "velocity = 42",
    });

    expect(addedVelocity(mocks.clip123)).toBe(42);
    expect(addedVelocity(mocks.clip456)).toBe(42);
  });

  it("supports multiple expressions via newline separation", async () => {
    await updateClip({
      id: "123",
      transforms: "velocity = 60\nvelocity += 10",
    });

    expect(addedVelocity(mocks.clip123)).toBe(70);
  });

  it("exposes clip.index/clip.count across the full set (clipseq trap)", async () => {
    // velocity = clip.index*20 + clip.count. With 3 clips, clip.count MUST be 3
    // for every clip (a naive per-clip updateClip call would see count = 1).
    // Values stay <=127 so velocity clamping doesn't mask the assertion.
    await updateClip({
      id: "123, 456, 789",
      transforms: "velocity = clip.index * 20 + clip.count",
    });

    expect(addedVelocity(mocks.clip123)).toBe(3); // 0*20 + 3
    expect(addedVelocity(mocks.clip456)).toBe(23); // 1*20 + 3
    expect(addedVelocity(mocks.clip789)).toBe(43); // 2*20 + 3
  });

  it("warns and continues when a transform string is malformed", async () => {
    await updateClip({
      id: "123, 456, 789",
      transforms: "!!!bad!!!",
    });

    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("Failed to update clip 123"),
    );
  });
});
