// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { resizesLikeLiveClip } from "#src/test/mocks/registry/mock-clip-resize.ts";

const { clearAheadOfClip } = vi.hoisted(() => ({ clearAheadOfClip: vi.fn() }));

vi.mock(
  import("#src/tools/clip/arrangement/helpers/clear-ahead-of-clip.ts"),
  () => ({ clearAheadOfClip }),
);

import { recreateClip } from "#src/tools/shared/clip/recreate-clip.ts";

const TRACK_PATH = livePath.track(0);
const LANE_PATH = livePath.track(0).takeLane(0);
const SOURCE_PATH = LANE_PATH.arrangementClip(0);

/** Where the next clip on the destination starts, until something clears it. */
let neighborStart = Infinity;

/**
 * Register a 4-bar looped audio take over a 1-bar sample, and a copy that
 * lands at the sample's bar on the destination and resizes like Live's.
 * @param destinationPath - The track or lane the copy lands on
 * @param copyPath - The copy's path there
 * @param neighbor - Where a clip already on the destination starts
 * @returns The copy
 */
function registerWorld(
  destinationPath: string,
  copyPath: string,
  neighbor = Infinity,
): ReturnType<typeof registerMockObject> {
  const looped = {
    is_arrangement_clip: 1,
    is_midi_clip: 0,
    is_audio_clip: 1,
    looping: 1,
    warping: 1,
    loop_start: 0,
    loop_end: 4,
    start_marker: 0,
    end_marker: 4,
    signature_numerator: 4,
    signature_denominator: 4,
  };

  neighborStart = neighbor;
  registerMockObject("src", {
    path: SOURCE_PATH,
    type: "Clip",
    properties: {
      ...looped,
      start_time: 0,
      end_time: 16,
      file_path: "/samples/loop.wav",
    },
  });

  const copy = registerMockObject("copy", {
    path: copyPath,
    type: "Clip",
    properties: { ...looped, start_time: 40, end_time: 44 },
  });

  resizesLikeLiveClip(copy, () => neighborStart);
  registerMockObject("neighbor", {
    path: `${destinationPath} arrangement_clips 9`,
    type: "Clip",
    properties: { start_time: neighbor, end_time: neighbor + 4 },
  });
  registerMockObject("destination", {
    path: destinationPath,
    type: destinationPath === String(TRACK_PATH) ? "Track" : "TakeLane",
    properties: {
      arrangement_clips:
        neighbor === Infinity ? children("copy") : children("copy", "neighbor"),
    },
    methods: { create_audio_clip: () => ["id", "copy"] },
  });

  return copy;
}

/**
 * Re-create the take at beat 40 of the destination.
 * @param destinationPath - The track or lane the copy lands on
 * @returns What the copy lost
 */
function recreate(destinationPath: string): string[] {
  const losses: string[] = [];

  recreateClip(
    LiveAPI.from(SOURCE_PATH),
    LiveAPI.from(destinationPath),
    40,
    undefined,
    undefined,
    losses,
    { silenceWavPath: "/silence.wav" },
  );

  return losses;
}

describe("recreateClip growing a looped audio copy to its source's span", () => {
  const MAIN = String(TRACK_PATH);
  const MAIN_COPY = TRACK_PATH.arrangementClip(0);
  const LANE = String(LANE_PATH);
  const LANE_COPY = LANE_PATH.arrangementClip(1);

  it("clears the main lane ahead of the copy, so it reaches the span", () => {
    const copy = registerWorld(MAIN, MAIN_COPY, 48);

    clearAheadOfClip.mockImplementation(() => {
      neighborStart = Infinity;
    });

    expect(recreate(MAIN)).toStrictEqual([]);
    expect(clearAheadOfClip).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        isAudioClip: true,
        from: 44,
        to: 56,
        context: { silenceWavPath: "/silence.wav" },
      }),
    );
    expect(clearAheadOfClip.mock.calls[0]?.[0].track.path).toBe(MAIN);
    expect(copy.properties.end_time).toBe(56);
  });

  it("puts a scratch clip Live wouldn't remove with the copy's losses", () => {
    registerWorld(MAIN, MAIN_COPY, 48);
    clearAheadOfClip.mockImplementation(
      ({ reportScratch }: { reportScratch: (message: string) => void }) => {
        neighborStart = Infinity;
        reportScratch("couldn't remove the temp arrangement clip (no)");
      },
    );

    expect(recreate(MAIN)).toStrictEqual([
      "couldn't remove the temp arrangement clip (no)",
    ]);
  });

  it("still blames Live when a cleared main lane leaves the copy short", () => {
    registerWorld(MAIN, MAIN_COPY, 48);
    clearAheadOfClip.mockImplementation(() => {});

    expect(recreate(MAIN)).toStrictEqual([
      "length is 2bar, not 4bar: Live shortened the new clip",
    ]);
  });

  it("clears nothing on a take lane, and says the next clip stopped the copy", () => {
    registerWorld(LANE, LANE_COPY, 48);

    expect(recreate(LANE)).toStrictEqual([
      "length is 2bar, not 4bar: the next clip on the lane starts there",
    ]);
    expect(clearAheadOfClip).not.toHaveBeenCalled();
  });

  it("blames Live on a take lane with no clip where the copy ends", () => {
    registerWorld(LANE, LANE_COPY);
    // Live stops it for a reason of its own.
    neighborStart = 48;

    expect(recreate(LANE)).toStrictEqual([
      "length is 2bar, not 4bar: Live shortened the new clip",
    ]);
  });
});
