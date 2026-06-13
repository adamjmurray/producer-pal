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
  MockChatClient,
  createDefaultProps,
  createMockAdapter,
  createScriptedAdapter,
  RESTORED_HISTORY,
} from "./use-chat-test-helpers";

// Mock streaming helpers
vi.mock(import("#webui/hooks/chat/helpers/streaming-helpers"), async () => {
  const { streamingHelpersMockBody } = await import("./use-chat-test-helpers");

  return await streamingHelpersMockBody();
});

// Shrink retry backoff so tests don't sit through real seconds-long delays.
// 200 ms is small enough to keep the suite fast but large enough that the
// "cancels retry when stopResponse is called during retry delay" test can
// reliably abort while the timer is still pending (it waits ~50 ms first).
vi.mock(import("#webui/lib/rate-limit"), async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...actual,
    calculateRetryDelay: () => 200,
  };
});

const mockAdapter = createMockAdapter();

/**
 * Creates an adapter that throws rate limit error on first call then succeeds.
 * @param onMessage - Optional callback for each message received
 * @returns Adapter with rate limit behavior and call tracking
 */
function createRateLimitAdapter(onMessage?: (msg: string) => void) {
  let callCount = 0;

  return {
    adapter: {
      ...mockAdapter,
      createClient: vi.fn(() => {
        const client = new MockChatClient();
        const originalSendMessage = client.sendMessage.bind(client);

        client.sendMessage = async function* (
          message: string,
          signal: AbortSignal,
        ) {
          onMessage?.(message);
          callCount++;

          if (callCount === 1) {
            throw new Error("Resource has been exhausted");
          }

          yield* originalSendMessage(message, signal);
        };

        return client;
      }),
    },
    getCallCount: () => callCount,
  };
}

/**
 * Creates an adapter where sendMessage fails on second client creation (for retry tests).
 * @param baseAdapter - Base adapter to extend
 * @returns Adapter that throws on sendMessage after first client
 */
function createSendMessageFailingAdapter(
  baseAdapter: typeof mockAdapter,
): typeof mockAdapter {
  let callCount = 0;

  return {
    ...baseAdapter,
    createClient: vi.fn(() => {
      callCount++;
      const client = new MockChatClient();

      if (callCount > 1) {
        // eslint-disable-next-line require-yield -- Throws before yielding to test error handling
        client.sendMessage = async function* () {
          throw new Error("Network failure on retry");
        };
      }

      return client;
    }),
  };
}

const defaultProps = createDefaultProps(mockAdapter);

/**
 * Render useChat with a given adapter override and call handleSend once.
 * @param adapter - Adapter override for the props
 * @param message - The message to send (default "Hello")
 * @returns The renderHook result
 */
async function sendWithAdapter(
  adapter: typeof mockAdapter,
  message = "Hello",
): Promise<ReturnType<typeof renderHook<ReturnType<typeof useChat>, unknown>>> {
  const rendered = renderHook(() => useChat({ ...defaultProps, adapter }));

  await act(async () => {
    await rendered.result.current.handleSend(message);
  });

  return rendered;
}

