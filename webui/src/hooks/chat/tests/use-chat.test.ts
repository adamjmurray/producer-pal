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
import { type UseChatProps } from "#webui/hooks/chat/use-chat-types";
import {
  type MockChatClient,
  type TestConfig,
  type TestMessage,
  RESTORED_HISTORY,
  adapterWithClient,
  createDefaultProps,
  createMockAdapter,
  createScriptedAdapter,
} from "./helpers/use-chat-test-helpers";

// Mock streaming helpers
vi.mock(import("#webui/hooks/chat/helpers/streaming-helpers"), async () => {
  const { streamingHelpersMockBody } =
    await import("./helpers/use-chat-test-helpers");

  return await streamingHelpersMockBody();
});

const mockAdapter = createMockAdapter();

/**
 * Build an adapter whose client sets toolLimitReached after streaming once.
 * @returns Adapter that simulates hitting the tool-call limit
 */
function createToolLimitAdapter() {
  return createScriptedAdapter(mockAdapter, (client) => {
    client.toolLimitReached = true;

    return async function* send(message: string) {
      client.chatHistory.push({ role: "user", content: message });
      yield [...client.chatHistory];
    };
  });
}

/** The props useChat takes with this file's mock adapter/client/config. */
type ChatProps = UseChatProps<MockChatClient, TestMessage, TestConfig>;

/**
 * Render useChat with default props, send "Hello", and return the result.
 * @param props - Optional props override
 * @returns Hook result ref after sending a message
 */
async function renderAndSend(props: ChatProps = defaultProps) {
  const { result } = renderHook(() => useChat(props));

  await act(async () => {
    await result.current.handleSend("Hello");
  });

  return result;
}

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
 * Enqueue a message, then send while the given adapter's client fails, and
 * assert the queued message survives (queue not drained on error).
 * @param errorAdapter - Adapter whose client throws during init or streaming
 */
async function expectQueueSurvivesError(
  errorAdapter: ReturnType<typeof adapterWithClient>,
): Promise<void> {
  const { result } = renderHook(() =>
    useChat({ ...defaultProps, adapter: errorAdapter }),
  );

  await act(() => result.current.enqueueMessage("should not send"));

  await act(async () => {
    await result.current.handleSend("Hello");
  });

  expect(result.current.queuedMessages).toHaveLength(1);
  expect(result.current.queuedMessages[0]?.text).toBe("should not send");
}

/**
 * Render useChat with the given adapter, restore the standard history, then
 * compact the first turn. Returns the hook result for assertions.
 * @param adapter - The adapter whose client bootstraps from restored history
 * @returns The renderHook result
 */
async function renderRestoreCompact(
  adapter: ReturnType<typeof adapterWithClient>,
) {
  const { result } = renderHook(() => useChat({ ...defaultProps, adapter }));

  await act(() => {
    result.current.restoreChatHistory([...RESTORED_HISTORY]);
  });

  await act(async () => {
    await result.current.compact(1);
  });

  return result;
}

const defaultProps = createDefaultProps(mockAdapter);

