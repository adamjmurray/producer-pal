// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// The `scale:mask` transform variable, so snap() and step(), follow the scale
// of the clip being edited, not the Live Set's.

import { beforeEach, describe, expect, it } from "vitest";
import {
  mockMergeNoteTracking,
  setupMidiClipMock,
  setupUpdateClipMocks,
  type UpdateClipMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import {
  C_MAJOR_INTERVALS,
  LIVE_WITH_CLIP_SCALE,
  LIVE_WITHOUT_CLIP_SCALE,
  registerLiveVersion,
  registerSongScale,
} from "#src/tools/shared/schema/scale/tests/scale-test-helpers.ts";

const C_MINOR_PENTATONIC = [0, 3, 5, 7, 10];
const C_SHARP_3 = {
  pitch: 61,
  start_time: 0,
  duration: 1,
  velocity: 100,
  probability: 1,
  velocity_deviation: 0,
};
const SNAP = "pitch = snap(note.pitch)";

/**
 * The pitch of the first note added to a clip.
 * @param clip - Registered mock clip
 * @returns The pitch
 */
function addedPitch(clip: UpdateClipMocks["clip123"]): number {
  const calls = clip.call.mock.calls.filter(([m]) => m === "add_new_notes");
  const last = calls.at(-1) as [string, { notes: { pitch: number }[] }];

  return last[1].notes[0]?.pitch as number;
}

/**
 * Set a clip up with a scale of its own and one out-of-scale note.
 * @param clip - Registered mock clip
 * @param scale - The scale properties it holds; `scale_intervals` is a list
 */
function clipWithScale(
  clip: UpdateClipMocks["clip123"],
  scale: Record<string, unknown> & { scale_intervals?: number[] },
): void {
  const { scale_intervals: intervals, ...rest } = scale;

  setupMidiClipMock(clip, { length: 4, ...rest });
  mockMergeNoteTracking(clip, [C_SHARP_3]);

  // Live answers a list property with the list itself, not one value.
  const get = clip.get.getMockImplementation() as (prop: string) => unknown[];

  clip.get.mockImplementation((prop: string) =>
    prop === "scale_intervals" && intervals != null ? intervals : get(prop),
  );
}

describe("updateClip - transforms follow the clip's own scale", () => {
  let mocks: UpdateClipMocks;

  beforeEach(() => {
    registerLiveVersion(LIVE_WITH_CLIP_SCALE);
    // C major would send C# up to D; the clip's pentatonic sends it down to C.
    registerSongScale({ scale_mode: 1, scale_intervals: C_MAJOR_INTERVALS });
    mocks = setupUpdateClipMocks();
  });

  it("snaps to the clip's scale, not the Live Set's", async () => {
    clipWithScale(mocks.clip123, {
      scale_mode: 1,
      root_note: 0,
      scale_intervals: C_MINOR_PENTATONIC,
    });

    await updateClip({ id: "123", transforms: SNAP });

    expect(addedPitch(mocks.clip123)).toBe(60);
  });

  it("does not snap a clip whose scale is off, though the Live Set's is on", async () => {
    clipWithScale(mocks.clip123, {
      scale_mode: 0,
      scale_intervals: C_MINOR_PENTATONIC,
    });

    await updateClip({ id: "123", transforms: SNAP });

    expect(addedPitch(mocks.clip123)).toBe(61);
  });

  it("does not snap to a chromatic clip scale", async () => {
    clipWithScale(mocks.clip123, {
      scale_mode: 1,
      root_note: 0,
      scale_intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    });

    await updateClip({ id: "123", transforms: SNAP });

    expect(addedPitch(mocks.clip123)).toBe(61);
  });

  it("snaps to the scale the same call writes", async () => {
    // The clip reads its scale off until the call turns it on.
    clipWithScale(mocks.clip123, {
      scale_mode: 0,
      root_note: 0,
      scale_intervals: C_MINOR_PENTATONIC,
    });

    await updateClip({
      id: "123",
      scale: "C Minor Pentatonic",
      transforms: SNAP,
    });

    expect(addedPitch(mocks.clip123)).toBe(60);
  });

  it("does not snap when the same call turns the clip's scale off", async () => {
    clipWithScale(mocks.clip123, {
      scale_mode: 1,
      root_note: 0,
      scale_intervals: C_MINOR_PENTATONIC,
    });

    await updateClip({ id: "123", scale: "", transforms: SNAP });

    expect(addedPitch(mocks.clip123)).toBe(61);
  });

  it("snaps a preTransform and merged notes to the clip's scale too", async () => {
    clipWithScale(mocks.clip123, {
      scale_mode: 1,
      root_note: 0,
      scale_intervals: C_MINOR_PENTATONIC,
    });

    await updateClip({ id: "123", preTransforms: SNAP });

    expect(addedPitch(mocks.clip123)).toBe(60);

    await updateClip({ id: "123", notes: "1|1 C#3", transforms: SNAP });

    expect(addedPitch(mocks.clip123)).toBe(60);
  });

  it("snaps each clip of a call to its own scale", async () => {
    clipWithScale(mocks.clip123, {
      scale_mode: 1,
      root_note: 0,
      scale_intervals: C_MINOR_PENTATONIC,
    });
    clipWithScale(mocks.clip456, {
      scale_mode: 1,
      root_note: 0,
      scale_intervals: C_MAJOR_INTERVALS,
    });

    await updateClip({ id: "123,456", transforms: SNAP });

    expect(addedPitch(mocks.clip123)).toBe(60);
    expect(addedPitch(mocks.clip456)).toBe(62);
  });

  it("snaps a doubled loop's notes to the clip's scale", async () => {
    clipWithScale(mocks.clip123, {
      scale_mode: 1,
      root_note: 0,
      scale_intervals: C_MINOR_PENTATONIC,
    });

    await updateClip({
      id: "123",
      duplicateLoop: true,
      preTransforms: SNAP,
      transforms: SNAP,
    });

    expect(addedPitch(mocks.clip123)).toBe(60);
  });

  it("uses the Live Set's scale for an audio clip's transforms", async () => {
    // Nothing to snap on audio; the context is still built and must not fail.
    setupMidiClipMock(mocks.clip123, { is_midi_clip: 0, is_audio_clip: 1 });

    await expect(
      updateClip({ id: "123", transforms: "gain = -6" }),
    ).resolves.toMatchObject({ id: "123" });
  });

  describe("on a Live whose clips have no scale", () => {
    beforeEach(() => {
      registerLiveVersion(LIVE_WITHOUT_CLIP_SCALE);
    });

    it("falls back to the Live Set's scale", async () => {
      clipWithScale(mocks.clip123, {
        scale_mode: 1,
        root_note: 0,
        scale_intervals: C_MINOR_PENTATONIC,
      });

      await updateClip({ id: "123", transforms: SNAP });

      expect(addedPitch(mocks.clip123)).toBe(62);
    });
  });
});
