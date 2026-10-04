// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  registerMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { MAX_ARRANGEMENT_POSITION_BEATS } from "#src/tools/constants.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";

/**
 * One arrangement MIDI clip on its own track.
 * @param trackIndex - The track it sits on
 * @returns The track mock, which records the move calls
 */
function setupClipOnTrack(trackIndex: number): RegisteredMockObject {
  registerMockObject(`10${trackIndex}`, {
    path: livePath.track(trackIndex).arrangementClip(0),
    type: "Clip",
    properties: {
      is_arrangement_clip: 1,
      is_midi_clip: 1,
      start_time: 0,
      end_time: 16,
      signature_numerator: 4,
      signature_denominator: 4,
      trackIndex,
    },
  });

  return registerMockObject(`track-${trackIndex}`, {
    path: livePath.track(trackIndex),
    type: "Track",
    properties: { track_index: trackIndex },
    methods: {
      duplicate_clip_to_arrangement: () => `id moved-${trackIndex}`,
      create_midi_clip: () => `id temp-${trackIndex}`,
      delete_clip: () => null,
    },
  });
}

/**
 * Whether a track was asked to move anything.
 * @param track - The track mock
 * @returns True when a move or delete reached it
 */
function touched(track: RegisteredMockObject): boolean {
  return vi.mocked(track.call).mock.calls.length > 0;
}

describe("updateClip - arrangement positions past the last Live allows", () => {
  let tracks: RegisteredMockObject[];

  beforeEach(() => {
    registerMockObject("live-set", {
      path: livePath.liveSet,
      type: "Song",
      properties: { signature_numerator: 4, signature_denominator: 4 },
    });
    tracks = [0, 1].map(setupClipOnTrack);
  });

  it("refuses the call before any clip moves when the last position is past it", async () => {
    await expect(
      updateClip({ id: "100,101", arrangementStart: "5|1,394202|1" }),
    ).rejects.toThrow(
      "arrangementStart is past the last position Live allows (394201|1)",
    );

    expect(tracks.some(touched)).toBe(false);
  });

  it("names toPath when the position was written there", async () => {
    await expect(
      updateClip({ id: "100,101", toPath: "t0[5|1],t1[394202|1]" }),
    ).rejects.toThrow("toPath is past the last position Live allows");

    expect(tracks.some(touched)).toBe(false);
  });

  it("moves a clip to the last position Live takes", async () => {
    await updateClip({ id: "100", arrangementStart: "394201|1" });

    expect(tracks[0]?.call).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      expect.anything(),
      MAX_ARRANGEMENT_POSITION_BEATS,
    );
  });
});
