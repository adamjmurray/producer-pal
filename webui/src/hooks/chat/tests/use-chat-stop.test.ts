// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { renderHook, act } from "@testing-library/preact";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { CANCELED_TOOL_RESULT_TEXT } from "#webui/chat/sdk/build-model-messages";
import { validateMcpConnection } from "#webui/hooks/chat/helpers/streaming-helpers";
import { useChat } from "#webui/hooks/chat/use-chat";
import { type UIMessage, type UIToolPart } from "#webui/types/messages";
import {
  type TestMessage,
  createDefaultProps,
  createMockAdapter,
  createScriptedAdapter,
  tick,
  trackingAdapter,
} from "./helpers/use-chat-test-helpers";

// Mock streaming helpers
vi.mock(import("#webui/hooks/chat/helpers/streaming-helpers"), async () => {
  const { streamingHelpersMockBody } =
    await import("./helpers/use-chat-test-helpers");

  return await streamingHelpersMockBody();
});

const mockAdapter = createMockAdapter();
const defaultProps = createDefaultProps(mockAdapter);

/**
 * Render useChat with default props and enqueue a single message, asserting it
 * reached the queue so the follow-up action starts from a known state.
 * @param text - The message text to enqueue
 * @returns Hook result ref holding exactly one queued message
 */
async function renderWithQueuedMessage(text: string) {
  const { result } = renderHook(() => useChat(defaultProps));

  await act(() => result.current.enqueueMessage(text));

  expect(result.current.queuedMessages).toHaveLength(1);

  return result;
}

/**
 * An adapter that renders every assistant turn as a tool call still waiting on
 * its result — the shape a Stop lands on mid-tool. Its stream stays open until
 * the returned release is called.
 * @returns The adapter and the release for the stream it holds open
 */
function createRunningToolAdapter() {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });

  return {
    release: () => release(),
    adapter: {
      ...createScriptedAdapter(
        mockAdapter,
        (client) =>
          async function* (message: string) {
            client.chatHistory.push({ role: "user", content: message });
            yield [...client.chatHistory];

            client.chatHistory.push({ role: "assistant", content: "calling" });
            yield [...client.chatHistory];

            await held;
          },
      ),
      formatMessages: vi.fn((history: TestMessage[]): UIMessage[] =>
        history.map((msg, idx) => ({
          role: msg.role === "user" ? ("user" as const) : ("model" as const),
          parts:
            msg.role === "assistant"
              ? [
                  {
                    type: "tool" as const,
                    name: "ppal-read-live-set",
                    args: {},
                    result: null,
                  },
                ]
              : [{ type: "text" as const, content: msg.content }],
          rawHistoryIndex: idx,
          timestamp: 0,
        })),
      ),
    },
  };
}

/**
 * The result of the transcript's only tool call.
 * @param messages - The rendered transcript
 * @returns The tool result, or undefined when there is no tool call
 */
function toolResult(messages: UIMessage[]): string | null | undefined {
  return messages
    .flatMap((m) => m.parts)
    .find((p): p is UIToolPart => p.type === "tool")?.result;
}

