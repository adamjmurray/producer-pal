// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { handleArrangementStartOperation } from "../helpers/update-clip-arrangement-helpers.ts";

const mockContext = { silenceWavPath: "/tmp/test-silence.wav" } as const;

describe("update-clip-arrangement-helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("handleArrangementStartOperation", () => {
    it("should warn and return original ID for session clips", () => {
      const mockClip = {
        id: "123",
        getProperty: vi.fn((prop) => {
          if (prop === "is_arrangement_clip") {
            return 0; // Session clip
          }

          return null;
        }),
      };

      const tracksWithMovedClips = new Map();

      const result = handleArrangementStartOperation({
        clip: mockClip as unknown as LiveAPI,
        arrangementStartBeats: 16,
        tracksWithMovedClips,
        isMidiClip: true,
        context: mockContext,
      });

      expect(outlet).toHaveBeenCalledWith(
        1,
        "arrangementStart parameter ignored for session clip (id 123)",
      );
      expect(result).toBe("123");
    });

    it("should warn and return original clip id when trackIndex is null for arrangement clips", () => {
      const mockClip = {
        id: "456",
        getProperty: vi.fn((prop) => {
          if (prop === "is_arrangement_clip") {
            return 1; // Arrangement clip
          }

          return null;
        }),
        trackIndex: null, // No track index
      };

      const tracksWithMovedClips = new Map();

      // Should not throw, just warn and return original clip id
      const result = handleArrangementStartOperation({
        clip: mockClip as unknown as LiveAPI,
        arrangementStartBeats: 16,
        tracksWithMovedClips,
        isMidiClip: true,
        context: mockContext,
      });

      expect(result).toBe("456");
    });

    it("should duplicate clip to new position and delete original", () => {
      const trackIndex = 2;
      const newClipId = "999";

      // Register track mock with duplication method
      const trackMock = registerMockObject(`live_set/tracks/${trackIndex}`, {
        path: `live_set tracks ${trackIndex}`,
        methods: {
          duplicate_clip_to_arrangement: () => ["id", 999],
        },
      });

      // Register new clip that will be created by duplication
      registerMockObject(newClipId, {
        path: livePath.track(trackIndex).arrangementClip(0),
      });

      const mockClip = {
        id: "789", // LiveAPI.id returns just the number
        getProperty: vi.fn((prop) => {
          if (prop === "is_arrangement_clip") {
            return 1;
          }

          return null;
        }),
        trackIndex,
      };

      const tracksWithMovedClips = new Map();

      const result = handleArrangementStartOperation({
        clip: mockClip as unknown as LiveAPI,
        arrangementStartBeats: 32,
        tracksWithMovedClips,
        isMidiClip: true,
        context: mockContext,
      });

      // Code now formats ID with "id " prefix for Live API calls
      expect(trackMock.call).toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        "id 789",
        32,
      );
      expect(trackMock.call).toHaveBeenCalledWith("delete_clip", "id 789");
      expect(result).toBe(newClipId);
      expect(tracksWithMovedClips.get(trackIndex)).toBe(1);
    });

    it("routes a self-overlapping move through the holding area and deletes the original", () => {
      const trackIndex = 3;
      let dupCount = 0;

      // The real workaround runs here (this file does not mock it). The source
      // [0,16] moved to beat 4 overlaps its own target [4,20]:
      // clearClipAtDuplicateTarget returns false, so the move routes through the
      // holding area — copy to holding, trim/overwrite the original, place a full
      // copy — then deletes the original, leaving one full-length clip at the new
      // position.
      const trackMock = registerMockObject(`live_set/tracks/${trackIndex}`, {
        path: `live_set tracks ${trackIndex}`,
        properties: { arrangement_clips: ["id", "700"] },
        methods: {
          duplicate_clip_to_arrangement: () => {
            dupCount++;

            return dupCount === 1 ? ["id", "710"] : ["id", "720"];
          },
          create_midi_clip: () => ["id", "730"],
          delete_clip: () => null,
        },
      });

      // Source clip, resolved when the workaround iterates arrangement clips.
      registerMockObject("700", {
        path: livePath.track(trackIndex).arrangementClip(0),
        properties: { is_arrangement_clip: 1, start_time: 0, end_time: 16 },
      });
      // Holding copy the first duplicate creates (maxEnd 16 + 100 = 116).
      registerMockObject("710", {
        path: livePath.track(trackIndex).arrangementClip(1),
        properties: { is_arrangement_clip: 1, start_time: 116, end_time: 132 },
      });
      // The full copy placed at the target.
      registerMockObject("720", {
        path: livePath.track(trackIndex).arrangementClip(2),
      });

      const mockClip = {
        id: "700",
        path: `live_set tracks ${trackIndex} arrangement_clips 0`,
        getProperty: vi.fn((prop) => {
          if (prop === "is_arrangement_clip") return 1;
          if (prop === "start_time") return 0;
          if (prop === "end_time") return 16;

          return null;
        }),
        trackIndex,
        exists: () => true,
      };

      const tracksWithMovedClips = new Map<number, number>();

      const result = handleArrangementStartOperation({
        clip: mockClip as unknown as LiveAPI,
        arrangementStartBeats: 4,
        tracksWithMovedClips,
        isMidiClip: true,
        context: mockContext,
      });

      // Holding round-trip: copy source to holding (116), place full copy at 4.
      expect(trackMock.call).toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        "id 700",
        116,
      );
      expect(trackMock.call).toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        "id 710",
        4,
      );
      // Both the holding clip and the original are removed → one clip at target.
      expect(trackMock.call).toHaveBeenCalledWith("delete_clip", "id 710");
      expect(trackMock.call).toHaveBeenCalledWith("delete_clip", "id 700");
      expect(result).toBe("720");
    });

    it("should warn and return original ID when duplication fails", () => {
      const trackIndex = 0;

      // Register track mock that returns non-existent "id 0" result
      const trackMock = registerMockObject(`live_set/tracks/${trackIndex}`, {
        path: `live_set tracks ${trackIndex}`,
        methods: {
          duplicate_clip_to_arrangement: () => ["id", 0],
        },
      });

      const mockClip = {
        id: "100",
        getProperty: vi.fn((prop) => {
          if (prop === "is_arrangement_clip") return 1;

          return null;
        }),
        trackIndex: 0,
      };

      const tracksWithMovedClips = new Map<number, number>();

      const result = handleArrangementStartOperation({
        clip: mockClip as unknown as LiveAPI,
        arrangementStartBeats: 8,
        tracksWithMovedClips,
        isMidiClip: true,
        context: mockContext,
      });

      // Should warn about failure and return original clip ID
      expect(outlet).toHaveBeenCalledWith(
        1,
        "failed to duplicate clip 100 - original preserved",
      );
      expect(result).toBe("100");
      // Should NOT call delete_clip since duplication failed
      expect(trackMock.call).not.toHaveBeenCalledWith(
        "delete_clip",
        expect.anything(),
      );
    });

    it("should increment move count for multiple moves on same track", () => {
      const trackIndex = 1;
      const newClipId = "888";

      // Register track mock
      registerMockObject(`live_set/tracks/${trackIndex}`, {
        path: `live_set tracks ${trackIndex}`,
        methods: {
          duplicate_clip_to_arrangement: () => ["id", 888],
        },
      });

      // Register new clip mock
      registerMockObject(newClipId, {
        path: livePath.track(trackIndex).arrangementClip(0),
      });

      const mockClip = {
        id: "555", // LiveAPI.id returns just the number
        getProperty: vi.fn((prop) => {
          if (prop === "is_arrangement_clip") {
            return 1;
          }

          return null;
        }),
        trackIndex,
      };

      // Simulate previous moves on the same track
      const tracksWithMovedClips = new Map([[trackIndex, 2]]);

      handleArrangementStartOperation({
        clip: mockClip as unknown as LiveAPI,
        arrangementStartBeats: 64,
        tracksWithMovedClips,
        isMidiClip: true,
        context: mockContext,
      });

      expect(tracksWithMovedClips.get(trackIndex)).toBe(3);
    });

    it("should delete clip and return null for non-survivors", () => {
      const { trackMock, result, tracksWithMovedClips } =
        callWithNonSurvivorClip({ clipExists: true });

      // Should delete the clip and return null
      expect(result).toBeNull();
      expect(trackMock.call).toHaveBeenCalledWith("delete_clip", "id 200");
      // Should NOT call duplicate_clip_to_arrangement
      expect(trackMock.call).not.toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        expect.anything(),
        expect.anything(),
      );
      // Should still increment move count
      expect(tracksWithMovedClips.get(0)).toBe(1);
    });

    it("should warn and skip deletion for already-deleted non-survivor clips", () => {
      const { trackMock, result, tracksWithMovedClips } =
        callWithNonSurvivorClip({ clipExists: false });

      expect(result).toBeNull();
      expect(outlet).toHaveBeenCalledWith(
        1,
        "non-survivor clip 200 already deleted, skipping",
      );
      // Should NOT call delete_clip since clip doesn't exist
      expect(trackMock.call).not.toHaveBeenCalledWith(
        "delete_clip",
        expect.anything(),
      );
      // Should still increment move count
      expect(tracksWithMovedClips.get(0)).toBe(1);
    });

    it("warns and returns original ID for take-lane clips without calling Track APIs", () => {
      const trackIndex = 4;
      const trackMock = registerMockObject(`live_set/tracks/${trackIndex}`, {
        path: `live_set tracks ${trackIndex}`,
        methods: {
          duplicate_clip_to_arrangement: () => ["id", 0],
        },
      });

      const { result, tracksWithMovedClips } = callArrangementStart({
        clipId: "777",
        trackIndex,
        path: `live_set tracks ${trackIndex} take_lanes 0 arrangement_clips 0`,
      });

      expect(result).toBe("777");
      expect(outlet).toHaveBeenCalledWith(
        1,
        "arrangementStart parameter ignored for take-lane clip (id 777); move it in Live's UI",
      );
      // Neither duplicate_clip_to_arrangement nor delete_clip should fire —
      // both are Track-scoped APIs that silently misroute on take-lane clips.
      expect(trackMock.call).not.toHaveBeenCalled();
      // Also: do not increment the move count for a skipped take-lane clip.
      expect(tracksWithMovedClips.get(trackIndex)).toBeUndefined();
    });
  });
});

