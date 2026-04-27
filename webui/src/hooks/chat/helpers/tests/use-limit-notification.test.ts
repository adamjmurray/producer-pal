// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/preact";
import { useLimitNotification } from "#webui/hooks/chat/helpers/use-limit-notification";

/**
 * Render the hook and trigger a notification with the given params.
 * @param params - Notification params
 * @param params.deletedCount - Number of items deleted
 * @param params.limitReached - Whether the limit was reached
 * @returns Hook result ref
 */
async function renderAndNotify(params: {
  deletedCount: number;
  limitReached: boolean;
}) {
  const { result } = renderHook(() => useLimitNotification());

  await act(() => {
    result.current.showLimitNotification(params);
  });

  return result;
}

describe("useLimitNotification", () => {
  it("starts with null notification", () => {
    const { result } = renderHook(() => useLimitNotification());

    expect(result.current.limitNotification).toBeNull();
  });

  it("shows warning when conversations are deleted", async () => {
    const result = await renderAndNotify({
      deletedCount: 3,
      limitReached: false,
    });

    expect(result.current.limitNotification).toStrictEqual({
      message: "Removed 3 old conversations (200 limit)",
      type: "warning",
    });
  });

  it("shows singular message for one deletion", async () => {
    const result = await renderAndNotify({
      deletedCount: 1,
      limitReached: false,
    });

    expect(result.current.limitNotification?.message).toBe(
      "Removed 1 old conversation (200 limit)",
    );
  });

  it("shows limit-reached warning when all slots are bookmarked", async () => {
    const result = await renderAndNotify({
      deletedCount: 0,
      limitReached: true,
    });

    expect(result.current.limitNotification?.message).toContain(
      "Conversation limit",
    );
    expect(result.current.limitNotification?.type).toBe("warning");
  });

  it("does nothing when no enforcement was needed", async () => {
    const result = await renderAndNotify({
      deletedCount: 0,
      limitReached: false,
    });

    expect(result.current.limitNotification).toBeNull();
  });

  it("dismisses notification manually", async () => {
    const result = await renderAndNotify({
      deletedCount: 2,
      limitReached: false,
    });

    expect(result.current.limitNotification).not.toBeNull();

    await act(() => {
      result.current.dismissLimitNotification();
    });

    expect(result.current.limitNotification).toBeNull();
  });

  it("auto-dismisses after timeout", async () => {
    vi.useFakeTimers();

    const result = await renderAndNotify({
      deletedCount: 1,
      limitReached: false,
    });

    expect(result.current.limitNotification).not.toBeNull();

    await act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(result.current.limitNotification).toBeNull();

    vi.useRealTimers();
  });

  it("clears previous timer when show is called again", async () => {
    vi.useFakeTimers();

    const { result } = renderHook(() => useLimitNotification());

    await act(() => {
      result.current.showLimitNotification({
        deletedCount: 1,
        limitReached: false,
      });
    });

    expect(result.current.limitNotification).not.toBeNull();

    // Show again — should clear previous timer
    await act(() => {
      result.current.showLimitNotification({
        deletedCount: 0,
        limitReached: true,
      });
    });

    expect(result.current.limitNotification?.message).toContain(
      "Conversation limit",
    );

    // The first 4s timer should have been cleared, so advancing only 4s
    // from the second call should dismiss
    await act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(result.current.limitNotification).toBeNull();

    vi.useRealTimers();
  });

  describe("showSaveError", () => {
    it("shows error notification with quota-specific hint", async () => {
      const { result } = renderHook(() => useLimitNotification());

      await act(() => {
        result.current.showSaveError(
          new DOMException("disk full", "QuotaExceededError"),
        );
      });

      expect(result.current.limitNotification?.type).toBe("error");
      expect(result.current.limitNotification?.message).toContain(
        "browser storage is full",
      );
    });

    it("shows generic error message for non-quota errors", async () => {
      const { result } = renderHook(() => useLimitNotification());

      await act(() => {
        result.current.showSaveError(new Error("transaction aborted"));
      });

      expect(result.current.limitNotification?.type).toBe("error");
      expect(result.current.limitNotification?.message).toBe(
        "Couldn't save conversation: transaction aborted",
      );
    });

    it("auto-dismisses save error after timeout", async () => {
      vi.useFakeTimers();

      const { result } = renderHook(() => useLimitNotification());

      await act(() => {
        result.current.showSaveError(new Error("boom"));
      });

      expect(result.current.limitNotification).not.toBeNull();

      await act(() => {
        vi.advanceTimersByTime(4000);
      });

      expect(result.current.limitNotification).toBeNull();

      vi.useRealTimers();
    });
  });

  it("clears timer on dismiss when timer is running", async () => {
    vi.useFakeTimers();

    const { result } = renderHook(() => useLimitNotification());

    await act(() => {
      result.current.showLimitNotification({
        deletedCount: 2,
        limitReached: false,
      });
    });

    expect(result.current.limitNotification).not.toBeNull();

    await act(() => {
      result.current.dismissLimitNotification();
    });

    expect(result.current.limitNotification).toBeNull();

    // Advancing time should not cause any issues — timer was cleared
    await act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(result.current.limitNotification).toBeNull();

    vi.useRealTimers();
  });
});
