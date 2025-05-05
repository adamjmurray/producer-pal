// device/utils.test.js
import { describe, it, expect } from "vitest";
const { cssToLiveColor, liveColorToCss } = require("./utils");

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