/**
 * Sets up a non-survivor clip scenario and calls handleArrangementStartOperation.
 * @param root0 - Options
 * @param root0.clipExists - Whether the clip exists
 * @returns The result of handleArrangementStartOperation
 */
function callWithNonSurvivorClip({ clipExists }: { clipExists: boolean }) {
  const trackIndex = 0;

  const trackMock = registerMockObject(`live_set/tracks/${trackIndex}`, {
    path: `live_set tracks ${trackIndex}`,
  });

  const { result, tracksWithMovedClips } = callArrangementStart({
    clipId: "200",
    trackIndex,
    isNonSurvivor: true,
    exists: () => clipExists,
  });

  return { trackMock, result, tracksWithMovedClips };
}

interface CallArrangementStartOptions {
  clipId: string;
  trackIndex: number;
  path?: string;
  exists?: () => boolean;
  isNonSurvivor?: boolean;
}

/**
 * Build a mock arrangement clip and invoke handleArrangementStartOperation.
 * Shared between the non-survivor and take-lane scenarios.
 *
 * @param opts - Options describing the mock clip and call shape
 * @returns The result and the shared tracksWithMovedClips map
 */
function callArrangementStart(opts: CallArrangementStartOptions): {
  result: string | null;
  tracksWithMovedClips: Map<number, number>;
} {
  const mockClip: Record<string, unknown> = {
    id: opts.clipId,
    getProperty: vi.fn((prop) => {
      if (prop === "is_arrangement_clip") return 1;

      return null;
    }),
    trackIndex: opts.trackIndex,
  };

  if (opts.path != null) mockClip.path = opts.path;
  if (opts.exists != null) mockClip.exists = opts.exists;

  const tracksWithMovedClips = new Map<number, number>();

  const result = handleArrangementStartOperation({
    clip: mockClip as unknown as LiveAPI,
    arrangementStartBeats: 16,
    tracksWithMovedClips,
    isMidiClip: true,
    context: mockContext,
    isNonSurvivor: opts.isNonSurvivor,
  });

  return { result, tracksWithMovedClips };
}
