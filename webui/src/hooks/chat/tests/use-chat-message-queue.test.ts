// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { renderHook, act } from "@testing-library/preact";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { type PendingFork } from "#webui/hooks/chat/use-chat-types";
import { useChat } from "#webui/hooks/chat/use-chat";
import {
  type TestMessage,
  MockChatClient,
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

/**
 * Render with the adapter, send "Hello", queue a "B" follow-up, then retry the
 * user turn — the shared setup for the retry-fork queue-flush tests.
 * @param adapter - Recording adapter under test
 * @returns The renderHook result for assertions
 */
async function sendQueueThenRetry(
  adapter: ReturnType<typeof createRecordingAdapter>,
) {
  const { result } = renderHook(() => useChat({ ...defaultProps, adapter }));

  await act(async () => {
    await result.current.handleSend("Hello");
  });

  const userIndex = result.current.messages.findIndex((m) => m.role === "user");

  await act(() => result.current.enqueueMessage("B"));
  await act(async () => {
    await result.current.handleRetry(userIndex);
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

  it("flushes queued messages after a successful retry fork", async () => {
    const sent: string[] = [];
    const adapter = createRecordingAdapter(sent);

    // A follow-up is queued, then the user retries the prior message. The fork
    // must neither drop the queued words nor strand them: once it streams a
    // response, the follow-up flushes through the normal send path.
    const result = await sendQueueThenRetry(adapter);

    expect(result.current.queuedMessages).toStrictEqual([]);
    expect(sent).toContain("B");
    expect(sent.at(-1)).toBe("B"); // flushed after the fork response
  });

  it("force-saves a content-less fork as its own sibling so the queued follow-up doesn't inherit the fork signal", async () => {
    // The narrow case: a fork that completes SUCCESSFULLY but streams
    // zero assistant content (no text/thought/tool) and records no usage never
    // fires the streaming autosave, so the fork signal would otherwise linger and
    // get consumed by the queued follow-up's save — mis-branching the follow-up
    // under the fork anchor instead of persisting the empty fork turn as its own
    // sibling.
    const sent: string[] = [];
    let clientCount = 0;
    const adapter = {
      ...mockAdapter,
      createClient: vi.fn(() => {
        const client = new MockChatClient();

        clientCount += 1;
        // The fork re-inits a fresh client (the 2nd one). Its first turn streams
        // no assistant content; its later drained follow-up streams normally.
        const isForkClient = clientCount === 2;
        let sendCount = 0;

        client.sendMessage = async function* send(
          message: string,
        ): AsyncIterable<TestMessage[]> {
          sent.push(message);
          sendCount += 1;
          client.chatHistory.push({ role: "user", content: message });
          yield [...client.chatHistory];

          if (isForkClient && sendCount === 1) return; // content-less fork turn

          client.chatHistory.push({
            role: "assistant",
            content: `Response to: ${message}`,
          });
          yield [...client.chatHistory];
        };

        return client;
      }),
    };

    // Mirror saveCurrentConversation's consume: record the fork signal each save
    // observes (in order), then clear it — exactly what the real save does.
    const pendingForkRef = { current: null as PendingFork | null };
    const savedForkSignals: (PendingFork | null)[] = [];
    const autoSaveRef = {
      current: () => {
        savedForkSignals.push(pendingForkRef.current);
        pendingForkRef.current = null;
      },
    };

    const { result } = renderHook(() =>
      useChat({ ...defaultProps, adapter, pendingForkRef, autoSaveRef }),
    );

    await act(async () => {
      await result.current.handleSend("Hello");
    });

    const userIndex = result.current.messages.findIndex(
      (m) => m.role === "user",
    );

    // Ignore the opening turn's save; only the fork+drain saves matter here.
    savedForkSignals.length = 0;

    await act(() => result.current.enqueueMessage("B"));
    await act(async () => {
      await result.current.handleRetry(userIndex);
    });

    // Exactly two saves ran: the forced save of the content-less fork (carrying
    // the fork anchor — a retry anchors under the response, userIndex + 1) and
    // the drained "B" turn (no inherited fork signal). The follow-up appended to
    // the fork instead of mis-branching under it.
    expect(savedForkSignals).toStrictEqual([
      { anchorIndex: userIndex + 1 },
      null,
    ]);
    expect(pendingForkRef.current).toBeNull();
    expect(sent.at(-1)).toBe("B");
  });

  it("preserves queued messages when the retry fork fails", async () => {
    const sent: string[] = [];
    let calls = 0;
    // First send ("Hello") succeeds; the retry fork's send throws.
    const adapter = createRecordingAdapter(sent, () => {
      calls += 1;

      if (calls > 1) throw new Error("fork stream failed");
    });

    const result = await sendQueueThenRetry(adapter);

    // The fork errored mid-stream, so the follow-up must stay queued to flush on
    // a later send rather than being drained into the failed fork.
    expect(result.current.queuedMessages.map((m) => m.text)).toStrictEqual([
      "B",
    ]);
  });
});
