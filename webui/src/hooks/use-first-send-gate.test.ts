// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { useFirstSendGate } from "#webui/hooks/use-first-send-gate";

describe("useFirstSendGate", () => {
  it("sends immediately once nothing is loading", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useFirstSendGate(false, send));

    await act(() => result.current("hi", { thinking: "Off" }));

    expect(send).toHaveBeenCalledWith("hi", { thinking: "Off" });
  });

  it("defers a send fired during loading and flushes it with the latest handler once resolved", async () => {
    const staleSend = vi.fn().mockResolvedValue(undefined);
    const freshSend = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ isLoading, send }) => useFirstSendGate(isLoading, send),
      { initialProps: { isLoading: true, send: staleSend } },
    );

    // Invoking the gated send while loading only registers a waiter (no React
    // state update), so no act() wrapper is needed to fire it.
    const sendPromise = result.current("hold me");

    // Still loading: the send is queued, not fired.
    await Promise.resolve();
    expect(staleSend).not.toHaveBeenCalled();

    // The load resolves and a re-render has swapped in a handler carrying the
    // now-loaded values; the queued send must flush through the fresh handler.
    rerender({ isLoading: false, send: freshSend });
    await act(async () => {
      await sendPromise;
    });

    expect(staleSend).not.toHaveBeenCalled();
    expect(freshSend).toHaveBeenCalledWith("hold me", undefined);
  });

  it("keeps deferring while one input resolves but another is still loading", async () => {
    // The caller ORs its loading inputs (system prompt + notation), so a gate
    // that released as soon as any re-render arrived would still lock a
    // provisional value. Modeled here as the flag staying true across a
    // re-render.
    const send = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ isLoading }) => useFirstSendGate(isLoading, send),
      { initialProps: { isLoading: true } },
    );

    const sendPromise = result.current("hold me");

    await Promise.resolve();

    // A re-render happened (one input resolved) but the OR is still true.
    rerender({ isLoading: true });
    await Promise.resolve();
    expect(send).not.toHaveBeenCalled();

    rerender({ isLoading: false });
    await act(async () => {
      await sendPromise;
    });

    expect(send).toHaveBeenCalledOnce();
  });

  it("releases a parked send on unmount so its caller can't hang forever", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const { result, unmount } = renderHook(() => useFirstSendGate(true, send));

    // Parked while loading (registers a waiter, doesn't fire yet).
    const sendPromise = result.current("hold me");

    await Promise.resolve();
    expect(send).not.toHaveBeenCalled();

    // Unmount before the load ever resolves: the cleanup releases the parked
    // waiter so the awaiting caller settles instead of hanging.
    await act(async () => {
      unmount();
      await sendPromise;
    });

    expect(send).toHaveBeenCalledWith("hold me", undefined);
  });
});
