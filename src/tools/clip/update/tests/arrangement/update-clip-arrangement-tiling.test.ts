// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  overrideCall,
  requireMockObject,
  requireMockTrack,
  USE_CALL_FALLBACK,
} from "#src/test/helpers/mock-registry-test-helpers.ts";
import { type RegisteredMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  mockContext,
  setupArrangementClipPath,
  setupUpdateClipMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";

function setupClipProperties(
  clip: RegisteredMockObject,
  props: Record<string, unknown>,
): void {
  const fallbackGet = clip.get.getMockImplementation();

  clip.get.mockImplementation((prop: string) => {
    const value = props[prop];

    if (value !== undefined) {
      return [value];
    }

    if (fallbackGet != null) {
      return fallbackGet.call(clip, prop);
    }

    return [0];
  });
}

describe("updateClip - arrangementLength (clean tiling)", () => {
  beforeEach(() => {
    setupUpdateClipMocks();
  });

  it("should tile clip with exact multiples (no remainder) - extends existing", async () => {
    const trackIndex = 0;
    const clips = setupArrangementClipPath(trackIndex, ["789", "1000"]);
    const sourceClip = clips.get("789");
    const duplicatedClip = clips.get("1000");
    const track = requireMockTrack(trackIndex);

    expect(sourceClip).toBeDefined();
    expect(duplicatedClip).toBeDefined();

    if (sourceClip == null || duplicatedClip == null) {
      throw new Error("Expected arrangement clip mocks for 789 and 1000");
    }

    setupClipProperties(sourceClip, {
      is_arrangement_clip: 1,
      is_midi_clip: 1,
      is_audio_clip: 0,
      start_time: 0.0,
      end_time: 4.0, // 1 bar currently visible
      loop_start: 0.0,
      loop_end: 12.0, // clip.length = 12 beats (3 bars of content)
      start_marker: 0.0,
      end_marker: 12.0,
      name: "Test",
      color: 0,
      signature_numerator: 4,
      signature_denominator: 4,
      looping: 1,
      trackIndex,
    });
    setupClipProperties(duplicatedClip, {
      end_time: 12.0,
      start_marker: 0.0,
      loop_start: 0.0,
    });
    setupClipProperties(requireMockObject("live_set"), {
      tracks: ["id", 0],
      signature_numerator: 4,
      signature_denominator: 4,
    });
    setupClipProperties(requireMockObject("live_set tracks 0"), {
      arrangement_clips: ["id", 789],
    });

    // Mock tiling flow (non-destructive duplication)
    overrideCall(track, function (method, ..._args) {
      if (method === "duplicate_clip_to_arrangement") {
        return `id 1000`;
      }

      return USE_CALL_FALLBACK;
    });

    const result = await updateClip({
      ids: "789",
      arrangementLength: "3:0", // 3 bars = 12 beats, matches clip.length exactly
    });

    // Should tile using non-destructive duplication (preserves envelopes)
    // currentArrangementLength (4) < clipLength (12) triggers tiling
    // Keeps original clip and tiles after it at positions 4 and 8
    expect(track.call).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id 789",
      4.0,
    );
    expect(track.call).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id 789",
      8.0,
    );

    expect(result).toStrictEqual([
      { id: "789" },
      { id: "1000" },
      { id: "1000" },
    ]); // Original + tiled clips
  });

  it("should handle insufficient content by tiling what exists", async () => {
    const trackIndex = 0;
    const clips = setupArrangementClipPath(trackIndex, ["789", "1000"]);
    const sourceClip = clips.get("789");
    const track = requireMockTrack(trackIndex);

    expect(sourceClip).toBeDefined();

    if (sourceClip == null) {
      throw new Error("Expected arrangement clip mock for 789");
    }

    setupClipProperties(sourceClip, {
      is_arrangement_clip: 1,
      is_midi_clip: 1,
      looping: 1, // This is a looped clip
      start_time: 0.0,
      end_time: 4.0,
      loop_start: 0.0,
      loop_end: 4.0, // clip.length = 4 beats
      start_marker: 0.0,
      end_marker: 4.0,
      signature_numerator: 4,
      signature_denominator: 4,
      trackIndex,
    });
    setupClipProperties(requireMockObject("live_set"), {
      tracks: ["id", 0],
    });
    setupClipProperties(requireMockObject("live_set tracks 0"), {
      arrangement_clips: ["id", 789],
    });

    // Mock duplicate_clip_to_arrangement
    let nextId = 1000;

    overrideCall(track, function (method, ...args) {
      if (method === "duplicate_clip_to_arrangement") {
        const id = nextId++;
        const duplicatedClip = clips.get(String(id));

        if (duplicatedClip != null) {
          setupClipProperties(duplicatedClip, {
            end_time: (Number(args[1]) || 0) + 4.0,
          });
        }

        return `id ${id}`;
      }

      return USE_CALL_FALLBACK;
    });

    const result = await updateClip({
      ids: "789",
      arrangementLength: "2:0", // 8 beats > 4 beats (clip.length), tiles existing content twice
    });

    // Should duplicate once (2 tiles total: existing clip + 1 duplicate)
    expect(track.call).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id 789",
      4.0,
    );

    expect(result).toStrictEqual([{ id: "789" }, { id: "1000" }]);
  });

  it("should work with no remainder (single tile)", async () => {
    const trackIndex = 0;
    const clips = setupArrangementClipPath(trackIndex, ["789"]);
    const sourceClip = clips.get("789");
    const track = requireMockTrack(trackIndex);

    expect(sourceClip).toBeDefined();

    if (sourceClip == null) {
      throw new Error("Expected arrangement clip mock for 789");
    }

    setupClipProperties(sourceClip, {
      is_arrangement_clip: 1,
      is_midi_clip: 1,
      start_time: 0.0,
      end_time: 4.0,
      loop_start: 0.0,
      loop_end: 4.0,
      start_marker: 0.0,
      signature_numerator: 4,
      signature_denominator: 4,
      trackIndex,
    });
    setupClipProperties(requireMockObject("live_set"), {
      tracks: ["id", 0],
    });
    setupClipProperties(requireMockObject("live_set tracks 0"), {
      arrangement_clips: ["id", 789],
    });

    const result = await updateClip({
      ids: "789",
      arrangementLength: "1:0", // Same as clip.length (no tiling needed)
    });

    // Should not call duplicate_clip_to_arrangement
    expect(track.call).not.toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      expect.anything(),
      expect.anything(),
    );

    expect(result).toStrictEqual({ id: "789" });
  });

  it("should tile clip with pre-roll (start_marker < loop_start) with correct offsets", async () => {
    const trackIndex = 0;
    const clips = setupArrangementClipPath(trackIndex, [
      "789",
      "1000",
      "1001",
      "1002",
    ]);
    const sourceClip = clips.get("789");
    const tile0 = clips.get("1000");
    const tile1 = clips.get("1001");
    const tile2 = clips.get("1002");
    const track = requireMockTrack(trackIndex);

    expect(sourceClip).toBeDefined();

    if (sourceClip == null || tile0 == null || tile1 == null || tile2 == null) {
      throw new Error("Expected arrangement clip mocks for 789/1000/1001/1002");
    }

    setupClipProperties(sourceClip, {
      is_arrangement_clip: 1,
      is_midi_clip: 1,
      looping: 1,
      start_time: 0.0,
      end_time: 3.0, // 3 beats currently visible
      loop_start: 1.0, // start at beat 2 (1|2)
      loop_end: 4.0, // 3 beats of loop content
      start_marker: 0.0, // firstStart at beat 1 (1|1) - creates 1 beat pre-roll
      end_marker: 4.0,
      signature_numerator: 4,
      signature_denominator: 4,
      trackIndex,
    });
    setupClipProperties(requireMockObject("live_set"), {
      tracks: ["id", 0],
      signature_numerator: 4,
      signature_denominator: 4,
    });
    setupClipProperties(requireMockObject("live_set tracks 0"), {
      arrangement_clips: ["id", 789],
    });

    // Track created clips and their start_marker values
    let nextId = 1000;

    overrideCall(track, function (method) {
      if (method === "duplicate_clip_to_arrangement") {
        const id = nextId++;

        return `id ${id}`;
      }

      return USE_CALL_FALLBACK;
    });

    const result = await updateClip({
      ids: "789",
      arrangementLength: "3:0", // 12 beats total - needs 3 tiles after original
    });

    // Should create 3 tiles
    expect(track.call).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id 789",
      3.0, // First tile at beat 3
    );
    expect(track.call).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id 789",
      6.0, // Second tile at beat 6
    );
    expect(track.call).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id 789",
      9.0, // Third tile at beat 9
    );

    // Verify start_marker offsets account for pre-roll
    // currentOffset = start_marker - loop_start = 0 - 1 = -1
    // Tile 0: startOffset = currentOffset + currentArrangementLength = -1 + 3 = 2
    //         tileStartMarker = loop_start + (2 % clipLength) = 1 + (2 % 3) = 1 + 2 = 3
    // Tile 1: startOffset = 2 + 3 = 5
    //         tileStartMarker = loop_start + (5 % clipLength) = 1 + (5 % 3) = 1 + 2 = 3
    // Tile 2: startOffset = 5 + 3 = 8
    //         tileStartMarker = loop_start + (8 % clipLength) = 1 + (8 % 3) = 1 + 2 = 3
    expect(tile0.set).toHaveBeenCalledWith("start_marker", 3.0);
    expect(tile1.set).toHaveBeenCalledWith("start_marker", 3.0);
    expect(tile2.set).toHaveBeenCalledWith("start_marker", 3.0);

    expect(result).toStrictEqual([
      { id: "789" },
      { id: "1000" },
      { id: "1001" },
      { id: "1002" },
    ]);
  });

  it("should preserve envelopes when tiling clip with hidden content", async () => {
    const trackIndex = 0;
    const clips = setupArrangementClipPath(trackIndex, ["789", "1000", "1001"]);
    const sourceClip = clips.get("789");
    const tile1 = clips.get("1000");
    const tile2 = clips.get("1001");
    const track = requireMockTrack(trackIndex);

    expect(sourceClip).toBeDefined();
    expect(tile1).toBeDefined();
    expect(tile2).toBeDefined();

    if (sourceClip == null || tile1 == null || tile2 == null) {
      throw new Error("Expected arrangement clip mocks for 789/1000/1001");
    }

    setupClipProperties(sourceClip, {
      is_arrangement_clip: 1,
      is_midi_clip: 1,
      is_audio_clip: 0,
      looping: 1, // This is a looped clip
      start_time: 0.0,
      end_time: 4.0, // Currently showing 4 beats
      loop_start: 0.0,
      loop_end: 8.0, // clip.length = 8 beats (has hidden content)
      start_marker: 2.0, // Pre-roll: starts at beat 2 but playback from beat 0
      end_marker: 8.0,
      name: "Test Clip",
      trackIndex,
    });
    setupClipProperties(tile1, {
      end_time: 8.0,
      start_marker: 2.0,
      loop_start: 0.0,
    });
    setupClipProperties(tile2, {
      end_time: 12.0,
      start_marker: 2.0,
      loop_start: 0.0,
    });
    setupClipProperties(requireMockObject("live_set"), {
      tracks: ["id", 0],
      signature_numerator: 4,
      signature_denominator: 4,
    });
    setupClipProperties(requireMockObject("live_set tracks 0"), {
      arrangement_clips: ["id", 789],
    });

    // Mock duplicate_clip_to_arrangement calls for tiling
    let callCount = 0;

    overrideCall(track, function (method) {
      if (method === "duplicate_clip_to_arrangement") {
        callCount++;

        if (callCount === 1) {
          return `id 1000`; // First full tile (4 beats)
        } else if (callCount === 2) {
          return `id 1001`; // Second full tile (4 beats)
        }
      }

      return USE_CALL_FALLBACK;
    });

    vi.mocked(outlet).mockClear();

    const result = await updateClip(
      {
        ids: "789",
        arrangementLength: "3:0", // 12 beats
      },
      mockContext,
    );

    // Should tile using arrangement length (4 beats) for spacing
    // Keeps original clip and tiles after it
    // Creates 2 full tiles at positions 4 and 8 (8 beats total, tiled at 4-beat intervals)
    expect(track.call).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id 789",
      4.0,
    );
    expect(track.call).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id 789",
      8.0,
    );

    // Should NOT emit envelope warning (preserves envelopes via non-destructive tiling)
    expect(outlet).not.toHaveBeenCalledWith(
      1,
      expect.stringContaining("Automation envelopes were lost"),
    );

    // Should return original + 2 full tiles (4 beats each)
    expect(result).toStrictEqual([
      { id: "789" },
      { id: "1000" },
      { id: "1001" },
    ]);
  });
});
