// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { requireMockTrack } from "#src/test/helpers/mock-registry-test-helpers.ts";
import {
  registerMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";
import * as scratchClips from "#src/tools/shared/arrangement/helpers/arrangement-tiling-clips.ts";
import {
  makeResizable,
  setupResizableClip,
} from "#src/tools/clip/update/helpers/arrangement/resizable-clip-test-helpers.ts";
import {
  setupMidiClipMock,
  type UpdateClipMocks,
  setupArrangementClipPath,
  setupMockProperties,
  setupUpdateClipMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";

/** A 4-bar arrangement clip at beat 0 looping over its first bar. */
const FOUR_BAR_LOOPED = { end_time: 16 } as const;

/**
 * A 4-bar clip 789 on track 0 whose move to bar 9 lands as clip 999.
 * @returns The source clip, the track mock, the moved clip's id, and the
 *   source's span when the move copied it
 */
function setupMoveThenResize(): {
  sourceClip: RegisteredMockObject;
  track: RegisteredMockObject;
  movedClipId: string;
  spanAtCopy: () => number | undefined;
} {
  const movedClipId = "999";
  const clips = setupArrangementClipPath(0, ["789", movedClipId]);
  const track = requireMockTrack(0);
  const sourceClip = clips.get("789") as RegisteredMockObject;
  const copy = track.methods.duplicate_clip_to_arrangement as (
    ...args: unknown[]
  ) => unknown;
  let spanAtCopy: number | undefined;

  makeResizable(sourceClip, FOUR_BAR_LOOPED);
  makeResizable(clips.get(movedClipId) as RegisteredMockObject);

  track.methods.duplicate_clip_to_arrangement = (...args: unknown[]) => {
    spanAtCopy =
      Number(sourceClip.properties.end_time) -
      Number(sourceClip.properties.start_time);

    return copy(...args);
  };

  return { sourceClip, track, movedClipId, spanAtCopy: () => spanAtCopy };
}

/**
 * Make every write to a clip throw, as Live does when it refuses one.
 * @param clip - The clip
 */
function refuseWrites(clip: RegisteredMockObject): void {
  clip.set.mockImplementation(() => {
    throw new Error("Live refused the write");
  });
}

describe("updateClip - arrangementLength (shortening only)", () => {
  let defaultMocks: UpdateClipMocks;

  beforeEach(() => {
    defaultMocks = setupUpdateClipMocks();
  });

  it("shortens a looped clip in place, keeping its loop", async () => {
    const { sourceClip, track } = setupResizableClip(FOUR_BAR_LOOPED);

    const result = await updateClip({ id: "789", arrangementLength: "2bar" });

    expect(result).toStrictEqual({ id: "789", path: "t0[1|1]" });
    expect(sourceClip.properties).toStrictEqual(
      expect.objectContaining({
        end_time: 8,
        looping: 1,
        loop_start: 0,
        loop_end: 4,
      }),
    );
    // No temp clip: the clip is cut where it stands.
    expect(track.call).not.toHaveBeenCalled();
  });

  it("shortens an unlooped clip to a single beat", async () => {
    const { sourceClip } = setupResizableClip({
      end_time: 16,
      looping: 0,
      loop_end: 16,
      end_marker: 16,
    });

    const result = await updateClip({ id: "789", arrangementLength: "n/4" });

    expect(result).toStrictEqual({ id: "789", path: "t0[1|1]" });
    expect(sourceClip.properties).toStrictEqual(
      expect.objectContaining({ end_time: 1, loop_end: 1, end_marker: 1 }),
    );
  });

  // Nothing else was asked of it, so the lone target's reason is the error.
  it("refuses an arrangementLength aimed at a session clip", async () => {
    const track = registerMockObject("track-0-session-noop", {
      path: livePath.track(0),
      type: "Track",
    });

    setupMidiClipMock(defaultMocks.clip123, {
      is_arrangement_clip: 0, // Session clip
      is_midi_clip: 1,
      signature_numerator: 4,
      signature_denominator: 4,
    });

    await expect(
      updateClip({ id: "123", arrangementLength: "2bar" }),
    ).rejects.toThrow("arrangementLength ignored: this is a session clip");
    expect(track.call).not.toHaveBeenCalled();
  });

  // With a name to write, the name lands, so the clip keeps a real entry and
  // carries the reason on it.
  it("reports it on the entry when something else the call asked for lands", async () => {
    setupMidiClipMock(defaultMocks.clip123, {
      is_arrangement_clip: 0, // Session clip
      is_midi_clip: 1,
      signature_numerator: 4,
      signature_denominator: 4,
    });

    const result = await updateClip({
      id: "123",
      arrangementLength: "2bar",
      name: "Renamed Anyway",
    });

    expect(result).toStrictEqual({
      id: "123",
      path: "t0/s0",
      detail: "arrangementLength ignored: this is a session clip",
    });
  });

  it("should handle zero length with clear error", async () => {
    setupMockProperties(defaultMocks.clip789, {
      is_arrangement_clip: 1,
      is_midi_clip: 1,
      start_time: 0,
      end_time: 16,
    });

    await expect(
      updateClip({
        id: "789",
        arrangementLength: "0bar",
      }),
    ).rejects.toThrow('arrangementLength "0bar" must be longer than zero');
  });

  it("leaves the clip as it is when the length is unchanged", async () => {
    const { sourceClip } = setupResizableClip(FOUR_BAR_LOOPED);

    const result = await updateClip({ id: "789", arrangementLength: "4bar" });

    expect(sourceClip.set).not.toHaveBeenCalled();
    expect(result).toStrictEqual({ id: "789", path: "t0[1|1]" });
  });

  it("shortens before moving when a call both moves and shortens", async () => {
    // Moving first would copy all 4 bars to bar 9 and clear bars 9-13 there,
    // then cut the copy back to 2 bars, leaving bars 11-13 empty.
    const { track, movedClipId, spanAtCopy } = setupMoveThenResize();

    const result = await updateClip({
      id: "789",
      arrangementLength: "2bar",
      arrangementStart: "9|1",
    });

    // The source was already cut to 2 bars when the move copied it.
    expect(spanAtCopy()).toBe(8);
    expect(track.call).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id 789",
      32.0, // bar 9 in 4/4 = 32 beats
    );
    expect(track.call).toHaveBeenCalledWith("delete_clip", "id 789");
    expect(result).toStrictEqual({ id: movedClipId, path: "t0[9|1]" });
  });

  // Shortening runs first, so a throw there leaves the clip unmoved.
  it("doesn't move the clip when the shortening before the move throws", async () => {
    const { sourceClip, track } = setupMoveThenResize();

    refuseWrites(sourceClip);

    await expect(
      updateClip({
        id: "789",
        arrangementLength: "2bar",
        arrangementStart: "9|1",
      }),
    ).rejects.toThrow("Live refused the write");
    expect(track.call).not.toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      expect.anything(),
      expect.anything(),
    );
  });

  it("still refuses a resize that throws when no move landed", async () => {
    const { sourceClip } = setupResizableClip(FOUR_BAR_LOOPED);

    refuseWrites(sourceClip);

    await expect(
      updateClip({ id: "789", arrangementLength: "2bar" }),
    ).rejects.toThrow("Live refused the write");
  });

  it("shortens an audio clip in place, with no scratch clip", async () => {
    const createAudioClip = vi.spyOn(scratchClips, "createAudioClipInSession");
    const { sourceClip, track } = setupResizableClip({
      ...FOUR_BAR_LOOPED,
      is_midi_clip: 0,
      is_audio_clip: 1,
      warping: 1,
    });

    const result = await updateClip(
      { id: "789", arrangementLength: "2bar" },
      { silenceWavPath: "/path/to/silence.wav" },
    );

    expect(result).toStrictEqual({ id: "789", path: "t0[1|1]" });
    expect(sourceClip.properties.end_time).toBe(8);
    expect(createAudioClip).not.toHaveBeenCalled();
    expect(track.call).not.toHaveBeenCalled();
    createAudioClip.mockRestore();
  });
});