describe("useChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("initialization", () => {
    it("initializes with empty messages and null state", () => {
      const { result } = renderHook(() => useChat(defaultProps));

      expect(result.current.messages).toStrictEqual([]);
      expect(result.current.isAssistantResponding).toBe(false);
      expect(result.current.activeModel).toBeNull();
      expect(result.current.activeThinking).toBeNull();
    });
  });

  describe("clearConversation", () => {
    it("resets all state to initial values", async () => {
      // Send a message first to populate state
      const result = await renderAndSend();

      expect(result.current.messages.length).toBeGreaterThan(0);
      expect(result.current.activeModel).toBe("test-model");

      // Clear conversation
      await act(() => {
        result.current.clearConversation();
      });

      expect(result.current.messages).toStrictEqual([]);
      expect(result.current.activeModel).toBeNull();
      expect(result.current.activeThinking).toBeNull();
    });

    it("disposes the client so its MCP connection is released", async () => {
      const created: MockChatClient[] = [];
      const adapter = adapterWithClient((client) => created.push(client));

      const { result } = renderHook(() =>
        useChat({ ...defaultProps, adapter }),
      );

      await act(async () => {
        await result.current.handleSend("Hello");
      });

      await act(() => {
        result.current.clearConversation();
      });

      expect(created).toHaveLength(1);
      expect(created[0]!.dispose).toHaveBeenCalledOnce();
    });

    it("disposes the live client when the hook unmounts (mode-switch teardown)", async () => {
      // Switching chat<->voice mode unmounts ChatApp (and useChat) mid-session.
      // The unmount cleanup must dispose the live client so its MCP connection
      // isn't leaked — clearConversation/initializeChat only cover replacement.
      const created: MockChatClient[] = [];
      const adapter = adapterWithClient((client) => created.push(client));

      const { result, unmount } = renderHook(() =>
        useChat({ ...defaultProps, adapter }),
      );

      await act(async () => {
        await result.current.handleSend("Hello");
      });

      unmount();

      expect(created).toHaveLength(1);
      expect(created[0]!.dispose).toHaveBeenCalledOnce();
    });

    it("aborts the in-flight stream (browser Back/Forward teardown path)", async () => {
      // A browser Back/Forward fires hashchange, which switches/clears the
      // conversation via clearConversation WITHOUT going through stopResponse.
      // Before the fix the in-flight stream kept running and its setMessages
      // clobbered the freshly-restored conversation. clearConversation must
      // abort the active stream's controller.
      let capturedSignal: AbortSignal | undefined;
      let resolveGate: () => void = () => {};
      const gate = new Promise<void>((resolve) => {
        resolveGate = resolve;
      });

      const adapter = createScriptedAdapter(
        mockAdapter,
        (client) =>
          async function* (message, signal) {
            capturedSignal = signal;
            client.chatHistory.push({ role: "user", content: message });
            yield [...client.chatHistory];
            await gate; // hold the stream in-flight
          },
      );

      const { result } = renderHook(() =>
        useChat({ ...defaultProps, adapter }),
      );

      const sendPromise = result.current.handleSend("Hello");

      // Let the stream yield its first chunk and suspend on the gate.
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      expect(capturedSignal?.aborted).toBe(false);

      await act(() => {
        result.current.clearConversation();
      });

      expect(capturedSignal?.aborted).toBe(true);

      resolveGate();
      await act(async () => {
        await sendPromise;
      });
    });
  });

  describe("stopResponse", () => {
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
      const { result } = renderHook(() =>
        useChat({ ...defaultProps, adapter }),
      );
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

      expect(result.current.messages.some((m) => m.role === "model")).toBe(
        false,
      );
      expect(
        result.current.messages.some((m) =>
          m.parts.some((p) => p.type === "error"),
        ),
      ).toBe(false);
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

  describe("handleSend", () => {
    it("ignores empty messages", async () => {
      const { result } = renderHook(() => useChat(defaultProps));

      await act(async () => {
        await result.current.handleSend("");
      });

      expect(result.current.messages).toStrictEqual([]);
      expect(mockAdapter.createClient).not.toHaveBeenCalled();
    });

    it("ignores whitespace-only messages", async () => {
      const { result } = renderHook(() => useChat(defaultProps));

      await act(async () => {
        await result.current.handleSend("   \n\t  ");
      });

      expect(result.current.messages).toStrictEqual([]);
      expect(mockAdapter.createClient).not.toHaveBeenCalled();
    });

    it("shows error when no API key configured", async () => {
      const { result } = renderHook(() =>
        useChat({ ...defaultProps, apiKey: "" }),
      );

      await act(async () => {
        await result.current.handleSend("Hello");
      });

      const lastMessage = result.current.messages.at(-1);

      expect(lastMessage?.role).toBe("model");
      const lastPart = lastMessage?.parts[0];

      expect(lastPart?.type).toBe("error");
      expect(lastPart).toHaveProperty("content");
      expect((lastPart as { content: string }).content).toContain(
        "No API key configured",
      );
    });

    it("initializes client on first message", async () => {
      const { result } = renderHook(() => useChat(defaultProps));

      await act(async () => {
        await result.current.handleSend("Hello");
      });

      expect(mockAdapter.createClient).toHaveBeenCalledWith("test-key", {
        model: "test-model",
        thinking: "Default",
      });
    });

    it("sets active model and thinking after initialization", async () => {
      const result = await renderAndSend();

      expect(result.current.activeModel).toBe("test-model");
      expect(result.current.activeThinking).toBe("Default");
    });

    it("reuses existing client on subsequent messages", async () => {
      const { result } = renderHook(() => useChat(defaultProps));

      await act(async () => {
        await result.current.handleSend("First message");
      });

      vi.clearAllMocks();

      await act(async () => {
        await result.current.handleSend("Second message");
      });

      expect(mockAdapter.createClient).not.toHaveBeenCalled();
    });

    it("updates messages during streaming", async () => {
      const result = await renderAndSend();

      expect(result.current.messages.length).toBeGreaterThan(0);
      expect(mockAdapter.formatMessages).toHaveBeenCalled();
    });

    it("calls autoSaveRef on first stream yield", async () => {
      const autoSaveRef = { current: vi.fn() };
      const { result } = renderHook(() =>
        useChat({ ...defaultProps, autoSaveRef }),
      );

      await act(async () => {
        await result.current.handleSend("Hello");
      });

      expect(autoSaveRef.current).toHaveBeenCalledTimes(1);
    });

    it("does not autosave on the user echo alone", async () => {
      // The echo yield carries no response yet, so saving there would persist a
      // turn with nothing in it. This is the whole job of hasAssistantContent now
      // that the retry path no longer consults it — the previous test can't tell
      // the two apart, because either way the count lands on 1.
      const autoSaveRef = { current: vi.fn() };
      const echoOnly = createScriptedAdapter(
        mockAdapter,
        (client) =>
          async function* (message: string) {
            client.chatHistory.push({ role: "user", content: message });
            yield [...client.chatHistory];
          },
      );
      const { result } = renderHook(() =>
        useChat({ ...defaultProps, adapter: echoOnly, autoSaveRef }),
      );

      await act(async () => {
        await result.current.handleSend("Hello");
      });

      expect(autoSaveRef.current).not.toHaveBeenCalled();
    });

    it("sets isAssistantResponding to false after completion", async () => {
      const { result } = renderHook(() => useChat(defaultProps));

      expect(result.current.isAssistantResponding).toBe(false);

      await act(async () => {
        await result.current.handleSend("Hello");
      });

      // Should be false after completion
      expect(result.current.isAssistantResponding).toBe(false);
    });

    it("handles errors and creates error message", async () => {
      const errorAdapter = adapterWithClient((client) => {
        client.initialize = vi.fn(async () => {
          throw new Error("Initialization failed");
        });
      });

      const result = await renderAndSend({
        ...defaultProps,
        adapter: errorAdapter,
      });

      expect(errorAdapter.createErrorMessage).toHaveBeenCalled();
      const lastMessage = result.current.messages.at(-1);
      const lastPart = lastMessage?.parts[0];

      expect(lastPart?.type).toBe("error");
    });

    it("persists the user message, not just the error, when init fails", async () => {
      // createClient runs (so the client exists) but initialize throws before
      // sendMessage, leaving chatHistory empty. The stashed user message must
      // still reach the persisted history alongside the error — otherwise a
      // reload shows a dangling error with no question.
      const errorAdapter = adapterWithClient((client) => {
        client.initialize = vi.fn(async () => {
          throw new Error("Initialization failed");
        });
      });
      const autoSaveRef = { current: vi.fn() };

      const { result } = renderHook(() =>
        useChat({ ...defaultProps, adapter: errorAdapter, autoSaveRef }),
      );

      await act(async () => {
        await result.current.handleSend("Hello");
      });

      expect(result.current.getChatHistory()).toStrictEqual([
        { role: "user", content: "Hello" },
        {
          role: "assistant",
          content: expect.stringContaining("Initialization failed"),
          isError: true,
        },
      ]);
      expect(autoSaveRef.current).toHaveBeenCalled();
    });

    it("trims whitespace from messages", async () => {
      const { result } = renderHook(() => useChat(defaultProps));

      await act(async () => {
        await result.current.handleSend("  Hello  ");
      });

      // Check that the message was sent without extra whitespace
      const userMessage = result.current.messages.find(
        (m) => m.role === "user",
      );
      const firstPart = userMessage?.parts[0];

      expect(firstPart).toHaveProperty("content");
      expect((firstPart as { content: string }).content).toBe("Hello");
    });

    it("defaults toolLimitReached to false", async () => {
      const result = await renderAndSend();

      expect(result.current.toolLimitReached).toBe(false);
    });

    it("reflects toolLimitReached from the client after a stream", async () => {
      const result = await renderAndSend({
        ...defaultProps,
        adapter: createToolLimitAdapter(),
      });

      expect(result.current.toolLimitReached).toBe(true);
    });

    it("clears toolLimitReached on clearConversation", async () => {
      const result = await renderAndSend({
        ...defaultProps,
        adapter: createToolLimitAdapter(),
      });

      expect(result.current.toolLimitReached).toBe(true);

      await act(() => {
        result.current.clearConversation();
      });

      expect(result.current.toolLimitReached).toBe(false);
    });

    it("covers getChatHistory callback when sendMessage throws non-rate-limit error", async () => {
      const errorAdapter = createScriptedAdapter(
        mockAdapter,
        () =>
          // eslint-disable-next-line require-yield -- Throws before yielding
          async function* () {
            throw new Error("Network failure");
          },
      );

      const result = await renderAndSend({
        ...defaultProps,
        adapter: errorAdapter,
      });

      // Error should be displayed via createErrorMessage with chatHistory
      expect(errorAdapter.createErrorMessage).toHaveBeenCalledWith(
        expect.any(Error),
        expect.any(Array),
      );
      expect(result.current.isAssistantResponding).toBe(false);
    });

    it("drains queued messages into a combined follow-up after response completes", async () => {
      const { result } = renderHook(() => useChat(defaultProps));

      // Enqueue messages before sending (simulates queuing during a response)
      await act(() => result.current.enqueueMessage("follow up A"));
      await act(() => result.current.enqueueMessage("follow up B"));

      // Send initial message — after it completes, drainQueue fires and sends combined
      await act(async () => {
        await result.current.handleSend("Hello");
      });

      // The mock client receives: "Hello", then "follow up A\n\nfollow up B"
      const userMessages = result.current.messages
        .filter((m) => m.role === "user")
        .map((m) => {
          const part = m.parts[0];

          return part && "content" in part ? (part.content as string) : "";
        });

      expect(userMessages).toContain("Hello");
      expect(userMessages).toContain("follow up A\n\nfollow up B");
      expect(result.current.queuedMessages).toStrictEqual([]);
    });

    it("does not drain queue after stream error", async () => {
      const errorAdapter = adapterWithClient((client) => {
        // eslint-disable-next-line require-yield -- Throws before yielding
        client.sendMessage = async function* () {
          throw new Error("Network failure");
        };
      });

      await expectQueueSurvivesError(errorAdapter);
    });

    it("does not drain queue after initialization error", async () => {
      const errorAdapter = adapterWithClient((client) => {
        client.initialize = vi.fn(async () => {
          throw new Error("Init failed");
        });
      });

      await expectQueueSurvivesError(errorAdapter);
    });
  });

  describe("compact (bootstrap + race guard)", () => {
    it("no-ops when the target message index has nothing at it", async () => {
      const adapter = adapterWithClient(() => {});
      const { result } = renderHook(() =>
        useChat({ ...defaultProps, adapter }),
      );

      await act(async () => {
        await result.current.compact(0);
      });

      expect(adapter.createClient).not.toHaveBeenCalled();
      expect(result.current.isCompacting).toBe(false);
    });

    it("builds no client when the bootstrap has no API key to use", async () => {
      // Restored history gives compact something to target, but a key removed
      // from Settings leaves nothing to connect with — bootstrap must bail
      // rather than construct a client that can't authenticate.
      const adapter = adapterWithClient(() => {});
      const { result } = renderHook(() =>
        useChat({ ...defaultProps, adapter, apiKey: "" }),
      );

      await act(() => {
        result.current.restoreChatHistory([...RESTORED_HISTORY]);
      });
      await act(async () => {
        await result.current.compact(1);
      });

      expect(adapter.createClient).not.toHaveBeenCalled();
      expect(result.current.isCompacting).toBe(false);
    });

    it("bootstraps a client from restored history, then compacts", async () => {
      let created: MockChatClient | undefined;
      const adapter = adapterWithClient((client) => {
        created = client;
        client.chatHistory = [...RESTORED_HISTORY];
      });

      const result = await renderRestoreCompact(adapter);

      expect(adapter.createClient).toHaveBeenCalledTimes(1);
      expect(created?.summarize).toHaveBeenCalledWith(RESTORED_HISTORY);
      // Non-destructive: restored turns are kept, summary marker appended.
      expect(created?.chatHistory).toStrictEqual([
        ...RESTORED_HISTORY,
        { role: "user", content: "Summary of 2 messages" },
      ]);
      expect(result.current.canUndoCompaction).toBe(true);
    });

    it("surfaces an error when bootstrap initialization fails", async () => {
      const adapter = adapterWithClient((client) => {
        client.initialize = vi.fn(async () => {
          throw new Error("init fail");
        });
      });

      const result = await renderRestoreCompact(adapter);

      expect(adapter.createErrorMessage).toHaveBeenCalled();
      expect(result.current.messages.at(-1)?.parts[0]?.type).toBe("error");
    });

    it("compacts the existing client without re-initializing", async () => {
      let created: MockChatClient | undefined;
      const adapter = adapterWithClient((client) => {
        created = client;
      });

      const { result } = renderHook(() =>
        useChat({ ...defaultProps, adapter }),
      );

      await act(async () => {
        await result.current.handleSend("Hello");
      });
      expect(adapter.createClient).toHaveBeenCalledTimes(1);

      await act(async () => {
        await result.current.compact(1);
      });

      // No second client created — compacted the existing one in place.
      expect(adapter.createClient).toHaveBeenCalledTimes(1);
      expect(created?.summarize).toHaveBeenCalled();
    });

    it("ignores a send while a compaction is in flight", async () => {
      let resolveSummary: (value: string) => void = () => {};
      const adapter = adapterWithClient((client) => {
        client.summarize = vi.fn(
          () =>
            new Promise<string>((resolve) => {
              resolveSummary = resolve;
            }),
        );
      });

      const { result } = renderHook(() =>
        useChat({ ...defaultProps, adapter }),
      );

      await act(async () => {
        await result.current.handleSend("Hello");
      });

      const callsBefore = vi.mocked(adapter.createUserMessage).mock.calls
        .length;

      let compactPromise: Promise<void> | undefined;

      await act(() => {
        compactPromise = result.current.compact(1);
      });

      // Compaction is in flight (summarize pending): a concurrent send must be
      // dropped before it reaches createUserMessage.
      await act(async () => {
        await result.current.handleSend("blocked");
      });

      expect(vi.mocked(adapter.createUserMessage).mock.calls).toHaveLength(
        callsBefore,
      );
      expect(adapter.createUserMessage).not.toHaveBeenCalledWith("blocked");

      await act(async () => {
        resolveSummary("done");
        await compactPromise;
      });
    });
  });
});
