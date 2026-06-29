// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/preact";
import { useMessageQueue } from "#webui/hooks/chat/use-message-queue";

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

  it("captures the override once from the first queued message of a turn", async () => {
    const { result } = renderHook(() => useMessageQueue());

    // The first message defines the turn's override; later messages in the same
    // turn cannot change it (AJM-552), so the second message's override is
    // ignored even when it differs.
    await act(() => result.current.enqueueMessage("a", { thinking: "high" }));
    await act(() => result.current.enqueueMessage("b", { thinking: "off" }));

    let drained: ReturnType<typeof result.current.drainQueue>;

    await act(() => {
      drained = result.current.drainQueue();
    });

    expect(drained!.overrides).toStrictEqual({ thinking: "high" });
  });

  it("recaptures the override on the next turn after draining", async () => {
    const { result } = renderHook(() => useMessageQueue());

    await act(() => result.current.enqueueMessage("a", { thinking: "high" }));
    await act(() => {
      result.current.drainQueue();
    });

    await act(() => result.current.enqueueMessage("b", { thinking: "off" }));

    let drained: ReturnType<typeof result.current.drainQueue>;

    await act(() => {
      drained = result.current.drainQueue();
    });

    expect(drained!.overrides).toStrictEqual({ thinking: "off" });
  });

  it("drains all messages in FIFO order and clears queue", async () => {
    const { result } = renderHook(() => useMessageQueue());

    await act(() => result.current.enqueueMessage("first"));
    await act(() => result.current.enqueueMessage("second"));

    let drained: ReturnType<typeof result.current.drainQueue>;

    await act(() => {
      drained = result.current.drainQueue();
    });

    expect(drained!.messages).toHaveLength(2);
    expect(drained!.messages[0]?.text).toBe("first");
    expect(drained!.messages[1]?.text).toBe("second");
    expect(result.current.queuedMessages).toStrictEqual([]);
  });

  it("returns an empty result when draining empty queue", async () => {
    const { result } = renderHook(() => useMessageQueue());

    let drained: ReturnType<typeof result.current.drainQueue>;

    await act(() => {
      drained = result.current.drainQueue();
    });

    expect(drained!.messages).toStrictEqual([]);
    expect(drained!.overrides).toBeUndefined();
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

  it("resets the captured override when removeMessage empties the queue", async () => {
    const { result } = renderHook(() => useMessageQueue());

    await act(() => result.current.enqueueMessage("a", { thinking: "high" }));

    const onlyId = result.current.queuedMessages[0]!.id;

    await act(() => result.current.removeMessage(onlyId));

    // Next message starts a fresh turn and recaptures its own override.
    await act(() => result.current.enqueueMessage("b", { thinking: "off" }));

    let drained: ReturnType<typeof result.current.drainQueue>;

    await act(() => {
      drained = result.current.drainQueue();
    });

    expect(drained!.overrides).toStrictEqual({ thinking: "off" });
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
