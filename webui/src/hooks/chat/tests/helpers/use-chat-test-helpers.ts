// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { vi } from "vitest";
import { type TokenUsage } from "#webui/chat/sdk/types";
import type * as StreamingHelpers from "#webui/hooks/chat/helpers/streaming-helpers";
import {
  type ChatAdapter,
  type ChatClient,
  type ConversationLockedSettings,
} from "#webui/hooks/chat/use-chat-types";
import { type UIMessage } from "#webui/types/messages";

/** Test message type for mock chat client */
export interface TestMessage {
  role: "user" | "assistant";
  content: string;
  isError?: boolean;
}

/** Test configuration for mock adapter */
export interface TestConfig {
  model: string;
  thinking: string;
}

/** Mock chat client for testing useChat hook */
export class MockChatClient implements ChatClient<TestMessage> {
  chatHistory: TestMessage[] = [];
  totalUsage: TokenUsage | null = null;
  toolLimitReached = false;

  initialize = vi.fn(async () => {
    // Initialization logic
  });

  dispose = vi.fn();

  summarize = vi.fn(
    async (history: TestMessage[]): Promise<string> =>
      `Summary of ${history.length} messages`,
  );

  /**
   * Simulates sending a message and streaming responses
   * @param message - User message to send
   * @param signal - Abort signal
   * @param _overrides - Unused overrides parameter
   * @param shouldInterrupt - Optional interrupt callback (invoked for coverage)
   * @yields Chat history snapshots
   */
  async *sendMessage(
    message: string,
    signal: AbortSignal,
    _overrides?: unknown,
    shouldInterrupt?: () => boolean,
  ): AsyncIterable<TestMessage[]> {
    if (signal.aborted) {
      throw new Error("AbortError");
    }

    this.chatHistory.push({ role: "user", content: message });
    yield [...this.chatHistory];

    shouldInterrupt?.();

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

    buildConfig: vi.fn((model: string, thinking: string): TestConfig => ({
      model,
      thinking,
    })),

    formatMessages: vi.fn((messages: TestMessage[]): UIMessage[] => {
      return messages.map((msg, idx) => ({
        role: msg.role === "user" ? ("user" as const) : ("model" as const),
        parts: msg.isError
          ? [
              {
                type: "error" as const,
                content: msg.content,
                isError: true,
              },
            ]
          : [{ type: "text" as const, content: msg.content }],
        rawHistoryIndex: idx,
        timestamp: Date.now(),
      }));
    }),

    createErrorMessage: vi.fn(
      (error: unknown, chatHistory: TestMessage[]): UIMessage[] => {
        // Match the real adapter's contract: mutate chatHistory by pushing
        // the error so callers can persist it via getChatHistory.
        chatHistory.push({
          role: "assistant",
          content: String(error),
          isError: true,
        });

        return adapter.formatMessages(chatHistory);
      },
    ),

    extractUserMessage: vi.fn((message: TestMessage): string | undefined => {
      return message.role === "user" ? message.content : undefined;
    }),

    createUserMessage: vi.fn((text: string): TestMessage => ({
      role: "user",
      content: text,
    })),

    createCompactionSummary: vi.fn((summary: string): TestMessage => ({
      role: "user",
      content: summary,
    })),
  };

  return adapter;
}

/**
 * Build a mock adapter whose createClient returns a fresh MockChatClient,
 * optionally customized (override initialize/sendMessage to throw, seed
 * chatHistory, or capture the instance). Collapses the repeated
 * `{ ...createMockAdapter(), createClient: vi.fn(() => { ... }) }` setup.
 * @param customize - Optional mutator applied to each created client
 * @returns The adapter with a spying createClient
 */
export function adapterWithClient(
  customize?: (client: MockChatClient) => void,
): ChatAdapter<MockChatClient, TestMessage, TestConfig> {
  return {
    ...createMockAdapter(),
    createClient: vi.fn(() => {
      const client = new MockChatClient();

      customize?.(client);

      return client;
    }),
  };
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
    enabledTools: {},
    smallModelMode: false,
    mcpStatus: "connected" as const,
    mcpError: null,
    checkMcpConnection: vi.fn(),
    // Mirrors the default `apiKey` prop for the active provider; tests that
    // exercise the locked-provider path override this with a per-provider map.
    resolveConnection: vi.fn((_provider: string) => ({
      apiKey: "test-key",
      baseUrl: undefined as string | undefined,
    })),
    adapter,
  };
}

/** Reusable chat history fixture for restored-conversation tests */
export const RESTORED_HISTORY: TestMessage[] = [
  { role: "user", content: "restored msg" },
  { role: "assistant", content: "restored reply" },
];

/**
 * Build a ConversationLockedSettings object, defaulting every field to null.
 * Shared by the restore/continue tests that pass or assert locked settings.
 * @param over - Fields to override on the all-null default
 * @returns Locked settings for restoreChatHistory
 */
