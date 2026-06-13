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

  it("reports the pending queue to the SDK via shouldInterrupt", async () => {
    const sent: string[] = [];
    const interruptByMessage: Record<string, boolean | undefined> = {};
    const adapter = createRecordingAdapter(
      sent,
      ({ message, shouldInterrupt }) => {
        interruptByMessage[message] = shouldInterrupt?.();
      },
    );

    const { result } = renderHook(() => useChat({ ...defaultProps, adapter }));

    await act(() => result.current.enqueueMessage("Q"));
    await act(async () => {
      await result.current.handleSend("Hello");
    });

    // During "Hello" the queue still held "Q", so an interrupt was requested.
    expect(interruptByMessage.Hello).toBe(true);
    // The drained "Q" send saw an empty queue, so no interrupt was requested.
    expect(interruptByMessage.Q).toBe(false);
  });

  it("auto-sends a queued message after the SDK interrupts a tool loop", async () => {
    const sent: string[] = [];
    // Mirror the real client: abandon a multi-step tool loop the moment a
    // follow-up is queued, emitting no further assistant content.
    const adapter = createRecordingAdapter(sent, ({ shouldInterrupt }) =>
      shouldInterrupt?.() ? "interrupt" : undefined,
    );

    const { result } = renderHook(() => useChat({ ...defaultProps, adapter }));

    await act(() => result.current.enqueueMessage("follow up"));
    await act(async () => {
      await result.current.handleSend("Hello");
    });

    // "Hello" bailed out early (queue held "follow up"); the drain loop then
    // sent "follow up", which ran to completion against an empty queue.
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
});
