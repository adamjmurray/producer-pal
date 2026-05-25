// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { isFirefox } from "#webui/utils/browser-detect";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isFirefox", () => {
  it("returns true when navigator.userAgent contains 'Firefox'", () => {
    vi.stubGlobal("navigator", {
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:140.0) Gecko/20100101 Firefox/140.0",
    });
    expect(isFirefox()).toBe(true);
  });

  it("returns false for Chrome's user agent", () => {
    vi.stubGlobal("navigator", {
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    });
    expect(isFirefox()).toBe(false);
  });

  it("returns false for Safari's user agent", () => {
    vi.stubGlobal("navigator", {
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15",
    });
    expect(isFirefox()).toBe(false);
  });

  it("returns false when navigator is undefined (SSR safety)", () => {
    vi.stubGlobal("navigator", undefined);
    expect(isFirefox()).toBe(false);
  });
});
