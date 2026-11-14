// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { LIVE_PALETTE } from "#src/live-api-adapter/color/live-palette.ts";
import { snapToPalette } from "#src/live-api-adapter/color/snap-to-palette.ts";

describe("snapToPalette", () => {
  it.each([
    ["red", "#FF0000", "#FF3636"],
    ["orange", "#FFA500", "#FFA529"],
    ["green", "#00FF00", "#1AFF2F"],
    ["blue", "#0000FF", "#1A2F96"],
    ["purple, not the pink-red Live snaps it to", "#800080", "#624BAD"],
    ["mid gray", "#808080", "#7B7B7B"],
    ["white", "#FFFFFF", "#FFFFFF"],
    ["black", "#000000", "#3C3C3C"],
  ])("maps %s %s to %s", (_name, requested, expected) => {
    expect(snapToPalette(requested)).toBe(expected);
  });

  it("lands a near-white on white, not a faintly tinted entry", () => {
    expect(snapToPalette("#F0F0F0")).toBe("#FFFFFF");
  });

  it("lands a light gray on a gray", () => {
    expect(snapToPalette("#C8C8C8")).toBe("#D0D0D0");
  });

  it("does not force a clearly tinted light color onto a gray", () => {
    expect(snapToPalette("#CDF1F8")).toBe("#CDF1F8");
  });

  it("is case-insensitive and returns upper case", () => {
    expect(snapToPalette("#ff0000")).toBe("#FF3636");
  });

  it("leaves every palette entry as it is", () => {
    for (const entry of LIVE_PALETTE) {
      expect(snapToPalette(entry)).toBe(entry);
    }
  });

  it("has Live's 70 entries", () => {
    expect(LIVE_PALETTE).toHaveLength(70);
    expect(new Set(LIVE_PALETTE).size).toBe(70);
  });
});
