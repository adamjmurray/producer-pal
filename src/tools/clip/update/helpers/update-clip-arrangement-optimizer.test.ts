// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { computeNonSurvivorClipIds } from "./update-clip-arrangement-optimizer.ts";

/**
 * Create a mock arrangement clip with the given start/end times.
 * @param clipId - Clip ID
 * @param trackIndex - Track index
 * @param startTime - Arrangement start time in beats
 * @param endTime - Arrangement end time in beats
 * @returns LiveAPI mock clip
 */
function mockArrangementClip(
  clipId: string,
  trackIndex: number,
  startTime: number,
  endTime: number,
): LiveAPI {
  registerMockObject(clipId, {
    path: livePath.track(trackIndex).arrangementClip(0),
    properties: {
      is_arrangement_clip: 1,
      is_midi_clip: 1,
      start_time: startTime,
      end_time: endTime,
    },
  });

  return LiveAPI.from(`id ${clipId}`);
}

/**
 * Create a mock session clip.
 * @param clipId - Clip ID
 * @returns LiveAPI mock clip
 */
function mockSessionClip(clipId: string): LiveAPI {
  registerMockObject(clipId, {
    properties: {
      is_arrangement_clip: 0,
    },
  });

  return LiveAPI.from(`id ${clipId}`);
}

describe("computeNonSurvivorClipIds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when arrangementStartBeats is null", () => {
    const clips = [mockArrangementClip("1", 0, 0, 8)];

    expect(computeNonSurvivorClipIds(clips, null, null)).toBeNull();
  });

  it("returns null when arrangementStartBeats is undefined", () => {
    const clips = [mockArrangementClip("1", 0, 0, 8)];

    expect(computeNonSurvivorClipIds(clips, undefined, null)).toBeNull();
  });

  it("returns null when arrangementLengthBeats is set", () => {
    const clips = [
      mockArrangementClip("1", 0, 0, 4),
      mockArrangementClip("2", 0, 4, 12),
    ];

    expect(computeNonSurvivorClipIds(clips, 16, 8)).toBeNull();
  });

  it("returns null when only one clip per track", () => {
    const clips = [
      mockArrangementClip("1", 0, 0, 8),
      mockArrangementClip("2", 1, 0, 4),
    ];

    expect(computeNonSurvivorClipIds(clips, 16, null)).toBeNull();
  });

  it("returns null for session clips", () => {
    const clips = [mockSessionClip("1"), mockSessionClip("2")];

    expect(computeNonSurvivorClipIds(clips, 16, null)).toBeNull();
  });

  it("identifies non-survivors: A(4), B(8), C(2)", () => {
    const clips = [
      mockArrangementClip("1", 0, 0, 4), // A: 4 beats
      mockArrangementClip("2", 0, 8, 16), // B: 8 beats
      mockArrangementClip("3", 0, 20, 22), // C: 2 beats
    ];

    const result = computeNonSurvivorClipIds(clips, 32, null);

    // Backwards: C(2)>0 survives, B(8)>2 survives, A(4)<=8 covered by B
    // C survives because it's last (on top), B survives (longest), A is covered
    expect(result).toStrictEqual(new Set(["1"]));
  });

  it("only last survives when all same length", () => {
    const clips = [
      mockArrangementClip("10", 0, 0, 4), // 4 beats
      mockArrangementClip("20", 0, 8, 12), // 4 beats
      mockArrangementClip("30", 0, 16, 20), // 4 beats
    ];

    const result = computeNonSurvivorClipIds(clips, 32, null);

    // Same length: last one survives (4>0), others <=4
    expect(result).toStrictEqual(new Set(["10", "20"]));
  });

  it("returns null when already in descending order (all survive)", () => {
    const clips = [
      mockArrangementClip("1", 0, 0, 8), // 8 beats
      mockArrangementClip("2", 0, 12, 16), // 4 beats
      mockArrangementClip("3", 0, 20, 22), // 2 beats
    ];

    // Backwards: C(2)>0, B(4)>2, A(8)>4 — all survive, no non-survivors
    expect(computeNonSurvivorClipIds(clips, 32, null)).toBeNull();
  });

  it("handles mixed tracks independently", () => {
    const clips = [
      mockArrangementClip("1", 0, 0, 4), // track 0: 4 beats
      mockArrangementClip("2", 1, 0, 2), // track 1: 2 beats
      mockArrangementClip("3", 0, 8, 16), // track 0: 8 beats
      mockArrangementClip("4", 1, 4, 10), // track 1: 6 beats
    ];

    const result = computeNonSurvivorClipIds(clips, 32, null);

    // Track 0: A(4) covered by C(8) → A non-survivor
    // Track 1: B(2) covered by D(6) → B non-survivor
    expect(result).toStrictEqual(new Set(["1", "2"]));
  });

  it("handles complex survivor pattern: A(4), B(8), C(2), D(6), E(3)", () => {
    const clips = [
      mockArrangementClip("1", 0, 0, 4), // A: 4 beats
      mockArrangementClip("2", 0, 8, 16), // B: 8 beats
      mockArrangementClip("3", 0, 20, 22), // C: 2 beats
      mockArrangementClip("4", 0, 24, 30), // D: 6 beats
      mockArrangementClip("5", 0, 32, 35), // E: 3 beats
    ];

    const result = computeNonSurvivorClipIds(clips, 40, null);

    // Backwards: E(3)>0, D(6)>3, C(2)<=6 covered, B(8)>6, A(4)<=8 covered
    // Non-survivors: A(4) and C(2)
    expect(result).toStrictEqual(new Set(["1", "3"]));
  });

  it("skips clips with null trackIndex", () => {
    registerMockObject("99", {
      properties: {
        is_arrangement_clip: 1,
        start_time: 0,
        end_time: 4,
      },
    });
    // trackIndex defaults to null in mock
    const clip = LiveAPI.from("id 99");

    const clips = [clip, mockArrangementClip("2", 0, 0, 8)];

    // Only one clip on track 0 (clip 99 has null trackIndex), so no optimization
    expect(computeNonSurvivorClipIds(clips, 16, null)).toBeNull();
  });
});
