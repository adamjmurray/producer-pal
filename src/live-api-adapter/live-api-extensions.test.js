import { beforeEach, describe, expect, it, vi } from "vitest";
import { liveApiGet } from "../test/mock-live-api.js";
import "./live-api-extensions.js";

describe("LiveAPI extensions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getProperty", () => {
    it("should handle available_warp_modes property", () => {
      const clip = new LiveAPI("live_set tracks 0 clip_slots 0 clip");

      liveApiGet.mockReturnValue(["Classic", "Beats", "Complex"]);

      const warpModes = clip.getProperty("available_warp_modes");

      expect(warpModes).toStrictEqual(["Classic", "Beats", "Complex"]);
    });

    it("should handle scale_intervals property", () => {
      const clip = new LiveAPI("live_set tracks 0 clip_slots 0 clip");

      liveApiGet.mockReturnValue([0, 2, 4, 5, 7, 9, 11]);

      const intervals = clip.getProperty("scale_intervals");

      expect(intervals).toStrictEqual([0, 2, 4, 5, 7, 9, 11]);
    });
  });

  describe("setAll", () => {
    it("should set multiple properties at once", () => {
      const track = new LiveAPI("live_set tracks 0");
      const setSpy = vi.spyOn(track, "set");

      track.setAll({
        name: "My Track",
        volume: 0.8,
        panning: -0.5,
      });

      expect(setSpy).toHaveBeenCalledWith("name", "My Track");
      expect(setSpy).toHaveBeenCalledWith("volume", 0.8);
      expect(setSpy).toHaveBeenCalledWith("panning", -0.5);
    });

    it("should skip null values", () => {
      const track = new LiveAPI("live_set tracks 0");
      const setSpy = vi.spyOn(track, "set");

      track.setAll({
        name: "My Track",
        volume: null,
        panning: -0.5,
      });

      expect(setSpy).toHaveBeenCalledWith("name", "My Track");
      expect(setSpy).not.toHaveBeenCalledWith("volume", null);
      expect(setSpy).toHaveBeenCalledWith("panning", -0.5);
    });

    it("should handle color property with setColor", () => {
      const track = new LiveAPI("live_set tracks 0");
      const setColorSpy = vi.spyOn(track, "setColor");
      const setSpy = vi.spyOn(track, "set");

      track.setAll({
        name: "My Track",
        color: "#FF0000",
      });

      expect(setColorSpy).toHaveBeenCalledWith("#FF0000");
      expect(setSpy).toHaveBeenCalledWith("name", "My Track");
    });
  });

  describe("clipSlotIndex property", () => {
    it("should extract clip slot index from clip_slots path", () => {
      const clipSlot = new LiveAPI("live_set tracks 2 clip_slots 5");

      expect(clipSlot.clipSlotIndex).toBe(5);
    });

    it("should extract clip slot index from scenes path", () => {
      const scene = new LiveAPI("live_set scenes 3");

      expect(scene.clipSlotIndex).toBe(3);
    });

    it("should return null for non-clip-slot paths", () => {
      const track = new LiveAPI("live_set tracks 0");

      expect(track.clipSlotIndex).toBeNull();
    });
  });
});
