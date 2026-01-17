import { beforeEach, describe, expect, it, vi } from "vitest";
import { LiveAPI } from "#src/test/mocks/mock-live-api.js";
import "./live-api-extensions.js";

describe("LiveAPI extensions - color methods", () => {
  let api;

  beforeEach(() => {
    api = LiveAPI.from("live_set");
    vi.resetAllMocks();
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
      api.getProperty = vi.fn().mockReturnValue();
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