export function lockedSettings(
  over: Partial<ConversationLockedSettings> = {},
): ConversationLockedSettings {
  return {
    model: null,
    provider: null,
    thinking: null,
    smallModelMode: null,
    systemInstruction: null,
    notation: null,
    enabledTools: null,
    ...over,
  };
}

/**
 * Factory body for `vi.mock("#webui/hooks/chat/helpers/streaming-helpers", ...)`.
 * The real module is replaced with a pass-through `handleMessageStream` that
 * forwards every yielded chat history through the formatter so tests can
 * assert on the resulting `UIMessage[]` updates.
 *
 * @returns The mocked streaming-helpers module exports
 */
export async function streamingHelpersMockBody(): Promise<
  Partial<typeof StreamingHelpers>
> {
  const actual = await vi.importActual<typeof StreamingHelpers>(
    "#webui/hooks/chat/helpers/streaming-helpers",
  );

  return {
    // Pure helpers (no streaming side effects) — keep the real implementations
    // so client (re)init still resolves the locked provider/model correctly and
    // turn-failure recovery (error rendering, fork-signal cleanup) actually runs.
    resolveInitConnection: actual.resolveInitConnection,
    resolveLockedNotation: actual.resolveLockedNotation,
    recoverFromChatError: actual.recoverFromChatError,
    handleMessageStream: vi.fn(async (stream, formatter, onUpdate) => {
      for await (const chatHistory of stream) {
        onUpdate(formatter(chatHistory));
      }

      return true;
    }),
    validateMcpConnection: vi.fn(),
    filterOverrides: vi.fn((overrides) => overrides),
    showMissingApiKeyError: vi.fn(
      (adapter, msg, setMessages, pendingHistoryRef) => {
        const entry = adapter.createUserMessage(msg);
        const error = new Error(
          "No API key configured. Please add your API key in Settings.",
        );

        pendingHistoryRef.current = [entry];
        setMessages(adapter.createErrorMessage(error, [entry]));
      },
    ) as typeof StreamingHelpers.showMissingApiKeyError,
  };
}

/**
 * Wraps a custom `sendMessage` generator in a fresh MockChatClient
 * and returns an adapter that uses it. Used for scripted rate-limit / retry
 * scenarios where the sendMessage body varies but the wrapping boilerplate
 * is identical.
 *
 * @param baseAdapter - Base adapter to spread (commonly the shared `mockAdapter`)
 * @param scriptedSendMessage - Function that receives the new client and returns its sendMessage generator
 * @returns Adapter whose `createClient` yields a client with the scripted sendMessage
 */
export function createScriptedAdapter(
  baseAdapter: ChatAdapter<MockChatClient, TestMessage, TestConfig>,
  scriptedSendMessage: (
    client: MockChatClient,
  ) => MockChatClient["sendMessage"],
): ChatAdapter<MockChatClient, TestMessage, TestConfig> {
  return {
    ...baseAdapter,
    createClient: vi.fn(() => {
      const client = new MockChatClient();

      client.sendMessage = scriptedSendMessage(client);

      return client;
    }),
  };
}

/** The provider error text useChat's retry logic recognizes as a rate limit */
export const RATE_LIMIT_ERROR = "Resource has been exhausted";

/**
 * Build an adapter that mimics the real ChatSdkClient's rate-limit shape: every
 * call echoes the user message before streaming, the first call then throws a
 * 429, and the retry completes normally.
 *
 * `partialContent` controls the one bit the retry logic branches on — whether
 * the model produced assistant content before the 429 (retry sends "continue")
 * or only the user echo was yielded (retry re-sends the original message).
 *
 * @param baseAdapter - Base adapter to spread (commonly the shared `mockAdapter`)
 * @param options - Behavior switches
 * @param options.partialContent - Assistant text to yield before the first call's 429; omit to throw right after the user echo
 * @returns The adapter and the live list of messages its client received
 */
export function createEchoThenRateLimitAdapter(
  baseAdapter: ChatAdapter<MockChatClient, TestMessage, TestConfig>,
  options: { partialContent?: string } = {},
): {
  adapter: ChatAdapter<MockChatClient, TestMessage, TestConfig>;
  receivedMessages: string[];
} {
  const receivedMessages: string[] = [];
  let callCount = 0;

  const adapter = createScriptedAdapter(
    baseAdapter,
    (client) =>
      async function* (message: string) {
        receivedMessages.push(message);
        callCount++;

        client.chatHistory.push({ role: "user", content: message });
        yield [...client.chatHistory];

        if (callCount === 1) {
          if (options.partialContent != null) {
            client.chatHistory.push({
              role: "assistant",
              content: options.partialContent,
            });
            yield [...client.chatHistory];
          }

          throw new Error(RATE_LIMIT_ERROR);
        }

        client.chatHistory.push({
          role: "assistant",
          content: `Done: ${message}`,
        });
        yield [...client.chatHistory];
      },
  );

  return { adapter, receivedMessages };
}
