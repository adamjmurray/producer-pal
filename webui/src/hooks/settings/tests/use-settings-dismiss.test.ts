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

type DismissOptions = Parameters<typeof useSettingsDismiss>[0];

const defaultOptions = {
  showSettings: true,
  settingsConfigured: true,
  settingsClosing: false,
  hasUnsavedChanges: false,
  handleCancelSettings: vi.fn(),
};

/**
 * Render the hook over the default options with a fresh cancel spy.
 * @param overrides - Option overrides for this case
 * @returns The hook result, its rerender, and the cancel spy
 */
function renderDismiss(overrides: Partial<DismissOptions> = {}) {
  const handleCancel = vi.fn();
  const { result, rerender } = renderHook(
    (props: DismissOptions) => useSettingsDismiss(props),
    {
      initialProps: {
        ...defaultOptions,
        handleCancelSettings: handleCancel,
        ...overrides,
      },
    },
  );

  return { result, rerender, handleCancel };
}

/**
 * Try to dismiss settings and assert it was refused with a shake.
 * @param overrides - Options describing what blocks the dismiss
 */
async function expectShakeInsteadOfDismiss(
  overrides: Partial<DismissOptions>,
): Promise<void> {
  const { result, handleCancel } = renderDismiss(overrides);

  await act(() => result.current.handleSettingsDismiss());

  expect(handleCancel).not.toHaveBeenCalled();
  expect(result.current.shake).toBe(true);
}

/**
 * Dispatch an Escape keydown on the document.
 * @returns Promise resolving once the handler has run
 */
async function pressEscape(): Promise<void> {
  await act(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  });
}

describe("useSettingsDismiss", () => {
  it("dismisses when no unsaved changes", async () => {
    const { result, handleCancel } = renderDismiss();

    await act(() => result.current.handleSettingsDismiss());

    expect(handleCancel).toHaveBeenCalledOnce();
    expect(result.current.shake).toBe(false);
  });

  it("shakes when there are unsaved changes", async () => {
    await expectShakeInsteadOfDismiss({ hasUnsavedChanges: true });
  });

  it("shakes instead of dismissing while a sub-form is open", async () => {
    // No unsaved settings, but the Presets tab's create form holds a draft
    // that closing would silently discard.
    await expectShakeInsteadOfDismiss({ blockDismiss: true });
  });

  it("clears shake state", async () => {
    const { result } = renderDismiss({ hasUnsavedChanges: true });

    await act(() => result.current.handleSettingsDismiss());
    expect(result.current.shake).toBe(true);

    await act(() => result.current.clearShake());
    expect(result.current.shake).toBe(false);
  });

  it("does nothing when settings not configured", async () => {
    const { result, handleCancel } = renderDismiss({
      settingsConfigured: false,
    });

    await act(() => result.current.handleSettingsDismiss());

    expect(handleCancel).not.toHaveBeenCalled();
    expect(result.current.shake).toBe(false);
  });

  describe("backdrop clicks", () => {
    const overlay = { id: "overlay" };
    const inPanel = { id: "in-panel" };

    /**
     * Drive a press-release-click sequence through the overlay handlers.
     * @param handlers - The hook's overlayHandlers
     * @param downTarget - Element the mousedown lands on
     * @returns Promise resolving once the sequence has run
     */
    async function dragToBackdrop(
      handlers: ReturnType<typeof useSettingsDismiss>["overlayHandlers"],
      downTarget: object,
    ): Promise<void> {
      await act(() => {
        handlers.onMouseDown({ target: downTarget } as unknown as MouseEvent);
        handlers.onMouseUp({ target: overlay } as unknown as MouseEvent);
        handlers.onClick({ target: overlay } as unknown as MouseEvent);
      });
    }

    it("dismisses when press and release land on the backdrop", async () => {
      const { result, handleCancel } = renderDismiss();

      await dragToBackdrop(result.current.overlayHandlers, overlay);

      expect(handleCancel).toHaveBeenCalledOnce();
    });

    it("ignores a drag that starts inside the panel and ends on the backdrop", async () => {
      const { result, handleCancel } = renderDismiss();

      await dragToBackdrop(result.current.overlayHandlers, inPanel);

      expect(handleCancel).not.toHaveBeenCalled();
      expect(result.current.shake).toBe(false);
    });
  });

  it("handles Escape key when settings are open", async () => {
    const { handleCancel } = renderDismiss();

    await pressEscape();

    expect(handleCancel).toHaveBeenCalledOnce();
  });

  it("leaves other keys alone while settings are open", async () => {
    const { handleCancel } = renderDismiss();

    await act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    });

    expect(handleCancel).not.toHaveBeenCalled();
  });

  it("ignores Escape key when settings are closed", async () => {
    const { handleCancel } = renderDismiss({ showSettings: false });

    await pressEscape();

    expect(handleCancel).not.toHaveBeenCalled();
  });

  it("does not handle Escape when blockEscape is true (yields to the context overlay)", async () => {
    const { handleCancel } = renderDismiss({ blockEscape: true });

    await pressEscape();

    expect(handleCancel).not.toHaveBeenCalled();
  });

  it("re-binds the Escape handler when blockEscape flips back to false", async () => {
    const { rerender, handleCancel } = renderDismiss({ blockEscape: true });

    await pressEscape();
    expect(handleCancel).not.toHaveBeenCalled();

    rerender({
      ...defaultOptions,
      handleCancelSettings: handleCancel,
      blockEscape: false,
    });

    await pressEscape();
    expect(handleCancel).toHaveBeenCalledOnce();
  });
});
