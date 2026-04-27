// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/preact";
import { useMessageQueue } from "#webui/hooks/chat/helpers/use-message-queue";

describe("useMessageQueue", () => {
  it("starts with an empty queue", () => {
    const { result } = renderHook(() => useMessageQueue());

    expect(result.current.queuedMessages).toStrictEqual([]);
  });

  it("enqueues messages and exposes them in state", async () => {
    const { result } = renderHook(() => useMessageQueue());

    await act(() => result.current.enqueueMessage("hello"));
    await act(() => result.current.enqueueMessage("world"));

    expect(result.current.queuedMessages).toHaveLength(2);
    expect(result.current.queuedMessages[0]?.text).toBe("hello");
    expect(result.current.queuedMessages[1]?.text).toBe("world");
  });

  it("preserves overrides on enqueued messages", async () => {
    const { result } = renderHook(() => useMessageQueue());

    await act(() =>
      result.current.enqueueMessage("test", { thinking: "high" }),
    );

    expect(result.current.queuedMessages[0]?.overrides).toStrictEqual({
      thinking: "high",
    });
  });

  it("drains all messages in FIFO order and clears queue", async () => {
    const { result } = renderHook(() => useMessageQueue());

    await act(() => result.current.enqueueMessage("first"));
    await act(() => result.current.enqueueMessage("second"));

    let drained: ReturnType<typeof result.current.drainQueue>;

    await act(() => {
      drained = result.current.drainQueue();
    });

    expect(drained!).toHaveLength(2);
    expect(drained![0]?.text).toBe("first");
    expect(drained![1]?.text).toBe("second");
    expect(result.current.queuedMessages).toStrictEqual([]);
  });

  it("returns empty array when draining empty queue", async () => {
    const { result } = renderHook(() => useMessageQueue());

    let drained: ReturnType<typeof result.current.drainQueue>;

    await act(() => {
      drained = result.current.drainQueue();
    });

    expect(drained!).toStrictEqual([]);
  });

  it("clears all queued messages", async () => {
    const { result } = renderHook(() => useMessageQueue());

    await act(() => result.current.enqueueMessage("a"));
    await act(() => result.current.enqueueMessage("b"));
    await act(() => result.current.clearQueue());

    expect(result.current.queuedMessages).toStrictEqual([]);
  });

  it("keeps queueRef in sync for synchronous reads", async () => {
    const { result } = renderHook(() => useMessageQueue());

    await act(() => result.current.enqueueMessage("sync-test"));

    expect(result.current.queueRef.current).toHaveLength(1);
    expect(result.current.queueRef.current[0]?.text).toBe("sync-test");
  });

  it("assigns unique ids to each enqueued message", async () => {
    const { result } = renderHook(() => useMessageQueue());

    await act(() => result.current.enqueueMessage("a"));
    await act(() => result.current.enqueueMessage("b"));
    await act(() => result.current.enqueueMessage("c"));

    const ids = result.current.queuedMessages.map((m) => m.id);
    const uniqueIds = new Set(ids);

    expect(uniqueIds.size).toBe(3);
  });

  it("removeMessage removes the message with the given id", async () => {
    const { result } = renderHook(() => useMessageQueue());

    await act(() => result.current.enqueueMessage("a"));
    await act(() => result.current.enqueueMessage("b"));
    await act(() => result.current.enqueueMessage("c"));

    const middleId = result.current.queuedMessages[1]!.id;

    await act(() => result.current.removeMessage(middleId));

    expect(result.current.queuedMessages).toHaveLength(2);
    expect(result.current.queuedMessages[0]?.text).toBe("a");
    expect(result.current.queuedMessages[1]?.text).toBe("c");
  });

  it("removeMessage is a no-op for unknown id", async () => {
    const { result } = renderHook(() => useMessageQueue());

    await act(() => result.current.enqueueMessage("only"));
    await act(() => result.current.removeMessage(999));

    expect(result.current.queuedMessages).toHaveLength(1);
    expect(result.current.queuedMessages[0]?.text).toBe("only");
  });

  it("keeps queueRef in sync after removeMessage", async () => {
    const { result } = renderHook(() => useMessageQueue());

    await act(() => result.current.enqueueMessage("stay"));
    await act(() => result.current.enqueueMessage("go"));

    const removeId = result.current.queuedMessages[1]!.id;

    await act(() => result.current.removeMessage(removeId));

    expect(result.current.queueRef.current).toHaveLength(1);
    expect(result.current.queueRef.current[0]?.text).toBe("stay");
  });
});
