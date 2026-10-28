// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  registerMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  MAX_ARRANGEMENT_LENGTH_BEATS,
  MAX_ARRANGEMENT_POSITION_BEATS,
} from "#src/tools/constants.ts";
import { parseArrangementParams } from "#src/tools/clip/update/helpers/arrangement/update-clip-arrangement-params.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import { setupClipOnTrack } from "./clip-per-track-fixtures.ts";

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

describe("updateClip - arrangementLength over Producer Pal's limit", () => {
  const TOO_LONG = "arrangementLength can be at most 394200bar";
  let tracks: RegisteredMockObject[];

  beforeEach(() => {
    registerMockObject("live-set", {
      path: livePath.liveSet,
      type: "Song",
      properties: { signature_numerator: 4, signature_denominator: 4 },
    });
    tracks = [0, 1].map(setupClipOnTrack);
  });

  it("refuses a length that is too long", async () => {
    await expect(
      updateClip({ id: "100", arrangementLength: "394201bar" }),
    ).rejects.toThrow(TOO_LONG);

    expect(tracks.some(touched)).toBe(false);
  });

  it("refuses the whole call when only one entry is too long", async () => {
    await expect(
      updateClip({ id: "100,101", arrangementLength: "1bar,394201bar" }),
    ).rejects.toThrow(TOO_LONG);

    expect(tracks.some(touched)).toBe(false);
  });

  it("takes a length exactly at the limit", () => {
    const { lengthBeats } = parseArrangementParams(undefined, "394200bar", 1);

    expect(lengthBeats.broadcast).toBe(MAX_ARRANGEMENT_LENGTH_BEATS);
  });

  it("takes a long length that starts late", () => {
    expect(() => parseArrangementParams("394200|1", "2bar", 1)).not.toThrow();
  });

  it("names the limit in the song's meter", () => {
    registerMockObject("live-set", {
      path: livePath.liveSet,
      type: "Song",
      properties: { signature_numerator: 3, signature_denominator: 4 },
    });

    expect(() => parseArrangementParams(undefined, "525601bar", 1)).toThrow(
      "arrangementLength can be at most 525600bar",
    );
  });
});
