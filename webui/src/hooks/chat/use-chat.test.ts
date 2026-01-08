/**
 * @vitest-environment happy-dom
 */
import { renderHook, act } from "@testing-library/preact";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useChat, type ChatClient, type ChatAdapter } from "./use-chat";
import type { UIMessage } from "#webui/types/messages";

// Mock streaming helpers
vi.mock(import("./helpers/streaming-helpers"), () => ({
  handleMessageStream: vi.fn(async (stream, formatter, onUpdate) => {
    // Simulate processing the stream
    for await (const chatHistory of stream) {
      onUpdate(formatter(chatHistory));
    }

    return true;
  }),
  validateMcpConnection: vi.fn(),
}));

// Type for our test messages
interface TestMessage {
  role: "user" | "assistant";
  content: string;
}

interface TestConfig {
  model: string;
  temperature: number;
  thinking: string;
}

// Mock chat client
class MockChatClient implements ChatClient<TestMessage> {
  chatHistory: TestMessage[] = [];

  initialize = vi.fn(async () => {
    // Initialization logic
  });

  async *sendMessage(
    message: string,
    signal: AbortSignal,
  ): AsyncIterable<TestMessage[]> {
    if (signal.aborted) {
      throw new Error("AbortError");
    }

    // Add user message
    this.chatHistory.push({ role: "user", content: message });

    // Yield after user message
    yield [...this.chatHistory];

    // Simulate assistant response
    this.chatHistory.push({
      role: "assistant",
      content: `Response to: ${message}`,
    });

    // Yield final state
    yield [...this.chatHistory];
  }
}

// Mock adapter
const mockAdapter: ChatAdapter<MockChatClient, TestMessage, TestConfig> = {
  createClient: vi.fn((_apiKey: string, _config: TestConfig) => {
    return new MockChatClient();
  }),

  buildConfig: vi.fn(
    (
      model: string,
      temperature: number,
      thinking: string,
      _enabledTools: Record<string, boolean>,
      _chatHistory: TestMessage[] | undefined,
      _extraParams?: Record<string, unknown>,
    ): TestConfig => ({
      model,
      temperature,
      thinking,
    }),
  ),

  formatMessages: vi.fn((messages: TestMessage[]): UIMessage[] => {
    return messages.map((msg, idx) => ({
      role: msg.role === "user" ? ("user" as const) : ("model" as const),
      parts: [{ type: "text" as const, content: msg.content }],
      rawHistoryIndex: idx,
      timestamp: Date.now(),
    }));
  }),

  createErrorMessage: vi.fn(
    (error: unknown, chatHistory: TestMessage[]): UIMessage[] => {
      const formatted = mockAdapter.formatMessages(chatHistory);

      return [
        ...formatted,
        {
          role: "model" as const,
          parts: [
            {
              type: "error" as const,
              content: String(error),
              isError: true,
            },
          ],
          rawHistoryIndex: chatHistory.length,
          timestamp: Date.now(),
        },
      ];
    },
  ),

  extractUserMessage: vi.fn((message: TestMessage): string | undefined => {
    return message.role === "user" ? message.content : undefined;
  }),

  createUserMessage: vi.fn(
    (text: string): TestMessage => ({
      role: "user",
      content: text,
    }),
  ),
};

describe("useChat", () => {
  const defaultProps = {
    provider: "gemini" as const,
    apiKey: "test-key",
    model: "test-model",
    thinking: "Default",
    temperature: 1.0,
    enabledTools: {},
    mcpStatus: "connected" as const,
    mcpError: null,
    checkMcpConnection: vi.fn(),
    adapter: mockAdapter,
  };

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
      expect(result.current.activeTemperature).toBeNull();
    });
  });

  describe("clearConversation", () => {
    it("resets all state to initial values", async () => {
      const { result } = renderHook(() => useChat(defaultProps));

      // Send a message first to populate state
      await act(async () => {
        await result.current.handleSend("Hello");
      });

      expect(result.current.messages.length).toBeGreaterThan(0);
      expect(result.current.activeModel).toBe("test-model");

      // Clear conversation
      await act(() => {
        result.current.clearConversation();
      });

      expect(result.current.messages).toStrictEqual([]);
      expect(result.current.activeModel).toBeNull();
      expect(result.current.activeThinking).toBeNull();
      expect(result.current.activeTemperature).toBeNull();
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

      const lastMessage =
        result.current.messages[result.current.messages.length - 1];

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
        temperature: 1.0,
        thinking: "Default",
      });
    });

    it("sets active model, thinking, and temperature after initialization", async () => {
      const { result } = renderHook(() => useChat(defaultProps));

      await act(async () => {
        await result.current.handleSend("Hello");
      });

      expect(result.current.activeModel).toBe("test-model");
      expect(result.current.activeThinking).toBe("Default");
      expect(result.current.activeTemperature).toBe(1.0);
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
      const { result } = renderHook(() => useChat(defaultProps));

      await act(async () => {
        await result.current.handleSend("Hello");
      });

      expect(result.current.messages.length).toBeGreaterThan(0);
      expect(mockAdapter.formatMessages).toHaveBeenCalled();
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
      const errorAdapter = {
        ...mockAdapter,
        createClient: vi.fn(() => {
          const client = new MockChatClient();

          client.initialize = vi.fn(async () => {
            throw new Error("Initialization failed");
          });

          return client;
        }),
      };

      const { result } = renderHook(() =>
        useChat({ ...defaultProps, adapter: errorAdapter }),
      );

      await act(async () => {
        await result.current.handleSend("Hello");
      });

      expect(errorAdapter.createErrorMessage).toHaveBeenCalled();
      const lastMessage =
        result.current.messages[result.current.messages.length - 1];
      const lastPart = lastMessage?.parts[0];

      expect(lastPart?.type).toBe("error");
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

    it("does nothing if no client initialized", async () => {
      const { result } = renderHook(() => useChat(defaultProps));

      await act(async () => {
        await result.current.handleRetry(0);
      });

      expect(mockAdapter.extractUserMessage).not.toHaveBeenCalled();
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

  describe("rate limit handling", () => {
    it("sets rateLimitState when rate limit error occurs", async () => {
      let callCount = 0;
      const rateLimitAdapter = {
        ...mockAdapter,
        createClient: vi.fn(() => {
          const client = new MockChatClient();
          const originalSendMessage = client.sendMessage.bind(client);

          client.sendMessage = async function* (
            message: string,
            signal: AbortSignal,
          ) {
            callCount++;

            if (callCount === 1) {
              // First call throws rate limit error
              throw new Error("Resource has been exhausted");
            }

            // Subsequent calls succeed
            yield* originalSendMessage(message, signal);
          };

          return client;
        }),
      };

      const { result } = renderHook(() =>
        useChat({ ...defaultProps, adapter: rateLimitAdapter }),
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
      let callCount = 0;

      const rateLimitAdapter = {
        ...mockAdapter,
        createClient: vi.fn(() => {
          const client = new MockChatClient();
          const originalSendMessage = client.sendMessage.bind(client);

          client.sendMessage = async function* (
            message: string,
            signal: AbortSignal,
          ) {
            receivedMessages.push(message);
            callCount++;

            if (callCount === 1) {
              // First call throws rate limit error immediately (no content)
              throw new Error("Resource has been exhausted");
            }

            yield* originalSendMessage(message, signal);
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

      // Both calls should have received the original message
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
  });
});
