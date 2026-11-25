// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * @vitest-environment happy-dom
 */
import { renderHook } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSettingsDeepLink } from "#webui/hooks/view-state/use-settings-deep-link";

describe("useSettingsDeepLink", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("opens the named tab and removes the parameter", () => {
    window.history.replaceState(null, "", "/chat?settings=installation");
    const openSettings = vi.fn();

    renderHook(() => useSettingsDeepLink(openSettings));

    expect(openSettings).toHaveBeenCalledExactlyOnceWith("installation");
    expect(window.location.search).toBe("");
  });

  it("leaves the hash and other parameters alone", () => {
    window.history.replaceState(
      null,
      "",
      "/chat?demo=1&settings=installation#abc-123",
    );

    renderHook(() => useSettingsDeepLink(vi.fn()));

    expect(window.location.search).toBe("?demo=1");
    expect(window.location.hash).toBe("#abc-123");
  });

  it("ignores a tab that doesn't exist, but still removes the parameter", () => {
    window.history.replaceState(null, "", "/chat?settings=nope");
    const openSettings = vi.fn();

    renderHook(() => useSettingsDeepLink(openSettings));

    expect(openSettings).not.toHaveBeenCalled();
    expect(window.location.search).toBe("");
  });

  it("does nothing without the parameter", () => {
    window.history.replaceState(null, "", "/chat#abc-123");
    const openSettings = vi.fn();

    renderHook(() => useSettingsDeepLink(openSettings));

    expect(openSettings).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("#abc-123");
  });

  describe("fallback tab", () => {
    it("opens it when the URL names no tab", () => {
      const openSettings = vi.fn();

      renderHook(() => useSettingsDeepLink(openSettings, "connection"));

      expect(openSettings).toHaveBeenCalledExactlyOnceWith("connection");
    });

    it("opens it when the named tab doesn't exist", () => {
      window.history.replaceState(null, "", "/chat?settings=nope");
      const openSettings = vi.fn();

      renderHook(() => useSettingsDeepLink(openSettings, "connection"));

      expect(openSettings).toHaveBeenCalledExactlyOnceWith("connection");
      expect(window.location.search).toBe("");
    });

    it("loses to a tab named in the URL", () => {
      window.history.replaceState(null, "", "/chat?settings=installation");
      const openSettings = vi.fn();

      renderHook(() => useSettingsDeepLink(openSettings, "connection"));

      expect(openSettings).toHaveBeenCalledExactlyOnceWith("installation");
    });
  });
});
