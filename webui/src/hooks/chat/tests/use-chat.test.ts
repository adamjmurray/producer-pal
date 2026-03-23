// Producer Pal
// Copyright (C) 2026 Adam Murray
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

const mockAdapter = createMockAdapter();

/**
 * Render useChat with default props, send "Hello", and return the result.
 * @param props - Optional props override
 * @returns Hook result ref after sending a message
 */
async function renderAndSend(props = defaultProps) {
  const { result } = renderHook(() => useChat(props));

  await act(async () => {
    await result.current.handleSend("Hello");
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
        temperature: 1.0,
        thinking: "Default",
      });
    });

    it("sets active model, thinking, and temperature after initialization", async () => {
      const result = await renderAndSend();

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
      const lastMessage = result.current.messages.at(-1);
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

    it("covers getChatHistory callback when sendMessage throws non-rate-limit error", async () => {
      const errorAdapter = {
        ...mockAdapter,
        createClient: vi.fn(() => {
          const client = new MockChatClient();

          // eslint-disable-next-line require-yield -- Throws before yielding
          client.sendMessage = async function* () {
            throw new Error("Network failure");
          };

          return client;
        }),
      };

      const { result } = renderHook(() =>
        useChat({ ...defaultProps, adapter: errorAdapter }),
      );

      await act(async () => {
        await result.current.handleSend("Hello");
      });

      // Error should be displayed via createErrorMessage with chatHistory
      expect(errorAdapter.createErrorMessage).toHaveBeenCalledWith(
        expect.any(Error),
        expect.any(Array),
      );
      expect(result.current.isAssistantResponding).toBe(false);
    });
  });
});
