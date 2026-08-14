// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { LiveAPI } from "#src/test/mocks/mock-live-api.ts";
import "../../live-api-extensions.ts";

describe("LiveAPI extensions - color methods", () => {
  let api: LiveAPI;

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

    // Assert the specific message: a bare toThrow() can't tell the format guard
    // from the NaN guard, and a "#"-less 7-char string reaches the NaN guard
    // when the format check is broken.
    const FORMAT_ERROR = 'Invalid color format: must be "#RRGGBB"';

    it("throws error for invalid format without #", () => {
      expect(() => api.setColor("red")).toThrow(FORMAT_ERROR);
      expect(() => api.setColor("rgb(255, 0, 0)")).toThrow(FORMAT_ERROR);
    });

    it("throws the format error for a 7-character string with no leading #", () => {
      expect(() => api.setColor("1234567")).toThrow(FORMAT_ERROR);
    });

    it("throws error for wrong length", () => {
      expect(() => api.setColor("#F00")).toThrow(FORMAT_ERROR);
      expect(() => api.setColor("#12345")).toThrow(FORMAT_ERROR);
      expect(() => api.setColor("#1234567")).toThrow(FORMAT_ERROR);
    });

    it("throws error for invalid hex characters", () => {
      expect(() => api.setColor("#GGGGGG")).toThrow(
        "Invalid hex values in color: #GGGGGG",
      );
    });

    // Each channel is parsed and NaN-checked independently, so a color that is
    // bad in only one channel must still be rejected.
    it.each([
      ["#GG0000", "red"],
      ["#00GG00", "green"],
      ["#0000GG", "blue"],
    ])("throws when only the %s channel is invalid (%s)", (cssColor) => {
      expect(() => api.setColor(cssColor)).toThrow(
        `Invalid hex values in color: ${cssColor}`,
      );
      expect(api.set).not.toHaveBeenCalled();
    });

    it("forms a bidirectional conversion with getColor", () => {
      const originalColor = 16711680; // Red

      api.getProperty = vi.fn().mockReturnValue(originalColor);

      const cssColor = api.getColor();

      expect(cssColor).toBe("#FF0000");

      api.setColor(cssColor!);
      expect(api.set).toHaveBeenCalledWith("color", originalColor);
    });
  });
});
