// src/live-api-extensions.test.js
import { beforeEach, describe, expect, it, vi } from "vitest";
import "./live-api-extensions";
import { LiveAPI, liveApiId } from "./mock-live-api";

describe("LiveAPI extensions", () => {
  let api;

  beforeEach(() => {
    api = new LiveAPI("live_set");
    vi.resetAllMocks();
  });

  describe("exists", () => {
    it("returns true when LiveAPI object exists", () => {
      liveApiId.mockReturnValue("1");
      expect(api.exists()).toBe(true);
    });

    it("returns false when LiveAPI object does not exist ('id 0' case)", () => {
      liveApiId.mockReturnValue("id 0");
      expect(api.exists()).toBe(false);
    });

    it("returns false when LiveAPI object does not exist  ('0' case)", () => {
      liveApiId.mockReturnValue("0");
      expect(api.exists()).toBe(false);
    });
  });

  describe("getProperty", () => {
    it("returns the first element from LiveAPI get()", () => {
      api.get = vi.fn().mockReturnValue(["test_value"]);
      expect(api.getProperty("name")).toBe("test_value");
      expect(api.get).toHaveBeenCalledWith("name");
    });

    it("returns undefined when get() returns undefined", () => {
      api.get = vi.fn().mockReturnValue(undefined);
      expect(api.getProperty("missing")).toBeUndefined();
    });

    it("returns undefined when get() returns empty array", () => {
      api.get = vi.fn().mockReturnValue([]);
      expect(api.getProperty("empty")).toBeUndefined();
    });

    it("returns the full array for scale_intervals", () => {
      const intervals = [0, 2, 4, 5, 7, 9, 11];
      api.get = vi.fn().mockReturnValue(intervals);
      expect(api.getProperty("scale_intervals")).toEqual(intervals);
      expect(api.get).toHaveBeenCalledWith("scale_intervals");
    });

    it("returns the full array for available_warp_modes", () => {
      const modes = [0, 1, 2, 3, 4];
      api.get = vi.fn().mockReturnValue(modes);
      expect(api.getProperty("available_warp_modes")).toEqual(modes);
      expect(api.get).toHaveBeenCalledWith("available_warp_modes");
    });
  });

  describe("getChildIds", () => {
    it("parses id pairs from LiveAPI response", () => {
      api.get = vi.fn().mockReturnValue(["id", "1", "id", "2", "id", "3"]);
      expect(api.getChildIds("tracks")).toEqual(["id 1", "id 2", "id 3"]);
    });

    it("returns empty array when get() returns non-array", () => {
      api.get = vi.fn().mockReturnValue(undefined);
      expect(api.getChildIds("tracks")).toEqual([]);
    });

    it("returns empty array when no id pairs found", () => {
      api.get = vi.fn().mockReturnValue(["something", "else"]);
      expect(api.getChildIds("tracks")).toEqual([]);
    });

    it("handles partial id pairs", () => {
      api.get = vi.fn().mockReturnValue(["id", "1", "something"]);
      expect(api.getChildIds("tracks")).toEqual(["id 1"]);
    });
  });

  describe("getChildren", () => {
    it("returns LiveAPI objects for each child ID", () => {
      api.get = vi.fn().mockReturnValue(["id", "1", "id", "2"]);
      const children = api.getChildren("tracks");

      expect(children).toHaveLength(2);
      expect(children[0]).toBeInstanceOf(LiveAPI);
      expect(children[0].path).toBe("id 1");
      expect(children[1]).toBeInstanceOf(LiveAPI);
      expect(children[1].path).toBe("id 2");
    });

    it("returns empty array when no children", () => {
      api.get = vi.fn().mockReturnValue([]);
      expect(api.getChildren("tracks")).toEqual([]);
    });
  });

  describe("getColor", () => {
    it("converts Live color format to hex color strings", () => {
      api.getProperty = vi.fn().mockReturnValue(16711680); // Red
      expect(api.getColor()).toBe("#FF0000");
    });

    it("handles black color", () => {
      api.getProperty = vi.fn().mockReturnValue(0);
      expect(api.getColor()).toBe("#000000");
    });

    it("handles white color", () => {
      api.getProperty = vi.fn().mockReturnValue(16777215);
      expect(api.getColor()).toBe("#FFFFFF");
    });

    it("returns null when color property is undefined", () => {
      api.getProperty = vi.fn().mockReturnValue(undefined);
      expect(api.getColor()).toBeNull();
    });

    it("pads single-digit hex values", () => {
      api.getProperty = vi.fn().mockReturnValue(1);
      expect(api.getColor()).toBe("#000001");
    });

    it("handles green color", () => {
      api.getProperty = vi.fn().mockReturnValue(65280);
      expect(api.getColor()).toBe("#00FF00");
    });

    it("handles blue color", () => {
      api.getProperty = vi.fn().mockReturnValue(255);
      expect(api.getColor()).toBe("#0000FF");
    });
  });

  describe("from", () => {
    it("creates LiveAPI with 'id ' prefix for numeric ID", () => {
      const api = LiveAPI.from("123");
      expect(api.path).toBe("id 123");
    });

    it("creates LiveAPI with 'id ' prefix for number type", () => {
      const api = LiveAPI.from(456);
      expect(api.path).toBe("id 456");
    });

    it("creates LiveAPI with 'id ' prefix for string digits only", () => {
      const api = LiveAPI.from("789");
      expect(api.path).toBe("id 789");
    });

    it("uses path as-is for already prefixed ID", () => {
      const api = LiveAPI.from("id 123");
      expect(api.path).toBe("id 123");
    });

    it("uses path as-is for normal Live API paths", () => {
      const api = LiveAPI.from("live_set tracks 0");
      expect(api.path).toBe("live_set tracks 0");
    });

    it("uses path as-is for strings with non-digit characters", () => {
      const api = LiveAPI.from("123abc");
      expect(api.path).toBe("123abc");
    });

    it("uses path as-is for strings with leading zero followed by non-digits", () => {
      const api = LiveAPI.from("0x123");
      expect(api.path).toBe("0x123");
    });

    it("handles ['id', '123'] array format from Live API calls", () => {
      const api = LiveAPI.from(["id", "123"]);
      expect(api.path).toBe("id 123");
    });

    it("handles ['id', 456] array format with numeric ID", () => {
      const api = LiveAPI.from(["id", 456]);
      expect(api.path).toBe("id 456");
    });

    it("throws error for array not in ['id', value] format", () => {
      expect(() => LiveAPI.from(["something", "else"])).toThrow(
        "Invalid array format",
      );
    });

    it("throws error for array with wrong length", () => {
      expect(() => LiveAPI.from(["id"])).toThrow("Invalid array format");
    });

    it("throws error for array where first element is not 'id'", () => {
      expect(() => LiveAPI.from(["path", "123"])).toThrow(
        "Invalid array format",
      );
    });
  });

  describe("setColor", () => {
    beforeEach(() => {
      api.set = vi.fn();
    });

    it("converts hex colors to Live color format", () => {
      api.setColor("#FF0000");
      expect(api.set).toHaveBeenCalledWith("color", 16711680);
    });

    it("handles black", () => {
      api.setColor("#000000");
      expect(api.set).toHaveBeenCalledWith("color", 0);
    });

    it("handles white", () => {
      api.setColor("#FFFFFF");
      expect(api.set).toHaveBeenCalledWith("color", 16777215);
    });

    it("handles green", () => {
      api.setColor("#00FF00");
      expect(api.set).toHaveBeenCalledWith("color", 65280);
    });

    it("handles blue", () => {
      api.setColor("#0000FF");
      expect(api.set).toHaveBeenCalledWith("color", 255);
    });

    it("throws error for invalid format without #", () => {
      expect(() => api.setColor("red")).toThrow();
      expect(() => api.setColor("rgb(255, 0, 0)")).toThrow();
    });

    it("throws error for wrong length", () => {
      expect(() => api.setColor("#F00")).toThrow();
      expect(() => api.setColor("#12345")).toThrow();
      expect(() => api.setColor("#1234567")).toThrow();
    });

    it("throws error for invalid hex characters", () => {
      expect(() => api.setColor("#GGGGGG")).toThrow();
    });

    it("forms a bidirectional conversion with getColor", () => {
      const originalColor = 16711680; // Red
      api.getProperty = vi.fn().mockReturnValue(originalColor);

      const cssColor = api.getColor();
      expect(cssColor).toBe("#FF0000");

      api.setColor(cssColor);
      expect(api.set).toHaveBeenCalledWith("color", originalColor);
    });
  });

  describe("setAll", () => {
    beforeEach(() => {
      api.set = vi.fn();
      api.setColor = vi.fn();
    });

    it("sets all non-null properties", () => {
      api.setAll({
        name: "Test Clip",
        signature_numerator: 4,
        signature_denominator: 4,
        start_marker: 0,
        end_marker: 4,
      });

      expect(api.set).toHaveBeenCalledWith("name", "Test Clip");
      expect(api.set).toHaveBeenCalledWith("signature_numerator", 4);
      expect(api.set).toHaveBeenCalledWith("signature_denominator", 4);
      expect(api.set).toHaveBeenCalledWith("start_marker", 0);
      expect(api.set).toHaveBeenCalledWith("end_marker", 4);
      expect(api.set).toHaveBeenCalledTimes(5);
    });

    it("skips null values", () => {
      api.setAll({
        name: "Test",
        start_marker: null,
        end_marker: 4,
      });

      expect(api.set).toHaveBeenCalledWith("name", "Test");
      expect(api.set).toHaveBeenCalledWith("end_marker", 4);
      expect(api.set).toHaveBeenCalledTimes(2);
      expect(api.set).not.toHaveBeenCalledWith("start_marker", null);
    });

    it("skips undefined values", () => {
      api.setAll({
        name: "Test",
        start_marker: undefined,
        end_marker: 4,
      });

      expect(api.set).toHaveBeenCalledWith("name", "Test");
      expect(api.set).toHaveBeenCalledWith("end_marker", 4);
      expect(api.set).toHaveBeenCalledTimes(2);
      expect(api.set).not.toHaveBeenCalledWith("start_marker", undefined);
    });

    it("uses setColor for color property", () => {
      api.setAll({
        name: "Colored Clip",
        color: "#FF0000",
      });

      expect(api.set).toHaveBeenCalledWith("name", "Colored Clip");
      expect(api.setColor).toHaveBeenCalledWith("#FF0000");
      expect(api.set).toHaveBeenCalledTimes(1);
      expect(api.set).not.toHaveBeenCalledWith("color", "#FF0000");
    });

    it("handles empty object", () => {
      api.setAll({});

      expect(api.set).not.toHaveBeenCalled();
      expect(api.setColor).not.toHaveBeenCalled();
    });

    it("handles mix of color and other properties with null values", () => {
      api.setAll({
        name: "Mixed",
        color: "#00FF00",
        loop_start: null,
        loop_end: 8,
        looping: true,
      });

      expect(api.set).toHaveBeenCalledWith("name", "Mixed");
      expect(api.setColor).toHaveBeenCalledWith("#00FF00");
      expect(api.set).toHaveBeenCalledWith("loop_end", 8);
      expect(api.set).toHaveBeenCalledWith("looping", true);
      expect(api.set).toHaveBeenCalledTimes(3);
      expect(api.set).not.toHaveBeenCalledWith("loop_start", null);
    });

    it("skips color when null", () => {
      api.setAll({
        name: "Test",
        color: null,
      });

      expect(api.set).toHaveBeenCalledWith("name", "Test");
      expect(api.setColor).not.toHaveBeenCalled();
    });

    it("allows zero as a valid value", () => {
      api.setAll({
        start_marker: 0,
        value: 0,
      });

      expect(api.set).toHaveBeenCalledWith("start_marker", 0);
      expect(api.set).toHaveBeenCalledWith("value", 0);
      expect(api.set).toHaveBeenCalledTimes(2);
    });

    it("allows false as a valid value", () => {
      api.setAll({
        looping: false,
      });

      expect(api.set).toHaveBeenCalledWith("looping", false);
    });

    it("allows empty string as a valid value", () => {
      api.setAll({
        name: "",
      });

      expect(api.set).toHaveBeenCalledWith("name", "");
    });
  });

  describe("Path Index Extensions", () => {
    describe("trackIndex", () => {
      it("should return trackIndex from valid track path", () => {
        const track = new LiveAPI("live_set tracks 3");
        expect(track.trackIndex).toBe(3);
      });

      it("should return trackIndex from clip_slots path", () => {
        const clipSlot = new LiveAPI("live_set tracks 5 clip_slots 2");
        expect(clipSlot.trackIndex).toBe(5);
      });

      it("should return trackIndex from nested device path", () => {
        const device = new LiveAPI("live_set tracks 7 devices 1");
        expect(device.trackIndex).toBe(7);
      });

      it("should return null for non-track paths", () => {
        const liveSet = new LiveAPI("live_set");
        expect(liveSet.trackIndex).toBe(null);

        const scene = new LiveAPI("live_set scenes 2");
        expect(scene.trackIndex).toBe(null);
      });

      it("should handle track index 0", () => {
        const track = new LiveAPI("live_set tracks 0");
        expect(track.trackIndex).toBe(0);
      });

      it("should handle double-digit track indices", () => {
        const track = new LiveAPI("live_set tracks 42");
        expect(track.trackIndex).toBe(42);
      });
    });

    describe("sceneIndex", () => {
      it("should return sceneIndex from valid scene path", () => {
        const scene = new LiveAPI("live_set scenes 4");
        expect(scene.sceneIndex).toBe(4);
      });

      it("should return sceneIndex from clip_slots path (session view)", () => {
        const clipSlot = new LiveAPI("live_set tracks 2 clip_slots 6");
        expect(clipSlot.sceneIndex).toBe(6);
      });

      it("should prioritize scene path over clip_slots path", () => {
        // This would be an unusual case, but scene path should win
        const scene = new LiveAPI("live_set scenes 10");
        expect(scene.sceneIndex).toBe(10);
      });

      it("should return null for non-scene/clip_slots paths", () => {
        const liveSet = new LiveAPI("live_set");
        expect(liveSet.sceneIndex).toBe(null);

        const track = new LiveAPI("live_set tracks 1");
        expect(track.sceneIndex).toBe(null);

        const device = new LiveAPI("live_set tracks 1 devices 0");
        expect(device.sceneIndex).toBe(null);
      });

      it("should handle scene index 0", () => {
        const scene = new LiveAPI("live_set scenes 0");
        expect(scene.sceneIndex).toBe(0);

        const clipSlot = new LiveAPI("live_set tracks 1 clip_slots 0");
        expect(clipSlot.sceneIndex).toBe(0);
      });

      it("should handle double-digit scene indices", () => {
        const scene = new LiveAPI("live_set scenes 99");
        expect(scene.sceneIndex).toBe(99);

        const clipSlot = new LiveAPI("live_set tracks 5 clip_slots 99");
        expect(clipSlot.sceneIndex).toBe(99);
      });
    });

    describe("clipSlotIndex", () => {
      it("should return clipSlotIndex from valid clip_slots path", () => {
        const clipSlot = new LiveAPI("live_set tracks 2 clip_slots 6");
        expect(clipSlot.clipSlotIndex).toBe(6);
      });

      it("should return clipSlotIndex from scene path (session view)", () => {
        const scene = new LiveAPI("live_set scenes 8");
        expect(scene.clipSlotIndex).toBe(8);
      });

      it("should prioritize clip_slots path over scene path", () => {
        const clipSlot = new LiveAPI("live_set tracks 1 clip_slots 5");
        expect(clipSlot.clipSlotIndex).toBe(5);
      });

      it("should return clipSlotIndex from nested clip path", () => {
        const clip = new LiveAPI("live_set tracks 1 clip_slots 3 clip");
        expect(clip.clipSlotIndex).toBe(3);
      });

      it("should return null for non-clip_slots/scene paths", () => {
        const liveSet = new LiveAPI("live_set");
        expect(liveSet.clipSlotIndex).toBe(null);

        const track = new LiveAPI("live_set tracks 1");
        expect(track.clipSlotIndex).toBe(null);

        const device = new LiveAPI("live_set tracks 1 devices 0");
        expect(device.clipSlotIndex).toBe(null);
      });

      it("should handle clipSlot index 0", () => {
        const clipSlot = new LiveAPI("live_set tracks 0 clip_slots 0");
        expect(clipSlot.clipSlotIndex).toBe(0);

        const scene = new LiveAPI("live_set scenes 0");
        expect(scene.clipSlotIndex).toBe(0);
      });

      it("should handle double-digit clipSlot indices", () => {
        const clipSlot = new LiveAPI("live_set tracks 15 clip_slots 25");
        expect(clipSlot.clipSlotIndex).toBe(25);

        const scene = new LiveAPI("live_set scenes 25");
        expect(scene.clipSlotIndex).toBe(25);
      });
    });

    describe("session view integration", () => {
      it("should extract both trackIndex and sceneIndex from clip_slots path", () => {
        const clipSlot = new LiveAPI("live_set tracks 8 clip_slots 12");
        expect(clipSlot.trackIndex).toBe(8);
        expect(clipSlot.sceneIndex).toBe(12);
        expect(clipSlot.clipSlotIndex).toBe(12);
      });

      it("should work with scene objects in session view", () => {
        const scene = new LiveAPI("live_set scenes 5");
        expect(scene.trackIndex).toBe(null);
        expect(scene.sceneIndex).toBe(5);
        expect(scene.clipSlotIndex).toBe(5);
      });

      it("should work with complex nested session paths", () => {
        const nestedPath = new LiveAPI(
          "live_set tracks 3 clip_slots 7 clip notes 5",
        );
        expect(nestedPath.trackIndex).toBe(3);
        expect(nestedPath.sceneIndex).toBe(7);
        expect(nestedPath.clipSlotIndex).toBe(7);
      });
    });

    describe("edge cases", () => {
      it("should handle empty path", () => {
        const empty = new LiveAPI("");
        expect(empty.trackIndex).toBe(null);
        expect(empty.sceneIndex).toBe(null);
        expect(empty.clipSlotIndex).toBe(null);
      });

      it("should handle malformed paths", () => {
        const malformed1 = new LiveAPI("live_set tracks");
        expect(malformed1.trackIndex).toBe(null);

        const malformed2 = new LiveAPI("live_set scenes");
        expect(malformed2.sceneIndex).toBe(null);

        const malformed3 = new LiveAPI("live_set tracks clip_slots 5");
        expect(malformed3.clipSlotIndex).toBe(null);
      });

      it("should handle paths with non-numeric indices", () => {
        const nonNumeric1 = new LiveAPI("live_set tracks abc");
        expect(nonNumeric1.trackIndex).toBe(null);

        const nonNumeric2 = new LiveAPI("live_set scenes xyz");
        expect(nonNumeric2.sceneIndex).toBe(null);

        const nonNumeric3 = new LiveAPI("live_set tracks 1 clip_slots abc");
        expect(nonNumeric3.clipSlotIndex).toBe(null);
      });

      it("should handle floating point numbers in paths (should return integer part)", () => {
        // This shouldn't happen in real Live API paths, but test robustness
        const floatTrack = new LiveAPI("live_set tracks 3.5");
        expect(floatTrack.trackIndex).toBe(3);
      });
    });
  });
});
