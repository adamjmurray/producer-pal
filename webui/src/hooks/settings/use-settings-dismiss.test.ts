// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { renderHook, act } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { useSettingsDismiss } from "#webui/hooks/settings/use-settings-dismiss";

describe("useSettingsDismiss", () => {
  const defaultOptions = {
    showSettings: true,
    settingsConfigured: true,
    settingsClosing: false,
    hasUnsavedChanges: false,
    handleCancelSettings: vi.fn(),
  };

  it("dismisses when no unsaved changes", async () => {
    const handleCancel = vi.fn();
    const { result } = renderHook(() =>
      useSettingsDismiss({
        ...defaultOptions,
        handleCancelSettings: handleCancel,
      }),
    );

    await act(() => result.current.handleSettingsDismiss());

    expect(handleCancel).toHaveBeenCalledOnce();
    expect(result.current.shake).toBe(false);
  });

  it("shakes when there are unsaved changes", async () => {
    const handleCancel = vi.fn();
    const { result } = renderHook(() =>
      useSettingsDismiss({
        ...defaultOptions,
        hasUnsavedChanges: true,
        handleCancelSettings: handleCancel,
      }),
    );

    await act(() => result.current.handleSettingsDismiss());

    expect(handleCancel).not.toHaveBeenCalled();
    expect(result.current.shake).toBe(true);
  });

  it("clears shake state", async () => {
    const { result } = renderHook(() =>
      useSettingsDismiss({ ...defaultOptions, hasUnsavedChanges: true }),
    );

    await act(() => result.current.handleSettingsDismiss());
    expect(result.current.shake).toBe(true);

    await act(() => result.current.clearShake());
    expect(result.current.shake).toBe(false);
  });

  it("does nothing when settings not configured", async () => {
    const handleCancel = vi.fn();
    const { result } = renderHook(() =>
      useSettingsDismiss({
        ...defaultOptions,
        settingsConfigured: false,
        handleCancelSettings: handleCancel,
      }),
    );

    await act(() => result.current.handleSettingsDismiss());

    expect(handleCancel).not.toHaveBeenCalled();
    expect(result.current.shake).toBe(false);
  });

  it("handles Escape key when settings are open", async () => {
    const handleCancel = vi.fn();

    renderHook(() =>
      useSettingsDismiss({
        ...defaultOptions,
        handleCancelSettings: handleCancel,
      }),
    );

    await act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(handleCancel).toHaveBeenCalledOnce();
  });

  it("ignores Escape key when settings are closed", async () => {
    const handleCancel = vi.fn();

    renderHook(() =>
      useSettingsDismiss({
        ...defaultOptions,
        showSettings: false,
        handleCancelSettings: handleCancel,
      }),
    );

    await act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(handleCancel).not.toHaveBeenCalled();
  });
});
