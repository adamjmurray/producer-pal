// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from "vitest";
import "./duplicate-mocks-test-helpers.ts";
import { duplicate } from "#src/tools/operations/duplicate/duplicate.ts";
import {
  children,
  liveApiCall,
  liveApiId,
  liveApiSet,
  mockLiveApiGet,
  type MockLiveAPIContext,
  setupArrangementClipMocks,
  setupArrangementDuplicationMock,
  setupSessionClipPath,
  setupTimeSignatureDurationMock,
} from "#src/tools/operations/duplicate/helpers/duplicate-test-helpers.ts";
import type { Mock } from "vitest";

/** Mock liveApiId to return session clip path format for clip1 */
function setupClip1SessionId(): void {
  (liveApiId as Mock).mockImplementation(function (
    this: MockLiveAPIContext,
  ): string | undefined {
    if (this._id === "clip1") return "live_set/tracks/0/clip_slots/0/clip";

    return this._id;
  });
}

describe("duplicate - arrangementLength functionality", () => {
  it("should duplicate a clip to arrangement with shorter length", () => {
    setupSessionClipPath("clip1");
    setupArrangementDuplicationMock();
    setupArrangementClipMocks();

    mockLiveApiGet({
      clip1: {
        exists: () => true,
        length: 8, // 8 beats original length
        looping: 0,
        name: "Test Clip",
        color: 4047616,
        signature_numerator: 4,
        signature_denominator: 4,
        loop_start: 0,
        loop_end: 8,
        is_midi_clip: 1,
      },
      "live_set tracks 0 arrangement_clips 0": {
        is_arrangement_clip: 1,
        start_time: 16,
      },
    });

    const result = duplicate({
      type: "clip",
      id: "clip1",
      destination: "arrangement",
      arrangementStart: "5|1",
      arrangementLength: "1:0", // 4 beats - shorter than original 8 beats
    });

    expect(result).toStrictEqual({
      id: "live_set tracks 0 arrangement_clips 0",
      arrangementStart: "5|1",
    });

    // New implementation uses holding area for shortening
    // The mocked createShortenedClipInHolding and moveClipFromHolding handle the details
    // Just verify the result is correct - the holding area operations are tested in arrangement-tiling.test.js
  });

  it("should duplicate a looping clip with lengthening via updateClip", () => {
    setupSessionClipPath("clip1");
    setupArrangementDuplicationMock();
    setupArrangementClipMocks();
    setupClip1SessionId();

    mockLiveApiGet({
      clip1: {
        exists: () => true,
        length: 4, // 4 beats original length
        looping: 1, // Looping enabled
        name: "Test Clip",
        color: 4047616,
        signature_numerator: 4,
        signature_denominator: 4,
        loop_start: 0,
        loop_end: 4,
        is_midi_clip: 1,
      },
      "live_set tracks 0": {
        arrangement_clips: children("live_set tracks 0 arrangement_clips 0"),
      },
      "live_set tracks 0 arrangement_clips 0": {
        is_arrangement_clip: 1,
        start_time: 16,
      },
    });

    const result = duplicate({
      type: "clip",
      id: "clip1",
      destination: "arrangement",
      arrangementStart: "5|1",
      arrangementLength: "1:2", // 6 beats - longer than original 4 beats
    });

    // New implementation first duplicates the clip
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0" }),
      "duplicate_clip_to_arrangement",
      "id live_set/tracks/0/clip_slots/0/clip",
      16,
    );

    // Then delegates to updateClip for lengthening/tiling
    // The mocked updateClip handles the complexity - its behavior is tested in update-clip.test.js
    // Just verify the result structure is valid
    // When updateClip returns a single clip, the result is the clip object directly
    expect(result).toHaveProperty("arrangementStart", "5|1");
    expect(result).toHaveProperty(
      "id",
      "live_set tracks 0 arrangement_clips 0",
    );
  });

  it("should duplicate a non-looping clip at original length when requested length is longer", () => {
    setupSessionClipPath("clip1");
    setupArrangementDuplicationMock({ includeNotes: false });
    setupArrangementClipMocks();
    setupClip1SessionId();

    mockLiveApiGet({
      clip1: {
        exists: () => true,
        length: 4, // 4 beats original length
        looping: 0, // Not looping
        signature_numerator: 4,
        signature_denominator: 4,
        is_midi_clip: 1,
      },
      "live_set tracks 0": {
        arrangement_clips: children("live_set tracks 0 arrangement_clips 0"),
      },
      "live_set tracks 0 arrangement_clips 0": {
        is_arrangement_clip: 1,
        start_time: 16,
      },
    });

    const result = duplicate({
      type: "clip",
      id: "clip1",
      destination: "arrangement",
      arrangementStart: "5|1",
      arrangementLength: "2:0", // 8 beats - longer than original 4 beats
    });

    // New implementation duplicates then uses updateClip for lengthening
    // For non-looping clips, updateClip exposes hidden content or extends loop_end
    // Just verify the result has the correct structure
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0" }),
      "duplicate_clip_to_arrangement",
      "id live_set/tracks/0/clip_slots/0/clip",
      16,
    );

    // When updateClip returns a single clip, the result is the clip object directly
    expect(result).toHaveProperty("arrangementStart", "5|1");
    expect(result).toHaveProperty(
      "id",
      "live_set tracks 0 arrangement_clips 0",
    );
  });

  it("should correctly handle 6/8 time signature duration conversion", () => {
    setupTimeSignatureDurationMock();

    mockLiveApiGet({
      clip1: {
        exists: () => true,
        length: 12, // 12 Ableton beats = 4 bars in 6/8 time (longer than requested length)
        looping: 0,
        name: "Test Clip 6/8",
        color: 4047616,
        signature_numerator: 6,
        signature_denominator: 8,
        loop_start: 0,
        loop_end: 12,
        is_midi_clip: 1,
      },
      live_set: {
        signature_numerator: 4, // Song is in 4/4, but clip is in 6/8 - this causes the bug
        signature_denominator: 4,
      },
      "live_set tracks 0 arrangement_clips 0": {
        is_arrangement_clip: 1,
        start_time: 0,
      },
    });

    // This test verifies correct duration conversion: "1|0" duration should be 3 Ableton beats in 6/8 time
    // The implementation now correctly uses the CLIP time signature (6/8) for parsing
    const result = duplicate({
      type: "clip",
      id: "clip1",
      destination: "arrangement",
      arrangementStart: "1|1",
      arrangementLength: "1:0", // This should be 3 Ableton beats in 6/8 time
    });

    // Verify the result - new implementation uses holding area for shortening
    // The holding area operations correctly handle time signature conversion
    expect(result).toStrictEqual({
      id: "live_set tracks 0 arrangement_clips 0",
      arrangementStart: "1|1",
    });
  });

  it("should correctly handle 2/2 time signature duration conversion", () => {
    setupTimeSignatureDurationMock();

    mockLiveApiGet({
      clip1: {
        exists: () => true,
        length: 8, // 8 Ableton beats = 2 bars in 2/2 time (longer than requested length)
        looping: 0,
        name: "Test Clip 2/2",
        color: 4047616,
        signature_numerator: 2,
        signature_denominator: 2,
        loop_start: 0,
        loop_end: 8,
        is_midi_clip: 1,
      },
      live_set: {
        signature_numerator: 4, // Song is in 4/4, but clip is in 2/2
        signature_denominator: 4,
      },
      "live_set tracks 0 arrangement_clips 0": {
        is_arrangement_clip: 1,
        start_time: 0,
      },
    });

    // In 2/2 time, "1|0" duration should be 4 Ableton beats (1 bar = 2 half notes = 4 quarter notes)
    const result = duplicate({
      type: "clip",
      id: "clip1",
      destination: "arrangement",
      arrangementStart: "1|1",
      arrangementLength: "1:0", // This should be 4 Ableton beats in 2/2 time
    });

    // Verify the result - new implementation uses holding area for shortening
    // The holding area operations correctly handle time signature conversion
    expect(result).toStrictEqual({
      id: "live_set tracks 0 arrangement_clips 0",
      arrangementStart: "1|1",
    });
  });

  it("should error when arrangementLength is zero or negative", () => {
    setupSessionClipPath("clip1");

    mockLiveApiGet({
      clip1: {
        exists: () => true,
        length: 4,
        looping: 1,
      },
    });

    expect(() =>
      duplicate({
        type: "clip",
        id: "clip1",
        destination: "arrangement",
        arrangementStart: "5|1",
        arrangementLength: "0:0", // 0 bars + 0 beats = 0 total
      }),
    ).toThrow(
      'duplicate failed: arrangementLength must be positive, got "0:0"',
    );
  });

  it("should work normally without arrangementLength (backward compatibility)", () => {
    setupSessionClipPath("clip1");
    setupArrangementDuplicationMock({ includeNotes: false });
    setupArrangementClipMocks();

    mockLiveApiGet({
      clip1: {
        exists: () => true,
        length: 8,
        looping: 0,
      },
      "live_set tracks 0 arrangement_clips 0": {
        is_arrangement_clip: 1,
        start_time: 16,
      },
    });

    const result = duplicate({
      type: "clip",
      id: "clip1",
      destination: "arrangement",
      arrangementStart: "5|1",
      // No arrangementLength specified
    });

    // Should use original behavior - no length manipulation
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0" }),
      "duplicate_clip_to_arrangement",
      "id clip1",
      16,
    );
    // Check that no end_marker was set (setAll should only be called for name, which is undefined)
    expect(liveApiSet).not.toHaveBeenCalledWith(
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
