// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { vi } from "vitest";
import { type UIMessage } from "#webui/types/messages";
import { type ChatAdapter, type ChatClient } from "./use-chat-types";

/** Test message type for mock chat client */
export interface TestMessage {
  role: "user" | "assistant";
  content: string;
}

/** Test configuration for mock adapter */
export interface TestConfig {
  model: string;
  temperature: number;
  thinking: string;
}

/** Mock chat client for testing useChat hook */
export class MockChatClient implements ChatClient<TestMessage> {
  chatHistory: TestMessage[] = [];

  initialize = vi.fn(async () => {
    // Initialization logic
  });

  /**
   * Simulates sending a message and streaming responses
   * @param message - User message to send
   * @param signal - Abort signal
   * @yields Chat history snapshots
   */
  async *sendMessage(
    message: string,
    signal: AbortSignal,
  ): AsyncIterable<TestMessage[]> {
    if (signal.aborted) {
      throw new Error("AbortError");
    }

    this.chatHistory.push({ role: "user", content: message });
    yield [...this.chatHistory];

    this.chatHistory.push({
      role: "assistant",
      content: `Response to: ${message}`,
    });
    yield [...this.chatHistory];
  }
}

/**
 * Creates a mock adapter for testing
 * @returns Mock adapter instance
 */
export function createMockAdapter(): ChatAdapter<
  MockChatClient,
  TestMessage,
  TestConfig
> {
  const adapter: ChatAdapter<MockChatClient, TestMessage, TestConfig> = {
    createClient: vi.fn(() => new MockChatClient()),

    buildConfig: vi.fn(
      (model: string, temperature: number, thinking: string): TestConfig => ({
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
        const formatted = adapter.formatMessages(chatHistory);

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
      (text: string): TestMessage => ({ role: "user", content: text }),
    ),
  };

  return adapter;
}

/**
 * Creates default props for useChat hook tests
 * @param adapter - Mock adapter to use
 * @returns Default hook props
 */
export function createDefaultProps(
  adapter: ChatAdapter<MockChatClient, TestMessage, TestConfig>,
) {
  return {
    provider: "gemini" as const,
    apiKey: "test-key",
    model: "test-model",
    thinking: "Adaptive",
    temperature: 1.0,
    enabledTools: {},
    smallModelMode: false,
    mcpStatus: "connected" as const,
    mcpError: null,
    checkMcpConnection: vi.fn(),
    adapter,
  };
}
