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

  /**
   * Simulates a rate-limit retry: re-streams the turn WITHOUT re-sending the
   * user's message, which is already in chatHistory. The real client decides
   * whether to append a "continue" turn from the built wire shape; this stand-in
   * just answers whatever the last user turn was.
   * @param signal - Abort signal
   * @param _overrides - Unused overrides parameter
   * @param shouldInterrupt - Optional interrupt callback (invoked for coverage)
   * @yields Chat history snapshots
   */
  async *resumeStream(
    signal: AbortSignal,
    _overrides?: unknown,
    shouldInterrupt?: () => boolean,
  ): AsyncIterable<TestMessage[]> {
    if (signal.aborted) {
      throw new Error("AbortError");
    }

    shouldInterrupt?.();

    const lastUser = [...this.chatHistory]
      .toReversed()
      .find((m) => m.role === "user");

    this.chatHistory.push({
      role: "assistant",
      content: `Response to: ${lastUser?.content ?? ""}`,
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
 * An adapter whose clients record what they were asked to do: every client
 * created, every message sent, and every abort signal streamed with. `gate`
 * holds each stream open after its first yield so a test can keep a turn
 * in-flight; `customize` mutates each client as it is built (e.g. to hang one
 * client's initialize() and park a turn in its connect).
 * @param recorded - Arrays to record into, plus the optional stream gate
 * @param recorded.clients - Receives every client the adapter builds
 * @param recorded.sent - Receives every message streamed
 * @param recorded.signals - Receives every stream's abort signal
 * @param recorded.gate - Held open after the first yield of each stream
 * @param customize - Optional mutator applied to each created client
 * @returns The recording adapter
 */
export function trackingAdapter(
  recorded: {
    clients: MockChatClient[];
    sent?: string[];
    signals?: AbortSignal[];
    gate?: Promise<void>;
  },
  customize?: (client: MockChatClient) => void,
): ChatAdapter<MockChatClient, TestMessage, TestConfig> {
  const { clients, sent, signals, gate } = recorded;

  return adapterWithClient((client) => {
    clients.push(client);

    client.sendMessage = async function* (
      message: string,
      signal: AbortSignal,
    ) {
      sent?.push(message);
      signals?.push(signal);
      client.chatHistory.push({ role: "user", content: message });
      yield [...client.chatHistory];

      await gate;
    };

    customize?.(client);
  });
}

/**
 * Let pending microtasks — and the streams they start — settle.
 */
export async function tick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
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
    beginTurn: actual.beginTurn,
    resolveInitConnection: actual.resolveInitConnection,
    resolveLockedNotation: actual.resolveLockedNotation,
    resolveLockedSmallModelMode: actual.resolveLockedSmallModelMode,
    recoverFromChatError: actual.recoverFromChatError,
    runChatTurn: actual.runChatTurn,
    connectClient: actual.connectClient,
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
  scriptedResumeStream?: (
    client: MockChatClient,
  ) => MockChatClient["resumeStream"],
): ChatAdapter<MockChatClient, TestMessage, TestConfig> {
  return {
    ...baseAdapter,
    createClient: vi.fn(() => {
      const client = new MockChatClient();

      client.sendMessage = scriptedSendMessage(client);

      if (scriptedResumeStream) {
        client.resumeStream = scriptedResumeStream(client);
      }

      return client;
    }),
  };
}

/** The provider error text useChat's retry logic recognizes as a rate limit */
export const RATE_LIMIT_ERROR = "Resource has been exhausted";

/** One attempt the retry path made, and the message it carried (a resume has none). */
export interface ScriptedAttempt {
  kind: "send" | "resume";
  message?: string;
}

/**
 * Build an adapter that mimics the real ChatSdkClient's rate-limit shape: the
 * first attempt echoes the user message and then throws a 429; the retry arrives
 * through resumeStream and completes.
 *
 * `partialContent` controls whether the model produced assistant content before
 * the 429. It no longer changes what the retry SENDS — a retry never re-sends,
 * and whether a "continue" turn is needed is the real client's decision — so it
 * exists to check that partial work survives the resume.
 *
 * @param baseAdapter - Base adapter to spread (commonly the shared `mockAdapter`)
 * @param options - Behavior switches
 * @param options.partialContent - Assistant text to yield before the first call's 429; omit to throw right after the user echo
 * @returns The adapter and the live list of attempts its client saw
 */
export function createEchoThenRateLimitAdapter(
  baseAdapter: ChatAdapter<MockChatClient, TestMessage, TestConfig>,
  options: { partialContent?: string } = {},
): {
  adapter: ChatAdapter<MockChatClient, TestMessage, TestConfig>;
  attempts: ScriptedAttempt[];
} {
  const attempts: ScriptedAttempt[] = [];

  const adapter = createScriptedAdapter(
    baseAdapter,
    (client) =>
      async function* (message: string) {
        attempts.push({ kind: "send", message });

        client.chatHistory.push({ role: "user", content: message });
        yield [...client.chatHistory];

        if (options.partialContent != null) {
          client.chatHistory.push({
            role: "assistant",
            content: options.partialContent,
          });
          yield [...client.chatHistory];
        }

        throw new Error(RATE_LIMIT_ERROR);
      },
    (client) =>
      // A resume pushes no user turn: the message is already in history.
      async function* () {
        attempts.push({ kind: "resume" });

        client.chatHistory.push({ role: "assistant", content: "Done" });
        yield [...client.chatHistory];
      },
  );

  return { adapter, attempts };
}
