// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { type DocStatus } from "#webui/hooks/context/use-doc";
import { useSystemPromptSendGate } from "#webui/hooks/context/use-system-prompt-send-gate";

const READY: DocStatus = { kind: "ready", content: "custom prompt" };
const LOADING: DocStatus = { kind: "loading" };
const ERRORED: DocStatus = { kind: "error", message: "boom" };

describe("useSystemPromptSendGate", () => {
  it("sends immediately once the status is ready", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useSystemPromptSendGate(READY, send));

    await act(() => result.current("hi", { thinking: "Off" }));

    expect(send).toHaveBeenCalledWith("hi", { thinking: "Off" });
  });

  it("does not delay a send when the status errored (no override to honor)", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useSystemPromptSendGate(ERRORED, send));

    await act(() => result.current("hi"));

    expect(send).toHaveBeenCalledOnce();
  });

  it("defers a send fired during loading and flushes it with the latest handler once resolved", async () => {
    const staleSend = vi.fn().mockResolvedValue(undefined);
    const freshSend = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ status, send }) => useSystemPromptSendGate(status, send),
      { initialProps: { status: LOADING as DocStatus, send: staleSend } },
    );

    // Invoking the gated send while loading only registers a waiter (no React
    // state update), so no act() wrapper is needed to fire it.
    const sendPromise = result.current("hold me");

    // Still loading: the send is queued, not fired.
    await Promise.resolve();
    expect(staleSend).not.toHaveBeenCalled();

    // The status resolves and a re-render has swapped in a handler carrying the
    // now-loaded override; the queued send must flush through the fresh handler.
    rerender({ status: READY, send: freshSend });
    await act(async () => {
      await sendPromise;
    });

    expect(staleSend).not.toHaveBeenCalled();
    expect(freshSend).toHaveBeenCalledWith("hold me", undefined);
  });

  it("releases a parked send on unmount so its caller can't hang forever", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const { result, unmount } = renderHook(() =>
      useSystemPromptSendGate(LOADING, send),
    );

    // Parked while loading (registers a waiter, doesn't fire yet).
    const sendPromise = result.current("hold me");

    await Promise.resolve();
    expect(send).not.toHaveBeenCalled();

    // Unmount before the status ever resolves: the cleanup releases the parked
    // waiter so the awaiting caller settles instead of hanging.
    await act(async () => {
      unmount();
      await sendPromise;
    });

    expect(send).toHaveBeenCalledWith("hold me", undefined);
  });
});