describe("useChat stopResponse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("aborts ongoing request and sets isAssistantResponding to false", async () => {
    const { result } = renderHook(() => useChat(defaultProps));

    // Start a message send (don't await)
    void act(() => {
      void result.current.handleSend("Hello");
    });

    // Stop the response
    await act(() => {
      result.current.stopResponse();
    });

    expect(result.current.isAssistantResponding).toBe(false);
  });

  it("marks a tool call still in flight as stopped", async () => {
    // The stream reconciles its own history as it unwinds, but that repaint
    // lands after the abort and is dropped, so the card has to be marked here
    // or it reads as running for the rest of the session.
    const { adapter, release } = createRunningToolAdapter();
    const { result } = renderHook(() => useChat({ ...defaultProps, adapter }));
    const send = result.current.handleSend("Hello");

    // Let the stream paint the tool call and suspend with it still running.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(toolResult(result.current.messages)).toBeNull();

    await act(() => {
      result.current.stopResponse();
    });

    expect(toolResult(result.current.messages)).toBe(
      JSON.stringify(CANCELED_TOOL_RESULT_TEXT),
    );

    release();
    await act(async () => {
      await send;
    });
  });

  it("drops updates after the stop and reports no error for the aborted turn", async () => {
    // Stop lands between two yields, then the provider's stream rejects. The
    // late yield must not paint, and the rejection is the user's own cancel —
    // not something to render as a failure.
    let release!: () => void;
    const paused = new Promise<void>((resolve) => {
      release = resolve;
    });
    const adapter = createScriptedAdapter(
      mockAdapter,
      (client) =>
        async function* (message: string) {
          client.chatHistory.push({ role: "user", content: message });
          yield [...client.chatHistory];

          await paused;
          client.chatHistory.push({ role: "assistant", content: "too late" });
          yield [...client.chatHistory];

          throw new Error("stream torn down");
        },
    );
    const { result } = renderHook(() => useChat({ ...defaultProps, adapter }));
    const sendPromise = act(async () => {
      await result.current.handleSend("Hello");
    });

    // Let the first yield land before stopping.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await act(() => {
      result.current.stopResponse();
    });

    release();
    await sendPromise;

    expect(result.current.messages.some((m) => m.role === "model")).toBe(false);
    expect(
      result.current.messages.some((m) =>
        m.parts.some((p) => p.type === "error"),
      ),
    ).toBe(false);
  });

  it("leaves the next turn alone when a stopped turn unwinds late", async () => {
    // Stop re-enables the composer at once, but the stopped turn keeps
    // unwinding — its stream waits on any subagent still finishing an MCP
    // call, which takes no abort signal. A send inside that window owns the
    // per-turn state from then on; the late turn must not tear it down, or
    // its Stop silently no-ops.
    let releaseStopped!: () => void;
    const stoppedUnwind = new Promise<void>((resolve) => {
      releaseStopped = resolve;
    });
    const signals: AbortSignal[] = [];
    let turn = 0;
    const adapter = createScriptedAdapter(
      mockAdapter,
      (client) =>
        async function* (message: string, signal: AbortSignal) {
          signals.push(signal);
          client.chatHistory.push({ role: "user", content: message });
          yield [...client.chatHistory];

          // First turn: the post-Stop unwind. Second: still streaming.
          await (++turn === 1 ? stoppedUnwind : new Promise(() => {}));
        },
    );
    const { result } = renderHook(() => useChat({ ...defaultProps, adapter }));
    const stoppedSend = act(async () => {
      await result.current.handleSend("first");
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    await act(() => {
      result.current.stopResponse();
    });

    void act(() => {
      void result.current.handleSend("second");
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    // The stopped turn finishes only now, after the new one is under way.
    releaseStopped();
    await stoppedSend;
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(result.current.isAssistantResponding).toBe(true);

    await act(() => {
      result.current.stopResponse();
    });

    expect(signals[1]?.aborted).toBe(true);
    expect(result.current.isAssistantResponding).toBe(false);
  });

  it("swallows a superseded turn's SETUP failure instead of rendering it", async () => {
    // The other half of the same window: the failure comes from the turn's
    // setup rather than its stream — a connection check still in flight when
    // the user stopped and re-sent. Recovery renders the error, reassigns the
    // shared client's history, and autosaves, so a stale one corrupts the
    // turn now streaming.
    let releaseCheck!: () => void;
    const checkInFlight = new Promise<void>((resolve) => {
      releaseCheck = resolve;
    });

    vi.mocked(validateMcpConnection).mockImplementationOnce(async () => {
      await checkInFlight;
      throw new Error("MCP connection failed");
    });

    const { result } = renderHook(() => useChat(defaultProps));
    const stoppedSend = act(async () => {
      await result.current.handleSend("first");
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    await act(() => {
      result.current.stopResponse();
    });

    await act(async () => {
      await result.current.handleSend("second");
    });

    releaseCheck();
    await stoppedSend;
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(
      result.current.messages.some((m) =>
        m.parts.some((p) => p.type === "error"),
      ),
    ).toBe(false);
    expect(result.current.messages.some((m) => m.role === "model")).toBe(true);
  });

  it("keeps queued messages when stop is pressed so they flush on the next send", async () => {
    const result = await renderWithQueuedMessage("queued msg");

    await act(() => {
      result.current.stopResponse();
    });

    // Aborting a turn is the same as a failed turn: the queue stays intact and
    // flushes on the next successful send rather than being silently dropped.
    expect(result.current.queuedMessages).toHaveLength(1);
    expect(result.current.queuedMessages[0]?.text).toBe("queued msg");
  });

  it("doesn't send the queued follow-up when stop closes the stream cleanly", async () => {
    // Stop doesn't throw — the SDK emits an `abort` part and ends the stream —
    // so a stopped turn reaches the same clean exit a finished one does. Report
    // it as done and handleSend drains the queue, sending a brand-new request
    // one click after the user asked for it to stop.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const sent: string[] = [];
    const adapter = trackingAdapter({ clients: [], sent, gate });
    const { result } = renderHook(() => useChat({ ...defaultProps, adapter }));
    const send = result.current.handleSend("first");

    // Let the stream start and park on the gate, so the Stop lands mid-turn.
    await act(tick);
    await act(() => result.current.enqueueMessage("queued follow-up"));
    await act(() => {
      result.current.stopResponse();
    });

    release();
    await act(async () => {
      await send;
    });

    expect(sent).toStrictEqual(["first"]);
    expect(result.current.queuedMessages).toHaveLength(1);
    expect(result.current.isAssistantResponding).toBe(false);
  });

  it("clears queued messages when the conversation is cleared", async () => {
    const result = await renderWithQueuedMessage("queued msg");

    await act(() => {
      result.current.clearConversation();
    });

    // Switching/clearing a conversation must drop the queue so follow-ups
    // can't leak into the next conversation.
    expect(result.current.queuedMessages).toStrictEqual([]);
  });
});
