// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  liveApiCall,
  liveApiId,
  liveApiPath,
} from "#src/test/mocks/mock-live-api.ts";
import { handleArrangementStartOperation } from "./update-clip-arrangement-helpers.ts";

interface MockPathContext {
  _id?: string;
  _path?: string;
}

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
      });

      expect(outlet).toHaveBeenCalledWith(
        1,
        "arrangementStart parameter ignored for session clip (id 123)",
      );
      expect(result).toBe("123");
    });

    it("should warn and return original clip id when trackIndex is null for arrangement clips", () => {
      liveApiPath.mockReturnValue("live_set"); // Path without tracks pattern

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
      });

      expect(result).toBe("456");
    });

    it("should duplicate clip to new position and delete original", () => {
      const trackIndex = 2;
      const newClipId = "999";

      liveApiPath.mockImplementation(function (this: MockPathContext) {
        if (this._id === "789") {
          return "live_set tracks 2 arrangement_clips 0";
        }

        return this._path;
      });

      // Mock the id getter - LiveAPI.id returns just the number, not "id X" format
      liveApiId.mockImplementation(function (this: MockPathContext) {
        if (this._path === "id 999" || this._path === `id ${newClipId}`) {
          return newClipId;
        }

        return this._id;
      });

      // duplicate_clip_to_arrangement returns array format ["id", number]
      liveApiCall.mockImplementation((method) => {
        if (method === "duplicate_clip_to_arrangement") {
          return ["id", 999];
        }
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
      });

      // Code now formats ID with "id " prefix for Live API calls
      expect(liveApiCall).toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        "id 789",
        32,
      );
      expect(liveApiCall).toHaveBeenCalledWith("delete_clip", "id 789");
      expect(result).toBe(newClipId);
      expect(tracksWithMovedClips.get(trackIndex)).toBe(1);
    });

    it("should warn and return original ID when duplication fails", () => {
      liveApiPath.mockReturnValue("live_set tracks 0 arrangement_clips 0");

      // duplicate_clip_to_arrangement returns "id 0" (non-existent)
      liveApiCall.mockImplementation((method) => {
        if (method === "duplicate_clip_to_arrangement") {
          return ["id", 0];
        }
      });

      liveApiId.mockImplementation(function (this: MockPathContext) {
        return this._id;
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
      });

      // Should warn about failure and return original clip ID
      expect(outlet).toHaveBeenCalledWith(
        1,
        "failed to duplicate clip 100 - original preserved",
      );
      expect(result).toBe("100");
      // Should NOT call delete_clip since duplication failed
      expect(liveApiCall).not.toHaveBeenCalledWith(
        "delete_clip",
        expect.anything(),
      );
    });

    it("should increment move count for multiple moves on same track", () => {
      const trackIndex = 1;
      const newClipId = "888";

      liveApiPath.mockReturnValue("live_set tracks 1 arrangement_clips 0");

      liveApiId.mockImplementation(function (this: MockPathContext) {
        if (this._path === `id ${newClipId}`) {
          return newClipId;
        }

        return this._id;
      });

      // duplicate_clip_to_arrangement returns array format ["id", number]
      liveApiCall.mockImplementation((method) => {
        if (method === "duplicate_clip_to_arrangement") {
          return ["id", 888];
        }
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
      });

      expect(tracksWithMovedClips.get(trackIndex)).toBe(3);
    });
  });
});
