// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { warpedFileEndBeats } from "#src/tools/clip/helpers/warped-file-end.ts";

type Marker = [sampleTime: number, beatTime: number];

/**
 * A clip of a 4 second file with the given warp markers.
 * @param markers - The markers, or the raw property value
 * @param props - Clip properties to override
 * @returns The mock clip
 */
function clipWith(
  markers: Marker[] | string,
  props: Record<string, unknown> = {},
): LiveAPI {
  const all: Record<string, unknown> = {
    sample_length: 4000,
    sample_rate: 1000,
    warp_markers:
      typeof markers === "string"
        ? markers
        : JSON.stringify({
            warp_markers: markers.map(([sample_time, beat_time]) => ({
              sample_time,
              beat_time,
            })),
          }),
    ...props,
  };

  return { getProperty: (name: string) => all[name] } as unknown as LiveAPI;
}

describe("warpedFileEndBeats", () => {
  it("reads the file end off the markers around it", () => {
    expect(
      warpedFileEndBeats(
        clipWith([
          [0, 0],
          [2, 4],
          [6, 20],
        ]),
      ),
    ).toBe(12);
  });

  it("gives a marker's own beat when the file ends on it", () => {
    expect(
      warpedFileEndBeats(
        clipWith([
          [0, 0],
          [4, 16],
          [4.1, 16.1],
        ]),
      ),
    ).toBe(16);
  });

  it("carries the last stretch on past the last marker", () => {
    expect(
      warpedFileEndBeats(
        clipWith([
          [0, 0],
          [1, 2],
          [2, 6],
        ]),
      ),
    ).toBe(14);
  });

  it("uses the first stretch when every marker is past the file end", () => {
    expect(
      warpedFileEndBeats(
        clipWith([
          [5, 10],
          [6, 12],
        ]),
      ),
    ).toBe(8);
  });

  it("reads markers given as a bare list", () => {
    const bare = JSON.stringify([
      { sample_time: 0, beat_time: 0 },
      { sample_time: 8, beat_time: 8 },
    ]);

    expect(warpedFileEndBeats(clipWith(bare))).toBe(4);
  });

  it.each([
    [
      "the sample rate is missing",
      clipWith(
        [
          [0, 0],
          [8, 8],
        ],
        { sample_rate: 0 },
      ),
    ],
    ["there is one marker", clipWith([[0, 0]])],
    ["the markers are not JSON", clipWith("")],
    ["the markers are some other shape", clipWith("{}")],
    ["the markers are null", clipWith("null")],
    [
      "two markers share a file position",
      clipWith([
        [0, 0],
        [0, 4],
      ]),
    ],
  ])("gives null when %s", (_why, clip) => {
    expect(warpedFileEndBeats(clip)).toBeNull();
  });
});
