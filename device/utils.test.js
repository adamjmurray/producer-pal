// device/utils.test.js
import { describe, it, expect } from "vitest";
const { parseIds, parseId, liveColorToCss, cssToLiveColor } = require("./utils");

describe("parseIds", () => {
  it("converts Live API id arrays to id strings", () => {
    expect(parseIds(["id", "1"])).toEqual(["id 1"]);
    expect(parseIds(["id", "1", "id", "2"])).toEqual(["id 1", "id 2"]);
    expect(parseIds(["id", "1", "id", "2", "id", "3"])).toEqual(["id 1", "id 2", "id 3"]);
  });

  it("handles empty arrays", () => {
    expect(parseIds([])).toEqual([]);
  });

  it("handles odd-length arrays by pairing the last item with undefined", () => {
    expect(parseIds(["id", "1", "id"])).toEqual(["id 1", "id undefined"]);
  });
});

describe("parseId", () => {
  it("converts a single Live API id array to an id string", () => {
    expect(parseId(["id", "1"])).toBe("id 1");
    expect(parseId(["path", "live_set"])).toBe("path live_set");
  });
});

describe("liveColorToCss", () => {
  it("converts Live color format to hex color strings", () => {
    expect(liveColorToCss(16711680)).toBe("#FF0000"); // Red
    expect(liveColorToCss(65280)).toBe("#00FF00"); // Green
    expect(liveColorToCss(255)).toBe("#0000FF"); // Blue
    expect(liveColorToCss(0)).toBe("#000000"); // Black
    expect(liveColorToCss(16777215)).toBe("#FFFFFF"); // White
  });

  it("correctly handles single-digit hex values with padding", () => {
    expect(liveColorToCss(1)).toBe("#000001"); // Almost black
    expect(liveColorToCss(256)).toBe("#000100"); // Very dark green
  });
});

describe("cssToLiveColor", () => {
  it("converts hex colors to Live color format", () => {
    expect(cssToLiveColor("#FF0000")).toBe(16711680); // Red
    expect(cssToLiveColor("#00FF00")).toBe(65280); // Green
    expect(cssToLiveColor("#0000FF")).toBe(255); // Blue
    expect(cssToLiveColor("#000000")).toBe(0); // Black
    expect(cssToLiveColor("#FFFFFF")).toBe(16777215); // White
  });

  it("throws error for invalid formats", () => {
    expect(() => cssToLiveColor("red")).toThrow();
    expect(() => cssToLiveColor("rgb(255, 0, 0)")).toThrow();
    expect(() => cssToLiveColor("#F00")).toThrow();
    expect(() => cssToLiveColor("#12345")).toThrow();
    expect(() => cssToLiveColor("#1234567")).toThrow();
    expect(() => cssToLiveColor("#GGGGGG")).toThrow();
  });

  it("forms a bidirectional conversion with liveColorToCss", () => {
    const originalColor = 16711680; // Red
    const cssColor = liveColorToCss(originalColor);
    const convertedBack = cssToLiveColor(cssColor);
    expect(convertedBack).toBe(originalColor);
  });
});
