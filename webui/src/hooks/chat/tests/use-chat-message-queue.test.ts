// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { renderHook, act } from "@testing-library/preact";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useChat } from "#webui/hooks/chat/use-chat";
import {
  type TestMessage,
  createDefaultProps,
  createMockAdapter,
  createScriptedAdapter,
} from "./use-chat-test-helpers";

// Mock streaming helpers (mirrors use-chat.test.ts so handleSend can stream).
vi.mock(import("#webui/hooks/chat/helpers/streaming-helpers"), async () => {
  const { streamingHelpersMockBody } = await import("./use-chat-test-helpers");

  return await streamingHelpersMockBody();
});

const mockAdapter = createMockAdapter();
const defaultProps = createDefaultProps(mockAdapter);

/** Context passed to a recording adapter's mid-send hook. */
interface MidSend {
  message: string;
  overrides?: unknown;
  shouldInterrupt?: () => boolean;
}

/**
 * Build an adapter whose client records every sent message and runs a hook
 * between the user-echo and assistant-reply yields (so tests can mutate the
 * queue, inspect overrides, or steer control flow mid-send). The hook may
 * return "interrupt" to abandon the turn early (mirroring an SDK interrupt),
 * or throw to simulate a failed send.
 * @param sent - Array that each sent message is pushed onto
 * @param onMidSend - Called after the user-echo yield with the send context
 * @returns Scripted adapter
 */
function createRecordingAdapter(
  sent: string[],
  onMidSend?: (ctx: MidSend) => "interrupt" | void,
) {
  return createScriptedAdapter(
    mockAdapter,
    (client) =>
      async function* send(
        message: string,
        _signal: AbortSignal,
        overrides?: unknown,
        shouldInterrupt?: () => boolean,
      ): AsyncIterable<TestMessage[]> {
        sent.push(message);
        client.chatHistory.push({ role: "user", content: message });
        yield [...client.chatHistory];

        if (
          onMidSend?.({ message, overrides, shouldInterrupt }) === "interrupt"
        )
          return;

        client.chatHistory.push({
          role: "assistant",
          content: `Response to: ${message}`,
        });
        yield [...client.chatHistory];
      },
  );
}

/**
 * Render useChat with the given recording adapter, hand its enqueueMessage to
 * `captureEnqueue` (so an adapter closure can queue a follow-up mid-stream),
 * then send an opening "Hello" turn.
 * @param adapter - Recording adapter under test
 * @param captureEnqueue - Receives enqueueMessage before the send starts
 * @returns The renderHook result for further assertions
 */
async function renderAndSendHello(
  adapter: ReturnType<typeof createRecordingAdapter>,
  captureEnqueue: (enqueue: (text: string) => void) => void,
) {
  const { result } = renderHook(() => useChat({ ...defaultProps, adapter }));

  captureEnqueue(result.current.enqueueMessage);

  await act(async () => {
    await result.current.handleSend("Hello");
  });

  return result;
}

