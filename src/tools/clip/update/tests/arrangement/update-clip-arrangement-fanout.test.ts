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
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

/**
 * One 4-bar arrangement MIDI clip on its own track, so a move can't collide
 * with a sibling.
 * @param trackIndex - The track it sits on
 * @returns The track mock, which records the move calls
 */
function setupClipOnTrack(trackIndex: number): RegisteredMockObject {
  registerMockObject(clipId(trackIndex), {
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
 * Where a track's move landed, or null when nothing moved.
 * @param track - The track mock
 * @returns The target position in beats
 */
function movedTo(track: RegisteredMockObject): number | null {
  const call = vi
    .mocked(track.call)
    .mock.calls.find(([method]) => method === "duplicate_clip_to_arrangement");

  return call == null ? null : (call[2] as number);
}

/**
 * The clip id for a track. Not "0": Live reads id 0 as no object at all.
 * @param trackIndex - The track the clip sits on
 * @returns The clip id
 */
function clipId(trackIndex: number): string {
  return `10${trackIndex}`;
}

describe("updateClip - arrangement params per clip", () => {
  let tracks: RegisteredMockObject[];

  beforeEach(() => {
    registerMockObject("live-set", { path: "live_set", type: "Song" });
    tracks = [0, 1, 2].map(setupClipOnTrack);
  });

  it("moves every clip when one position is given", async () => {
    await updateClip({ id: "100,101,102", arrangementStart: "5|1" });

    expect(tracks.map(movedTo)).toStrictEqual([16, 16, 16]);
  });

  it("gives each clip its own position", async () => {
    await updateClip({ id: "100,101,102", arrangementStart: "5|1,9|1,13|1" });

    expect(tracks.map(movedTo)).toStrictEqual([16, 32, 48]);
  });

  it("does not cycle a short position list", async () => {
    await updateClip({ id: "100,101,102", arrangementStart: "5|1,9|1" });

    expect(tracks.map(movedTo)).toStrictEqual([16, 32, null]);
    expect(capturedWarnings()).toContain(
      "arrangementStart: 2 positions for 3 clips; the clips past the last position were not moved",
    );
  });

  it("resizes every clip when one length is given", async () => {
    await updateClip({ id: "100,101", arrangementLength: "2bar" });

    for (const track of [tracks[0], tracks[1]]) {
      expect(track?.call).toHaveBeenCalledWith("create_midi_clip", 8, 8);
    }
  });

  it("gives each clip its own length", async () => {
    await updateClip({ id: "100,101", arrangementLength: "2bar,1bar" });

    expect(tracks[0]?.call).toHaveBeenCalledWith("create_midi_clip", 8, 8);
    expect(tracks[1]?.call).toHaveBeenCalledWith("create_midi_clip", 4, 12);
  });

  it("does not cycle a short length list", async () => {
    await updateClip({ id: "100,101,102", arrangementLength: "2bar,1bar" });

    expect(tracks[2]?.call).not.toHaveBeenCalledWith(
      "create_midi_clip",
      expect.anything(),
      expect.anything(),
    );
    expect(capturedWarnings()).toContain(
      "arrangementLength: 2 lengths for 3 clips; the clips past the last length kept the length they had",
    );
  });
});
