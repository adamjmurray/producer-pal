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
  RESTORED_HISTORY,
} from "./use-chat-test-helpers";

// Mock streaming helpers
vi.mock(import("#webui/hooks/chat/helpers/streaming-helpers"), () => ({
  handleMessageStream: vi.fn(async (stream, formatter, onUpdate) => {
    for await (const chatHistory of stream) {
      onUpdate(formatter(chatHistory));
    }

    return true;
  }),
  validateMcpConnection: vi.fn(),
  filterOverrides: vi.fn((overrides) => overrides),
}));

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

      // buildConfig should have been called with the pending history
      expect(mockAdapter.buildConfig).toHaveBeenCalledWith(
        "test-model",
        1.0,
        "Default",
        {},
        history,
        undefined,
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

      const rateLimitAdapter = {
        ...mockAdapter,
        createClient: vi.fn(() => {
          const client = new MockChatClient();

          client.sendMessage = async function* (
            message: string,
            _signal: AbortSignal,
          ) {
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
          };

          return client;
        }),
      };

      const { result } = renderHook(() =>
        useChat({ ...defaultProps, adapter: rateLimitAdapter }),
      );

      await act(async () => {
        await result.current.handleSend("Hello");
      });

      expect(receivedMessages).toStrictEqual(["Hello", "Hello"]);
    });

    it("sends 'continue' on retry when content was already received", async () => {
      const receivedMessages: string[] = [];
      let callCount = 0;

      const rateLimitAdapter = {
        ...mockAdapter,
        createClient: vi.fn(() => {
          const client = new MockChatClient();

          client.sendMessage = async function* (
            message: string,
            _signal: AbortSignal,
          ) {
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
          };

          return client;
        }),
      };

      const { result } = renderHook(() =>
        useChat({ ...defaultProps, adapter: rateLimitAdapter }),
      );

      await act(async () => {
        await result.current.handleSend("Hello");
      });

      // First call should have original message, retry should have "continue"
      expect(receivedMessages).toStrictEqual(["Hello", "continue"]);
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
  });
});
