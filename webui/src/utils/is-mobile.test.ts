// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from "vitest";
import { isMobile } from "#webui/utils/is-mobile";

describe("isMobile", () => {
  it("returns true when viewport is below 768px", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: true,
    } as MediaQueryList);

    expect(isMobile()).toBe(true);
  });

  it("returns false when viewport is at or above 768px", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: false,
    } as MediaQueryList);

    expect(isMobile()).toBe(false);
  });
});