describe("useChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("handleRetry", () => {
    it("does nothing if no API key", async () => {
      const { result } = renderHook(() =>
        useChat({ ...defaultProps, apiKey: "" }),
      );

      // Manually set some messages
      await act(async () => {
        await result.current.handleSend("Hello");
      });

      const initialLength = result.current.messages.length;

      await act(async () => {
        await result.current.handleRetry(0);
      });

      expect(result.current.messages).toHaveLength(initialLength);
    });

    it("does nothing if message at index is not user role", async () => {
      const { result } = renderHook(() => useChat(defaultProps));

      // Send a message to get user + assistant messages
      await act(async () => {
        await result.current.handleSend("Hello");
      });

      const modelMessageIndex = result.current.messages.findIndex(
        (m) => m.role === "model",
      );

      if (modelMessageIndex === -1) {
        throw new Error("No model message found");
      }

      vi.clearAllMocks();

      // Try to retry from model message index
      await act(async () => {
        await result.current.handleRetry(modelMessageIndex);
      });

      // Should not create new client or send message
      expect(mockAdapter.createClient).not.toHaveBeenCalled();
    });

    it("does nothing if no client and no pending history", async () => {
      const { result } = renderHook(() => useChat(defaultProps));

      await act(async () => {
        await result.current.handleRetry(0);
      });

      expect(mockAdapter.extractUserMessage).not.toHaveBeenCalled();
    });

    it("recovers from MCP init failure by stashing the user message", async () => {
      const { validateMcpConnection } =
        await import("#webui/hooks/chat/helpers/streaming-helpers");

      (
        validateMcpConnection as ReturnType<typeof vi.fn>
      ).mockImplementationOnce(() => {
        throw new Error("MCP connection failed");
      });

      const { result } = renderHook(() => useChat(defaultProps));

      await act(async () => {
        await result.current.handleSend("Hello");
      });

      // The user message should appear in the displayed messages even though
      // the client never reached sendMessage.
      const userIdx = result.current.messages.findIndex(
        (m) => m.role === "user",
      );

      expect(userIdx).toBeGreaterThanOrEqual(0);
      expect(
        result.current.messages.some((m) =>
          m.parts.some((p) => p.type === "error"),
        ),
      ).toBe(true);

      // Retry should now have a usable history to fork from.
      vi.clearAllMocks();

      await act(async () => {
        await result.current.handleRetry(userIdx);
      });

      expect(mockAdapter.extractUserMessage).toHaveBeenCalled();
      expect(mockAdapter.createClient).toHaveBeenCalled();
    });

    it("recovers from missing-API-key error after key is added", async () => {
      const props = { ...defaultProps, apiKey: "" };
      const { result, rerender } = renderHook((p: typeof props) => useChat(p), {
        initialProps: props,
      });

      // First send fails because no API key
      await act(async () => {
        await result.current.handleSend("Hello");
      });

      const userIdx = result.current.messages.findIndex(
        (m) => m.role === "user",
      );

      expect(userIdx).toBe(0);
      expect(
        result.current.messages.some((m) =>
          m.parts.some((p) => p.type === "error"),
        ),
      ).toBe(true);

      // User adds an API key in settings; retry should now succeed
      rerender({ ...props, apiKey: "test-key" });

      await act(async () => {
        await result.current.handleRetry(userIdx);
      });

      expect(mockAdapter.createClient).toHaveBeenCalled();
      expect(mockAdapter.extractUserMessage).toHaveBeenCalled();
    });

    it("retries from restored conversation using pending history", async () => {
      const { result } = renderHook(() => useChat(defaultProps));

      await act(async () => {
        result.current.restoreChatHistory(RESTORED_HISTORY);
      });

      vi.clearAllMocks();

      await act(async () => {
        await result.current.handleRetry(0);
      });

      // Should initialize a client and extract the user message for retry
      expect(mockAdapter.extractUserMessage).toHaveBeenCalled();
      expect(mockAdapter.createClient).toHaveBeenCalled();
      expect(result.current.messages.some((m) => m.role === "model")).toBe(
        true,
      );
    });

    it("successfully retries from a user message", async () => {
      const { result } = renderHook(() => useChat(defaultProps));

      // Send first message
      await act(async () => {
        await result.current.handleSend("First message");
      });

      const userMessageIndex = result.current.messages.findIndex(
        (m) => m.role === "user",
      );

      vi.clearAllMocks();

      // Retry from that user message
      await act(async () => {
        await result.current.handleRetry(userMessageIndex);
      });

      expect(mockAdapter.extractUserMessage).toHaveBeenCalled();
      expect(mockAdapter.formatMessages).toHaveBeenCalled();
    });

    it("slices history to exclude retry point and everything after", async () => {
      const { result } = renderHook(() => useChat(defaultProps));

      // Send two messages
      await act(async () => {
        await result.current.handleSend("First");
      });

      await act(async () => {
        await result.current.handleSend("Second");
      });

      const firstUserIndex = result.current.messages.findIndex(
        (m) => m.role === "user",
      );

      // Retry from first user message (should exclude second message pair)
      await act(async () => {
        await result.current.handleRetry(firstUserIndex);
      });

      // buildConfig should be called with sliced history
      expect(mockAdapter.buildConfig).toHaveBeenCalled();
    });

    it("handles errors during retry", async () => {
      let callCount = 0;
      // Create an adapter that will fail on the second client creation (during retry)
      const errorAdapter = {
        ...mockAdapter,
        createClient: vi.fn(() => {
          callCount++;
          const client = new MockChatClient();

          if (callCount > 1) {
            // Second call (during retry) should fail
            client.initialize = vi.fn(async () => {
              throw new Error("Retry initialization failed");
            });
          }

          return client;
        }),
      };

      const { result } = renderHook(() =>
        useChat({ ...defaultProps, adapter: errorAdapter }),
      );

      // Initialize with a message (this will succeed with the first client)
      await act(async () => {
        await result.current.handleSend("Hello");
      });

      const userMessageIndex = result.current.messages.findIndex(
        (m) => m.role === "user",
      );

      // Try to retry (this will fail because createClient will create a failing client)
      await act(async () => {
        await result.current.handleRetry(userMessageIndex);
      });

      expect(errorAdapter.createErrorMessage).toHaveBeenCalled();
    });

    it("covers getChatHistory callback when retry sendMessage throws non-rate-limit error", async () => {
      const retryErrorAdapter = createSendMessageFailingAdapter(mockAdapter);

      const { result } = renderHook(() =>
        useChat({ ...defaultProps, adapter: retryErrorAdapter }),
      );

      await act(async () => {
        await result.current.handleSend("Hello");
      });

      const userIdx = result.current.messages.findIndex(
        (m) => m.role === "user",
      );

      vi.clearAllMocks();

      await act(async () => {
        await result.current.handleRetry(userIdx);
      });

      // Error path should call createErrorMessage with getChatHistory()
      expect(retryErrorAdapter.createErrorMessage).toHaveBeenCalledWith(
        expect.any(Error),
        expect.any(Array),
      );
    });

    it("sets isAssistantResponding to false after retry", async () => {
      const { result } = renderHook(() => useChat(defaultProps));

      // Send a message
      await act(async () => {
        await result.current.handleSend("Hello");
      });

      const userMessageIndex = result.current.messages.findIndex(
        (m) => m.role === "user",
      );

      expect(result.current.isAssistantResponding).toBe(false);

      // Retry and wait for completion
      await act(async () => {
        await result.current.handleRetry(userMessageIndex);
      });

      // Should be false after completion
      expect(result.current.isAssistantResponding).toBe(false);
    });
  });

  describe("restoreChatHistory", () => {
    it("sets messages from loaded history", async () => {
      const { result } = renderHook(() => useChat(defaultProps));
      const history = [
        { role: "user" as const, content: "hello" },
        { role: "assistant" as const, content: "hi" },
      ];

      await act(async () => {
        result.current.restoreChatHistory(history);
      });

      expect(result.current.messages).toHaveLength(2);
      expect(mockAdapter.formatMessages).toHaveBeenCalledWith(history);
    });

    it("restores active model and provider from lockedSettings", async () => {
      const { result } = renderHook(() => useChat(defaultProps));

      await act(async () => {
        result.current.restoreChatHistory(
          [
            { role: "user", content: "hello" },
            { role: "assistant", content: "hi" },
          ],
          {
            model: "gemini-2.5-pro",
            provider: "gemini",
            thinking: null,
            temperature: null,
            showThoughts: null,
            smallModelMode: null,
          },
        );
      });

      expect(result.current.activeModel).toBe("gemini-2.5-pro");
      expect(result.current.activeProvider).toBe("gemini");
    });

    it("continues a restored conversation on its locked provider+model, using the current key for that provider", async () => {
      // Current settings select gemini/test-model, but the restored conversation
      // is locked to anthropic/claude-x. Continuing it must rebuild the client
      // for the locked provider — with the current anthropic key — and must NOT
      // overwrite the lock with the currently-selected provider/model.
      const resolveConnection = vi.fn((provider: string) => ({
        apiKey: provider === "anthropic" ? "anthropic-key" : "test-key",
        baseUrl: undefined as string | undefined,
      }));
      const { result } = renderHook(() =>
        useChat({ ...defaultProps, resolveConnection }),
      );

      await act(async () => {
        result.current.restoreChatHistory([{ role: "user", content: "hi" }], {
          model: "claude-x",
          provider: "anthropic",
          thinking: null,
          temperature: null,
          showThoughts: null,
          smallModelMode: null,
        });
      });

      await act(async () => {
        await result.current.handleSend("continue");
      });

      expect(resolveConnection).toHaveBeenCalledWith("anthropic");
      expect(mockAdapter.buildConfig).toHaveBeenCalledWith(
        "claude-x",
        1.0,
        "Default",
        {},
        expect.anything(),
        expect.objectContaining({
          provider: "anthropic",
          apiKey: "anthropic-key",
        }),
      );
      expect(mockAdapter.createClient).toHaveBeenCalledWith(
        "anthropic-key",
        expect.anything(),
      );
      // The lock survives the send instead of switching to current settings.
      expect(result.current.activeModel).toBe("claude-x");
      expect(result.current.activeProvider).toBe("anthropic");
    });

    it("resets active state", async () => {
      const { result } = renderHook(() => useChat(defaultProps));

      await act(async () => {
        await result.current.handleSend("Hello");
      });

      expect(result.current.activeModel).toBe("test-model");

      await act(async () => {
        result.current.restoreChatHistory([]);
      });

      expect(result.current.activeModel).toBeNull();
      expect(result.current.activeProvider).toBeNull();
    });

    it("uses pending history on next handleSend", async () => {
      const { result } = renderHook(() => useChat(defaultProps));
      const history = [
        { role: "user" as const, content: "prior msg" },
        { role: "assistant" as const, content: "prior response" },
      ];

      await act(async () => {
        result.current.restoreChatHistory(history);
      });

      await act(async () => {
        await result.current.handleSend("New message");
      });

      // buildConfig should have been called with the pending history, and with
      // the resolved connection for the (unlocked → current) provider.
      expect(mockAdapter.buildConfig).toHaveBeenCalledWith(
        "test-model",
        1.0,
        "Default",
        {},
        history,
        { provider: "gemini", apiKey: "test-key", baseUrl: undefined },
      );
    });

    it("clears pending history after clearConversation", async () => {
      const { result } = renderHook(() => useChat(defaultProps));

      await act(async () => {
        result.current.restoreChatHistory([
          { role: "user" as const, content: "test" },
        ]);
      });

      await act(async () => {
        result.current.clearConversation();
      });

      expect(result.current.getChatHistory()).toStrictEqual([]);
      expect(result.current.messages).toStrictEqual([]);
    });
  });

  describe("rate limit handling", () => {
    it("sets rateLimitState when rate limit error occurs", async () => {
      const { adapter } = createRateLimitAdapter();

      const { result } = renderHook(() =>
        useChat({ ...defaultProps, adapter }),
      );

      // Start send - it will hit rate limit, retry, and succeed
      await act(async () => {
        await result.current.handleSend("Hello");
      });

      // After completion, rateLimitState should be null
      expect(result.current.rateLimitState).toBeNull();
      // Messages should be populated (retry succeeded)
      expect(result.current.messages.length).toBeGreaterThan(0);
    });

    it("clears rateLimitState when stopResponse is called", async () => {
      const { result } = renderHook(() => useChat(defaultProps));

      await act(async () => {
        result.current.stopResponse();
      });

      expect(result.current.rateLimitState).toBeNull();
    });

    it("clears rateLimitState when clearConversation is called", async () => {
      const { result } = renderHook(() => useChat(defaultProps));

      await act(async () => {
        result.current.clearConversation();
      });

      expect(result.current.rateLimitState).toBeNull();
    });

    it("returns rateLimitState in hook return value", () => {
      const { result } = renderHook(() => useChat(defaultProps));

      // rateLimitState should be part of the return value and initially null
      expect(result.current).toHaveProperty("rateLimitState");
      expect(result.current.rateLimitState).toBeNull();
    });

    it("sends original message on retry when no content was received", async () => {
      const receivedMessages: string[] = [];
      const { adapter } = createRateLimitAdapter((msg) =>
        receivedMessages.push(msg),
      );

      const { result } = renderHook(() =>
        useChat({ ...defaultProps, adapter }),
      );

      await act(async () => {
        await result.current.handleSend("Hello");
      });

      // Both calls should have received the original message
      expect(receivedMessages).toStrictEqual(["Hello", "Hello"]);
    });

    it("sends original message on retry when only user echo was yielded", async () => {
      // Real ChatSdkClient yields the user message before provider streaming.
      // A 429 between that yield and any assistant content must not cause
      // the retry to switch to "continue" — the model never produced output.
      const receivedMessages: string[] = [];
      let callCount = 0;

      const rateLimitAdapter = createScriptedAdapter(
        mockAdapter,
        (client) =>
          async function* (message, _signal) {
            receivedMessages.push(message);
            callCount++;

            client.chatHistory.push({ role: "user", content: message });
            yield [...client.chatHistory];

            if (callCount === 1) {
              throw new Error("Resource has been exhausted");
            }

            client.chatHistory.push({
              role: "assistant",
              content: `Done: ${message}`,
            });
            yield [...client.chatHistory];
          },
      );

      await sendWithAdapter(rateLimitAdapter);

      expect(receivedMessages).toStrictEqual(["Hello", "Hello"]);
    });

    it("sends 'continue' on retry when content was already received", async () => {
      const receivedMessages: string[] = [];
      let callCount = 0;

      const rateLimitAdapter = createScriptedAdapter(
        mockAdapter,
        (client) =>
          async function* (message, _signal) {
            receivedMessages.push(message);
            callCount++;

            // Add user message
            client.chatHistory.push({ role: "user", content: message });
            yield [...client.chatHistory];

            if (callCount === 1) {
              // First call: yield some content, then throw rate limit error
              client.chatHistory.push({
                role: "assistant",
                content: "Partial response...",
              });
              yield [...client.chatHistory];
              throw new Error("Resource has been exhausted");
            }

            // Second call (retry with "continue"): complete the response
            client.chatHistory.push({
              role: "assistant",
              content: `Continued from: ${message}`,
            });
            yield [...client.chatHistory];
          },
      );

      await sendWithAdapter(rateLimitAdapter);

      // First call should have original message, retry should have "continue"
      expect(receivedMessages).toStrictEqual(["Hello", "continue"]);
    });

    it("clears rateLimitState before the retry attempt streams its response", async () => {
      // After the retry delay ends and the next attempt begins streaming, the
      // indicator must disappear immediately — not wait for the entire stream
      // (which can include long thinking/tool phases) to complete.
      // We use a gate Promise to pause the second sendMessage mid-stream,
      // then assert the indicator is already cleared while the stream is
      // still in flight.
      let callCount = 0;
      let resolveGate: () => void = () => {};
      const gate = new Promise<void>((resolve) => {
        resolveGate = resolve;
      });

      const rateLimitAdapter = createScriptedAdapter(
        mockAdapter,
        (client) =>
          async function* (message, _signal) {
            callCount++;

            if (callCount === 1) {
              throw new Error("Resource has been exhausted");
            }

            client.chatHistory.push({ role: "user", content: message });
            yield [...client.chatHistory];
            // Pause mid-stream — simulates a long-running response (thinking,
            // tool calls). The rate-limit indicator must already be hidden
            // by this point, not wait for the full stream to finish.
            await gate;
            client.chatHistory.push({
              role: "assistant",
              content: "ok",
            });
            yield [...client.chatHistory];
          },
      );

      const { result } = renderHook(() =>
        useChat({ ...defaultProps, adapter: rateLimitAdapter }),
      );

      // Kick off send without awaiting the full completion
      let sendDone = false;
      const sendPromise = result.current.handleSend("Hello").then(() => {
        sendDone = true;
      });

      // Drain timers/microtasks until the second sendMessage has yielded
      // its first chunk and is suspended on the gate. The retry delay
      // mock is 200 ms, plus a small margin for state to settle.
      await act(async () => {
        await new Promise((r) => setTimeout(r, 350));
      });

      expect(sendDone).toBe(false);
      expect(result.current.rateLimitState).toBeNull();

      // Release the gate and let send finish
      resolveGate();
      await act(async () => {
        await sendPromise;
      });

      expect(result.current.rateLimitState).toBeNull();
    });

    it("cancels retry when stopResponse is called during retry delay", async () => {
      // Create an adapter that always throws rate limit errors
      const alwaysRateLimitAdapter = {
        ...mockAdapter,
        createClient: vi.fn(() => {
          const client = new MockChatClient();

          // eslint-disable-next-line require-yield -- Throws before yielding to test error handling
          client.sendMessage = async function* (
            _message: string,
            _signal: AbortSignal,
          ) {
            throw new Error("Resource has been exhausted");
          };

          return client;
        }),
      };

      const { result } = renderHook(() =>
        useChat({ ...defaultProps, adapter: alwaysRateLimitAdapter }),
      );

      // Start send but don't await - it will enter retry delay
      const sendPromise = act(async () => {
        await result.current.handleSend("Hello");
      });

      // Give time for the rate limit to be detected and retry delay to start
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Stop the response while in retry delay
      await act(async () => {
        result.current.stopResponse();
      });

      // Wait for send to complete (should exit due to abort)
      await sendPromise;

      expect(result.current.isAssistantResponding).toBe(false);
      expect(result.current.rateLimitState).toBeNull();
    });

    it("persists cancel-during-retry error into chatHistory for auto-save", async () => {
      // Mimics the real ChatSdkClient: pushes a user message before
      // throwing 429. The stashed userMessageEntry from handleSend is a
      // different object than what sendMessage pushes, which previously
      // caused the cancel error to land in a fresh array copy and never
      // reach chatHistory — so auto-save persisted the user message
      // without the error.
      let capturedClient: MockChatClient | null = null;
      const realisticRateLimitAdapter = {
        ...mockAdapter,
        createClient: vi.fn(() => {
          const client = new MockChatClient();

          capturedClient = client;

          client.sendMessage = async function* (
            message: string,
            _signal: AbortSignal,
          ) {
            client.chatHistory.push({ role: "user", content: message });
            yield [...client.chatHistory];
            throw new Error("Resource has been exhausted");
          };

          return client;
        }),
      };

      const { result } = renderHook(() =>
        useChat({ ...defaultProps, adapter: realisticRateLimitAdapter }),
      );

      const sendPromise = act(async () => {
        await result.current.handleSend("Hello");
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      await act(async () => {
        result.current.stopResponse();
      });

      await sendPromise;

      expect(capturedClient).not.toBeNull();
      const chatHistory = capturedClient!.chatHistory;
      const errorEntry = chatHistory.find((m) => m.isError);

      expect(errorEntry).toBeDefined();
      expect(errorEntry?.content).toContain("Retry cancelled");
    });
  });
});
