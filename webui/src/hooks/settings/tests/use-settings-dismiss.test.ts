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

  it("shakes instead of dismissing while a sub-form is open", async () => {
    // No unsaved settings, but the Presets tab's create form holds a draft
    // that closing would silently discard.
    const handleCancel = vi.fn();
    const { result } = renderHook(() =>
      useSettingsDismiss({
        ...defaultOptions,
        blockDismiss: true,
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

  describe("backdrop clicks", () => {
    const overlay = { id: "overlay" };
    const inPanel = { id: "in-panel" };

    it("dismisses when press and release land on the backdrop", async () => {
      const handleCancel = vi.fn();
      const { result } = renderHook(() =>
        useSettingsDismiss({
          ...defaultOptions,
          handleCancelSettings: handleCancel,
        }),
      );

      await act(() => {
        result.current.overlayHandlers.onMouseDown({
          target: overlay,
        } as unknown as MouseEvent);
        result.current.overlayHandlers.onMouseUp({
          target: overlay,
        } as unknown as MouseEvent);
        result.current.overlayHandlers.onClick({
          target: overlay,
        } as unknown as MouseEvent);
      });

      expect(handleCancel).toHaveBeenCalledOnce();
    });

    it("ignores a drag that starts inside the panel and ends on the backdrop", async () => {
      const handleCancel = vi.fn();
      const { result } = renderHook(() =>
        useSettingsDismiss({
          ...defaultOptions,
          handleCancelSettings: handleCancel,
        }),
      );

      await act(() => {
        result.current.overlayHandlers.onMouseDown({
          target: inPanel,
        } as unknown as MouseEvent);
        result.current.overlayHandlers.onMouseUp({
          target: overlay,
        } as unknown as MouseEvent);
        result.current.overlayHandlers.onClick({
          target: overlay,
        } as unknown as MouseEvent);
      });

      expect(handleCancel).not.toHaveBeenCalled();
      expect(result.current.shake).toBe(false);
    });
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

  it("does not handle Escape when blockEscape is true (yields to the context overlay)", async () => {
    const handleCancel = vi.fn();

    renderHook(() =>
      useSettingsDismiss({
        ...defaultOptions,
        handleCancelSettings: handleCancel,
        blockEscape: true,
      }),
    );

    await act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(handleCancel).not.toHaveBeenCalled();
  });

  it("re-binds the Escape handler when blockEscape flips back to false", async () => {
    const handleCancel = vi.fn();
    const { rerender } = renderHook((props) => useSettingsDismiss(props), {
      initialProps: {
        ...defaultOptions,
        handleCancelSettings: handleCancel,
        blockEscape: true,
      },
    });

    await act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(handleCancel).not.toHaveBeenCalled();

    rerender({
      ...defaultOptions,
      handleCancelSettings: handleCancel,
      blockEscape: false,
    });

    await act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(handleCancel).toHaveBeenCalledOnce();
  });
});
