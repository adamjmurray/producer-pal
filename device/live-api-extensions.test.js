// device/live-api-extensions.test.js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { LiveAPI } from "./mock-live-api";
import "./live-api-extensions";

describe("LiveAPI extensions", () => {
  let api;

  beforeEach(() => {
    api = new LiveAPI("live_set");
    vi.resetAllMocks();
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
});
