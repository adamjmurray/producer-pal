// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import "./duplicate-mocks-test-helpers.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import {
  children,
  registerArrangementClip,
  registerMockObject,
  registerTrackWithArrangementDup,
} from "#src/tools/actions/duplicate/helpers/duplicate-test-helpers.ts";
import { createShortenedClipInHoldingMock, updateClipMock } from "./setup.ts";

interface LengthMocks {
  track0: ReturnType<typeof registerMockObject>;
}

function setupLengthMocks(): LengthMocks {
  const track0 = registerTrackWithArrangementDup(0, {
    arrangement_clips: children(livePath.track(0).arrangementClip(0)),
  });

  registerArrangementClip(0, 0, 16);
  registerMockObject("live_set", { path: livePath.liveSet });

  return { track0 };
}

describe("duplicate - arrangementLength functionality", () => {
  it("should duplicate a clip to arrangement with shorter length", async () => {
    registerMockObject("clip1", {
      path: livePath.track(0).clipSlot(0).clip(),
      properties: {
        length: 8,
        looping: 0,
        name: "Test Clip",
        color: 4047616,
        signature_numerator: 4,
        signature_denominator: 4,
        loop_start: 0,
        loop_end: 8,
        is_midi_clip: 1,
      },
    });

    registerMockObject("live_set/tracks/0", {
      path: livePath.track(0),
    });

    registerMockObject("live_set", { path: livePath.liveSet });

    const result = await duplicate({
      type: "clip",
      id: "clip1",

      arrangementStart: "5|1",
      arrangementLength: "1bar", // 4 beats - shorter than original 8 beats
    });

    expect(result).toStrictEqual({
      id: livePath.track(0).arrangementClip(0),
      arrangementStart: "5|1",
    });

    // New implementation uses holding area for shortening
    // The mocked createShortenedClipInHolding and moveClipFromHolding handle the details
    // Just verify the result is correct - the holding area operations are tested in arrangement-tiling.test.js
  });

  it("should duplicate a looping clip with lengthening via updateClip", async () => {
    registerMockObject("clip1", {
      path: livePath.track(0).clipSlot(0).clip(),
      properties: {
        length: 4,
        looping: 1,
        name: "Test Clip",
        color: 4047616,
        signature_numerator: 4,
        signature_denominator: 4,
        loop_start: 0,
        loop_end: 4,
        is_midi_clip: 1,
      },
    });

    const { track0 } = setupLengthMocks();

    const result = await duplicate({
      type: "clip",
      id: "clip1",

      arrangementStart: "5|1",
      arrangementLength: "1bar+n/2", // 6 beats - longer than original 4 beats
    });

    // New implementation first duplicates the clip
    expect(track0.call).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id clip1",
      16,
    );

    // Then delegates to updateClip for lengthening/tiling
    // The mocked updateClip handles the complexity - its behavior is tested in update-clip.test.js
    // Just verify the result structure is valid
    // When updateClip returns a single clip, the result is the clip object directly
    expect(result).toHaveProperty("arrangementStart", "5|1");
    expect(result).toHaveProperty("id", livePath.track(0).arrangementClip(0));
  });

  it("returns the lengthened clip even when updateClip resolves asynchronously (regression for missing await)", async () => {
    registerMockObject("clip1", {
      path: livePath.track(0).clipSlot(0).clip(),
      properties: {
        length: 4,
        looping: 1,
        signature_numerator: 4,
        signature_denominator: 4,
        is_midi_clip: 1,
      },
    });

    setupLengthMocks();

    // The real updateClip is async. A caller that fails to await it would treat
    // the returned Promise as the clip array (Array.isArray === false) and drop
    // the lengthened clip from the result.
    updateClipMock.mockReturnValueOnce(
      Promise.resolve([{ id: livePath.track(0).arrangementClip(0) }]),
    );

    const result = await duplicate({
      type: "clip",
      id: "clip1",

      arrangementStart: "5|1",
      arrangementLength: "1bar+n/2", // 6 beats - longer than original 4 beats
    });

    expect(result).toStrictEqual({
      id: livePath.track(0).arrangementClip(0),
      arrangementStart: "5|1",
    });
  });

  it("should duplicate a non-looping clip at original length when requested length is longer", async () => {
    registerMockObject("clip1", {
      path: livePath.track(0).clipSlot(0).clip(),
      properties: {
        length: 4,
        looping: 0,
        signature_numerator: 4,
        signature_denominator: 4,
        is_midi_clip: 1,
      },
    });

    const { track0 } = setupLengthMocks();

    const result = await duplicate({
      type: "clip",
      id: "clip1",

      arrangementStart: "5|1",
      arrangementLength: "2bar", // 8 beats - longer than original 4 beats
    });

    // New implementation duplicates then uses updateClip for lengthening
    // For non-looping clips, updateClip exposes hidden content or extends loop_end
    // Just verify the result has the correct structure
    expect(track0.call).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id clip1",
      16,
    );

    // When updateClip returns a single clip, the result is the clip object directly
    expect(result).toHaveProperty("arrangementStart", "5|1");
    expect(result).toHaveProperty("id", livePath.track(0).arrangementClip(0));
  });

  // arrangementLength resolves against the SONG time signature, consistent with
  // every other arrangement-facing surface (create/update-clip, read-clip's
  // read-back) — NOT the clip's own meter. read-clip reads it back via the song
  // meter, so the write side must encode against the song meter to round-trip.
  it.each([
    ["6/8", 6, 8],
    ["3/4", 3, 4],
  ] as const)(
    "resolves arrangementLength bars against the song meter, not the %s clip meter (shortening)",
    async (label, numerator, denominator) => {
      registerMockObject("clip1", {
        path: livePath.track(0).clipSlot(0).clip(),
        properties: {
          length: 16, // longer than the 8-beat target → shortening path
          looping: 0,
          name: `Test Clip ${label}`,
          color: 4047616,
          signature_numerator: numerator,
          signature_denominator: denominator,
          loop_start: 0,
          loop_end: 16,
          is_midi_clip: 1,
        },
      });

      registerMockObject("live_set/tracks/0", { path: livePath.track(0) });
      // live_set defaults to a 4/4 song meter in the mock registry
      registerMockObject("live_set", { path: livePath.liveSet });
      registerArrangementClip(0, 0, 0);

      await duplicate({
        type: "clip",
        id: "clip1",
        arrangementStart: "1|1",
        arrangementLength: "2bar",
      });

      // 2 bars of the 4/4 song = 8 Ableton beats. The clip's 6/8 (or 3/4) meter
      // would resolve "2bar" to 6 beats — the bug this fix corrects.
      const calls = createShortenedClipInHoldingMock.mock
        .calls as unknown as number[][];

      expect(calls).toHaveLength(1);
      expect(calls[0]?.[2]).toBe(8);
    },
  );

  it("re-encodes the lengthen target in the song meter so a bar-aligned length round-trips through updateClip (3/4 clip, 4/4 song)", async () => {
    registerMockObject("clip1", {
      path: livePath.track(0).clipSlot(0).clip(),
      properties: {
        length: 3, // shorter than the 12-beat target → lengthening path
        looping: 1,
        signature_numerator: 3,
        signature_denominator: 4,
        loop_start: 0,
        loop_end: 3,
        is_midi_clip: 1,
      },
    });

    setupLengthMocks(); // registers track0 (arrangement dup) + a 4/4 song meter

    await duplicate({
      type: "clip",
      id: "clip1",
      arrangementStart: "5|1",
      arrangementLength: "3bar",
    });

    // "3bar" is 12 beats in the 4/4 song. updateClip re-parses arrangementLength
    // against the song meter, so the re-encoded string must also be song-relative
    // ("3bar"). A clip-meter encode would emit "4bar" (12 / 3 beats-per-3/4-bar)
    // and updateClip would then stretch the clip to 16 beats.
    expect(updateClipMock).toHaveBeenCalledWith(
      expect.objectContaining({ arrangementLength: "3bar" }),
      expect.anything(),
    );
  });

  it("should error when arrangementLength is zero or negative", async () => {
    registerMockObject("clip1", {
      path: livePath.track(0).clipSlot(0).clip(),
      properties: { length: 4, looping: 1 },
    });

    registerMockObject("live_set", { path: livePath.liveSet });

    await expect(
      duplicate({
        type: "clip",
        id: "clip1",

        arrangementStart: "5|1",
        arrangementLength: "0bar", // 0 bars + 0 beats = 0 total
      }),
    ).rejects.toThrow(
      'duplicate failed: arrangementLength must be positive, got "0bar"',
    );
  });

  it("should work normally without arrangementLength (backward compatibility)", async () => {
    registerMockObject("clip1", {
      path: livePath.track(0).clipSlot(0).clip(),
      properties: { length: 8, looping: 0 },
    });

    const track0 = registerTrackWithArrangementDup(0);
    const arrClip = registerArrangementClip(0, 0, 16);

    registerMockObject("live_set", { path: livePath.liveSet });

    const result = await duplicate({
      type: "clip",
      id: "clip1",

      arrangementStart: "5|1",
      // No arrangementLength specified
    });

    // Should use original behavior - no length manipulation
    expect(track0.call).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id clip1",
      16,
    );
    // Check that no end_marker was set
    expect(arrClip.set).not.toHaveBeenCalledWith(
      "end_marker",
      expect.anything(),
    );

    expect(result).toMatchObject({
      id: expect.any(String) as string,
      trackIndex: expect.any(Number) as number,
      arrangementStart: expect.any(String) as string,
    });
  });
});
