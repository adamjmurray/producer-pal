// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/preact";
import { useLimitNotification } from "./use-limit-notification";

describe("useLimitNotification", () => {
  it("starts with null notification", () => {
    const { result } = renderHook(() => useLimitNotification());

    expect(result.current.limitNotification).toBeNull();
  });

  it("shows warning when conversations are deleted", async () => {
    const { result } = renderHook(() => useLimitNotification());

    await act(() => {
      result.current.showLimitNotification({
        deletedCount: 3,
        limitReached: false,
      });
    });

    expect(result.current.limitNotification).toStrictEqual({
      message: "Removed 3 old conversations (200 limit)",
      type: "warning",
    });
  });

  it("shows singular message for one deletion", async () => {
    const { result } = renderHook(() => useLimitNotification());

    await act(() => {
      result.current.showLimitNotification({
        deletedCount: 1,
        limitReached: false,
      });
    });

    expect(result.current.limitNotification?.message).toBe(
      "Removed 1 old conversation (200 limit)",
    );
  });

  it("shows limit-reached warning when all slots are bookmarked", async () => {
    const { result } = renderHook(() => useLimitNotification());

    await act(() => {
      result.current.showLimitNotification({
        deletedCount: 0,
        limitReached: true,
      });
    });

    expect(result.current.limitNotification?.message).toContain(
      "Conversation limit",
    );
    expect(result.current.limitNotification?.type).toBe("warning");
  });

  it("does nothing when no enforcement was needed", async () => {
    const { result } = renderHook(() => useLimitNotification());

    await act(() => {
      result.current.showLimitNotification({
        deletedCount: 0,
        limitReached: false,
      });
    });

    expect(result.current.limitNotification).toBeNull();
  });

  it("dismisses notification manually", async () => {
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
  });

  it("auto-dismisses after timeout", async () => {
    vi.useFakeTimers();

    const { result } = renderHook(() => useLimitNotification());

    await act(() => {
      result.current.showLimitNotification({
        deletedCount: 1,
        limitReached: false,
      });
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
