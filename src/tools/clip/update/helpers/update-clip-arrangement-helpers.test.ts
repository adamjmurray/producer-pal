// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { handleArrangementStartOperation } from "./update-clip-arrangement-helpers.ts";

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
      const trackIndex = 0;

      const trackMock = registerMockObject(`live_set/tracks/${trackIndex}`, {
        path: `live_set tracks ${trackIndex}`,
      });

      const mockClip = {
        id: "200",
        exists: () => true,
        getProperty: vi.fn((prop) => {
          if (prop === "is_arrangement_clip") return 1;

          return null;
        }),
        trackIndex,
      };

      const tracksWithMovedClips = new Map<number, number>();

      const result = handleArrangementStartOperation({
        clip: mockClip as unknown as LiveAPI,
        arrangementStartBeats: 16,
        tracksWithMovedClips,
        isMidiClip: true,
        context: mockContext,
        isNonSurvivor: true,
      });

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
      expect(tracksWithMovedClips.get(trackIndex)).toBe(1);
    });

    it("should warn and skip deletion for already-deleted non-survivor clips", () => {
      const trackIndex = 0;

      const trackMock = registerMockObject(`live_set/tracks/${trackIndex}`, {
        path: `live_set tracks ${trackIndex}`,
      });

      const mockClip = {
        id: "200",
        exists: () => false,
        getProperty: vi.fn((prop) => {
          if (prop === "is_arrangement_clip") return 1;

          return null;
        }),
        trackIndex,
      };

      const tracksWithMovedClips = new Map<number, number>();

      const result = handleArrangementStartOperation({
        clip: mockClip as unknown as LiveAPI,
        arrangementStartBeats: 16,
        tracksWithMovedClips,
        isMidiClip: true,
        context: mockContext,
        isNonSurvivor: true,
      });

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
      expect(tracksWithMovedClips.get(trackIndex)).toBe(1);
    });
  });
});
