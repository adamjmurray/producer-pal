// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/preact";
import { type MessageOverrides } from "#webui/hooks/chat/use-chat-types";
import {
  useMessageQueue,
  type DrainedQueue,
} from "#webui/hooks/chat/use-message-queue";

/** Live handle to the hook under test, as returned by renderHook. */
type QueueHandle = { current: ReturnType<typeof useMessageQueue> };

/** A message to enqueue: bare text, or text paired with its turn overrides. */
type QueueEntry = string | [text: string, overrides: MessageOverrides];

/**
 * Render the useMessageQueue hook under test.
 * @returns The live hook handle
 */
function renderQueue(): QueueHandle {
  const { result } = renderHook(() => useMessageQueue());

  return result;
}

/**
 * Enqueue messages in order, each in its own act() so state settles between
 * them (the hook captures a turn's overrides from whichever message finds the
 * queue empty).
 * @param queue - The live hook handle
 * @param entries - Message texts, optionally paired with per-call overrides
 */
async function enqueueMessages(
  queue: QueueHandle,
  ...entries: QueueEntry[]
): Promise<void> {
  for (const entry of entries) {
    const [text, overrides] =
      typeof entry === "string" ? [entry, undefined] : entry;

    await act(() => queue.current.enqueueMessage(text, overrides));
  }
}

/**
 * Drain the queue inside act() and hand back what it returned.
 * @param queue - The live hook handle
 * @returns The drained messages and captured turn overrides
 */
async function drainQueue(queue: QueueHandle): Promise<DrainedQueue> {
  let drained: DrainedQueue | undefined;

  await act(() => {
    drained = queue.current.drainQueue();
  });

  return drained!;
}

describe("useMessageQueue", () => {
  it("starts with an empty queue", () => {
    const queue = renderQueue();

    expect(queue.current.queuedMessages).toStrictEqual([]);
  });

  it("enqueues messages and exposes them in state", async () => {
    const queue = renderQueue();

    await enqueueMessages(queue, "hello", "world");

    expect(queue.current.queuedMessages).toHaveLength(2);
    expect(queue.current.queuedMessages[0]?.text).toBe("hello");
    expect(queue.current.queuedMessages[1]?.text).toBe("world");
  });

  it("captures the override once from the first queued message of a turn", async () => {
    const queue = renderQueue();

    // The first message defines the turn's override; later messages in the same
    // turn cannot change it, so the second message's override is
    // ignored even when it differs.
    await enqueueMessages(
      queue,
      ["a", { thinking: "high" }],
      ["b", { thinking: "off" }],
    );

    const drained = await drainQueue(queue);

    expect(drained.overrides).toStrictEqual({ thinking: "high" });
  });

  it("recaptures the override on the next turn after draining", async () => {
    const queue = renderQueue();

    await enqueueMessages(queue, ["a", { thinking: "high" }]);
    await drainQueue(queue);

    await enqueueMessages(queue, ["b", { thinking: "off" }]);

    const drained = await drainQueue(queue);

    expect(drained.overrides).toStrictEqual({ thinking: "off" });
  });

  it("drains all messages in FIFO order and clears queue", async () => {
    const queue = renderQueue();

    await enqueueMessages(queue, "first", "second");

    const drained = await drainQueue(queue);

    expect(drained.messages).toHaveLength(2);
    expect(drained.messages[0]?.text).toBe("first");
    expect(drained.messages[1]?.text).toBe("second");
    expect(queue.current.queuedMessages).toStrictEqual([]);
  });

  it("returns an empty result when draining empty queue", async () => {
    const queue = renderQueue();

    const drained = await drainQueue(queue);

    expect(drained.messages).toStrictEqual([]);
    expect(drained.overrides).toBeUndefined();
  });

  it("clears all queued messages", async () => {
    const queue = renderQueue();

    await enqueueMessages(queue, "a", "b");
    await act(() => queue.current.clearQueue());

    expect(queue.current.queuedMessages).toStrictEqual([]);
  });

  it("keeps queueRef in sync for synchronous reads", async () => {
    const queue = renderQueue();

    await enqueueMessages(queue, "sync-test");

    expect(queue.current.queueRef.current).toHaveLength(1);
    expect(queue.current.queueRef.current[0]?.text).toBe("sync-test");
  });

  it("assigns unique ids to each enqueued message", async () => {
    const queue = renderQueue();

    await enqueueMessages(queue, "a", "b", "c");

    const ids = queue.current.queuedMessages.map((m) => m.id);
    const uniqueIds = new Set(ids);

    expect(uniqueIds.size).toBe(3);
  });

  it("removeMessage removes the message with the given id", async () => {
    const queue = renderQueue();

    await enqueueMessages(queue, "a", "b", "c");

    const middleId = queue.current.queuedMessages[1]!.id;

    await act(() => queue.current.removeMessage(middleId));

    expect(queue.current.queuedMessages).toHaveLength(2);
    expect(queue.current.queuedMessages[0]?.text).toBe("a");
    expect(queue.current.queuedMessages[1]?.text).toBe("c");
  });

  it("removeMessage is a no-op for unknown id", async () => {
    const queue = renderQueue();

    await enqueueMessages(queue, "only");
    await act(() => queue.current.removeMessage(999));

    expect(queue.current.queuedMessages).toHaveLength(1);
    expect(queue.current.queuedMessages[0]?.text).toBe("only");
  });

  it("resets the captured override when removeMessage empties the queue", async () => {
    const queue = renderQueue();

    await enqueueMessages(queue, ["a", { thinking: "high" }]);

    const onlyId = queue.current.queuedMessages[0]!.id;

    await act(() => queue.current.removeMessage(onlyId));

    // Next message starts a fresh turn and recaptures its own override.
    await enqueueMessages(queue, ["b", { thinking: "off" }]);

    const drained = await drainQueue(queue);

    expect(drained.overrides).toStrictEqual({ thinking: "off" });
  });

  it("keeps queueRef in sync after removeMessage", async () => {
    const queue = renderQueue();

    await enqueueMessages(queue, "stay", "go");

    const removeId = queue.current.queuedMessages[1]!.id;

    await act(() => queue.current.removeMessage(removeId));

    expect(queue.current.queueRef.current).toHaveLength(1);
    expect(queue.current.queueRef.current[0]?.text).toBe("stay");
  });
});
