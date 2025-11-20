import { beforeEach, describe, expect, it } from "vitest";
import { liveApiGet, liveApiId } from "../../test/mock-live-api.js";
import { calculateSceneLength } from "./duplicate-track-scene-helpers.js";

describe("duplicate-track-scene-helpers", () => {
  beforeEach(() => {
    // Mock live_set
    liveApiId.mockImplementation(function () {
      if (this.path === "live_set") {
        return "id 1";
      }
      return `id ${Math.random()}`;
    });

    liveApiGet.mockImplementation(function (property) {
      if (this.path === "live_set" && property === "tracks") {
        return ["id", "10", "id", "11", "id", "12"];
      }
      return [];
    });
  });

  describe("calculateSceneLength", () => {
    it("should return default minimum length when scene has no clips", () => {
      // Mock tracks with no clips
      liveApiGet.mockImplementation(function (property) {
        if (property === "tracks") {
          return ["id", "10"];
        }
        if (property === "has_clip") {
          return [0];
        }
        return [];
      });

      const length = calculateSceneLength(0);

      expect(length).toBe(4); // Default minimum scene length
    });

    it("should return length of longest clip in scene", () => {
      // Mock scenario: track 0 has clip with length 8, track 1 has clip with length 12
      liveApiGet.mockImplementation(function (property) {
        if (this.path === "live_set" && property === "tracks") {
          return ["id", "10", "id", "11"];
        }
        if (property === "has_clip") {
          return [1];
        }
        if (property === "length") {
          // Different lengths for different tracks
          if (this.path.includes("tracks 0")) {
            return [8];
          }
          if (this.path.includes("tracks 1")) {
            return [12];
          }
        }
        return [];
      });

      const length = calculateSceneLength(0);

      expect(length).toBe(12); // Length of longest clip
    });
  });
});
