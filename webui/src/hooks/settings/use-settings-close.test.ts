// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { renderHook, act } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import {
  SETTINGS_ANIMATION_MS,
  useSettingsClose,
} from "#webui/hooks/settings/use-settings-close";

describe("useSettingsClose", () => {
  it("starts with settingsClosing as false", () => {
    const setViewState = vi.fn();
    const { result } = renderHook(() => useSettingsClose(setViewState));

    expect(result.current.settingsClosing).toBe(false);
  });

  it("sets settingsClosing to true immediately on close", async () => {
    vi.useFakeTimers();
    const setViewState = vi.fn();
    const { result } = renderHook(() => useSettingsClose(setViewState));

    await act(() => {
      result.current.closeSettings(() => {});
    });

    expect(result.current.settingsClosing).toBe(true);
    expect(setViewState).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("calls afterClose and resets after animation delay", async () => {
    vi.useFakeTimers();
    const setViewState = vi.fn();
    const afterClose = vi.fn();
    const { result } = renderHook(() => useSettingsClose(setViewState));

    await act(() => {
      result.current.closeSettings(afterClose);
    });

    expect(afterClose).not.toHaveBeenCalled();

    await act(() => {
      vi.advanceTimersByTime(SETTINGS_ANIMATION_MS);
    });

    expect(afterClose).toHaveBeenCalledOnce();
    expect(result.current.settingsClosing).toBe(false);
    expect(setViewState).toHaveBeenCalledWith({ settingsOpen: false });

    vi.useRealTimers();
  });
});
