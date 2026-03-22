// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { vi } from "vitest";
import { type TokenUsage } from "#webui/chat/sdk/types";
import {
  type ChatAdapter,
  type ChatClient,
} from "#webui/hooks/chat/use-chat-types";
import { type UIMessage } from "#webui/types/messages";

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
  totalUsage: TokenUsage | null = null;

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
    thinking: "Default",
    temperature: 1.0,
    enabledTools: {},
    smallModelMode: false,
    mcpStatus: "connected" as const,
    mcpError: null,
    checkMcpConnection: vi.fn(),
    adapter,
  };
}

/** Reusable chat history fixture for restored-conversation tests */
export const RESTORED_HISTORY: TestMessage[] = [
  { role: "user", content: "restored msg" },
  { role: "assistant", content: "restored reply" },
];

/**
 * Mock factory for streaming-helpers module, shared across useChat test files.
 * Use with vi.mock(import("#webui/hooks/chat/helpers/streaming-helpers"), mockStreamingHelpers).
 * @returns Mock streaming helpers module
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- vi.mock factory needs loose typing to match module signature
export function mockStreamingHelpers(): any {
  return {
    handleMessageStream: vi.fn(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- matching generic module mock signature
      async (stream: any, formatter: any, onUpdate: any) => {
        for await (const chatHistory of stream) {
          onUpdate(formatter(chatHistory));
        }

        return true;
      },
    ),
    validateMcpConnection: vi.fn(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- matching generic module mock signature
    filterOverrides: vi.fn((overrides: any) => overrides),
  };
}