describe("useChat message queuing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps draining when a message is queued during a drained send", async () => {
    const sent: string[] = [];
    let enqueue: ((text: string) => void) | null = null;
    const adapter = createRecordingAdapter(sent, ({ message }) => {
      // While the first drained follow-up ("A") streams, queue one more to
      // force a SECOND drain iteration — proving the loop keeps going.
      if (message === "A" && enqueue) {
        enqueue("B");
        enqueue = null;
      }
    });

    const { result } = renderHook(() => useChat({ ...defaultProps, adapter }));

    enqueue = result.current.enqueueMessage;

    await act(() => result.current.enqueueMessage("A"));
    await act(async () => {
      await result.current.handleSend("Hello");
    });

    expect(sent).toStrictEqual(["Hello", "A", "B"]);
    expect(result.current.queuedMessages).toStrictEqual([]);
  });

  it("requests interrupt only when a message is queued during the streaming send", async () => {
    const sent: string[] = [];
    const interruptByMessage: Record<string, boolean | undefined> = {};
    let enqueue: ((text: string) => void) | null = null;
    const adapter = createRecordingAdapter(
      sent,
      ({ message, shouldInterrupt }) => {
        // Queue a follow-up WHILE "Hello" streams (the real flow), then read
        // the flag the SDK sees.
        if (message === "Hello" && enqueue) {
          enqueue("Q");
          enqueue = null;
        }

        interruptByMessage[message] = shouldInterrupt?.();
      },
    );

    await renderAndSendHello(adapter, (fn) => {
      enqueue = fn;
    });

    // "Q" was enqueued mid-stream, so "Hello" reported an interrupt request.
    expect(interruptByMessage.Hello).toBe(true);
    // The drained "Q" send saw an empty queue, so no interrupt was requested.
    expect(interruptByMessage.Q).toBe(false);
  });

  it("auto-sends a queued message after the SDK interrupts a tool loop", async () => {
    const sent: string[] = [];
    let enqueue: ((text: string) => void) | null = null;
    // Mirror the real client: once a follow-up is queued mid-stream, abandon
    // the multi-step tool loop immediately, emitting no further content.
    const adapter = createRecordingAdapter(
      sent,
      ({ message, shouldInterrupt }) => {
        if (message === "Hello" && enqueue) {
          enqueue("follow up");
          enqueue = null;
        }

        return shouldInterrupt?.() ? "interrupt" : undefined;
      },
    );

    const result = await renderAndSendHello(adapter, (fn) => {
      enqueue = fn;
    });

    // "Hello" bailed out early (a follow-up was queued mid-stream); the drain
    // loop then sent "follow up", which ran to completion against an empty
    // queue.
    expect(sent).toStrictEqual(["Hello", "follow up"]);
    expect(result.current.queuedMessages).toStrictEqual([]);
  });

  it("carries the first queued message's overrides into the drained send", async () => {
    const sent: string[] = [];
    const overridesByMessage: Record<string, unknown> = {};
    const adapter = createRecordingAdapter(sent, ({ message, overrides }) => {
      overridesByMessage[message] = overrides;
    });

    const { result } = renderHook(() => useChat({ ...defaultProps, adapter }));

    await act(() => result.current.enqueueMessage("Q", { thinking: "high" }));
    await act(async () => {
      await result.current.handleSend("Hello");
    });

    expect(sent).toStrictEqual(["Hello", "Q"]);
    expect(overridesByMessage.Q).toStrictEqual({ thinking: "high" });
  });

  it("stops the drain loop and surfaces an error when a drained send fails", async () => {
    const sent: string[] = [];
    const adapter = createRecordingAdapter(sent, ({ message }) => {
      if (message === "Q") throw new Error("drained send failed");
    });

    const { result } = renderHook(() => useChat({ ...defaultProps, adapter }));

    await act(() => result.current.enqueueMessage("Q"));
    await act(async () => {
      await result.current.handleSend("Hello");
    });

    // The failed drained send terminates the loop (no infinite retry): the
    // error is surfaced, the queue is already drained, and we're idle again.
    expect(sent).toStrictEqual(["Hello", "Q"]);
    expect(result.current.messages.at(-1)?.parts[0]?.type).toBe("error");
    expect(result.current.queuedMessages).toStrictEqual([]);
    expect(result.current.isAssistantResponding).toBe(false);
  });

  it("preserves a queued message on an initial-send error, then flushes it without truncating the next send", async () => {
    const sent: string[] = [];
    const interruptByMessage: Record<string, boolean | undefined> = {};
    let failHello = true;
    const adapter = createRecordingAdapter(
      sent,
      ({ message, shouldInterrupt }) => {
        interruptByMessage[message] = shouldInterrupt?.();

        if (message === "Hello" && failHello) {
          failHello = false;
          throw new Error("initial send failed");
        }
      },
    );

    const { result } = renderHook(() => useChat({ ...defaultProps, adapter }));

    // A follow-up is queued (e.g. typed while the turn streamed) and the first
    // send then fails before the queue can drain.
    await act(() => result.current.enqueueMessage("B"));
    await act(async () => {
      await result.current.handleSend("Hello");
    });

    // The error surfaces and we're idle, but "B" is NOT discarded — it stays
    // queued, ready to flush on the next successful send.
    expect(result.current.messages.at(-1)?.parts[0]?.type).toBe("error");
    expect(result.current.isAssistantResponding).toBe(false);
    expect(result.current.queuedMessages.map((m) => m.text)).toStrictEqual([
      "B",
    ]);

    // A brand-new send must run to completion despite "B" sitting in the queue.
    await act(async () => {
      await result.current.handleSend("C");
    });

    // "C" was not self-interrupted by the carried-over "B" ...
    expect(interruptByMessage.C).toBe(false);
    // ... and "B" flushed only after "C" completed.
    expect(sent).toStrictEqual(["Hello", "C", "B"]);
    expect(result.current.queuedMessages).toStrictEqual([]);
  });

  it("keeps queued messages across a retry fork instead of discarding them", async () => {
    const sent: string[] = [];
    const adapter = createRecordingAdapter(sent);

    const { result } = renderHook(() => useChat({ ...defaultProps, adapter }));

    await act(async () => {
      await result.current.handleSend("Hello");
    });

    const userIndex = result.current.messages.findIndex(
      (m) => m.role === "user",
    );

    // A follow-up is queued (e.g. it was stranded by an earlier failed turn),
    // then the user retries the prior message. A retry/edit fork must not be an
    // excuse to silently drop the user's words.
    await act(() => result.current.enqueueMessage("B"));
    await act(async () => {
      await result.current.handleRetry(userIndex);
    });

    expect(result.current.queuedMessages.map((m) => m.text)).toStrictEqual([
      "B",
    ]);
  });
});
