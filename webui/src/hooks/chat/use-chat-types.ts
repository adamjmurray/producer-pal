// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type UIMessage } from "#webui/types/messages";
import { type Provider } from "#webui/types/settings";

/** Per-message overrides for thinking */
export interface MessageOverrides {
  thinking?: string;
}

/** Chat client interface that all providers must implement */
export interface ChatClient<TMessage> {
  chatHistory: TMessage[];
  /**
   * True when the last stream stopped because it hit the tool-call step limit
   * while the model still wanted to call more tools. Optional: clients that do
   * not support multi-step tool calling may omit it.
   */
  toolLimitReached?: boolean;
  initialize: () => Promise<void>;
  sendMessage: (
    message: string,
    signal: AbortSignal,
    overrides?: MessageOverrides,
  ) => AsyncIterable<TMessage[]>;
  /**
   * Summarize a slice of history into a compaction summary string. Optional:
   * clients that don't support compaction may omit it.
   */
  summarize?: (history: TMessage[]) => Promise<string>;
}

/**
 * Provider-specific adapter interface
 */
export interface ChatAdapter<
  TClient extends ChatClient<TMessage>,
  TMessage,
  TConfig,
> {
  /** Create a new client instance */
  createClient: (apiKey: string, config: TConfig) => TClient;

  /** Build provider-specific configuration */
  buildConfig: (
    model: string,
    temperature: number,
    thinking: string,
    enabledTools: Record<string, boolean>,
    chatHistory: TMessage[] | undefined,
    extraParams?: Record<string, unknown>,
  ) => TConfig;

  /** Format messages for UI display */
  formatMessages: (messages: TMessage[]) => UIMessage[];

  /** Create error message in provider's format */
  createErrorMessage: (error: unknown, chatHistory: TMessage[]) => UIMessage[];

  /** Extract user message text from a message for retry */
  extractUserMessage: (message: TMessage) => string | undefined;

  /** Create initial user message for error display */
  createUserMessage: (text: string) => TMessage;

  /** Create a synthetic compaction summary message */
  createCompactionSummary: (summary: string) => TMessage;
}

/** Model/provider/behavior settings persisted with a conversation */
export interface ConversationLockedSettings {
  model: string | null;
  provider: Provider | null;
  thinking: string | null;
  temperature: number | null;
  showThoughts: boolean | null;
  smallModelMode: boolean | null;
}

/** Rate limit retry state for UI display */
export interface RateLimitState {
  isRetrying: boolean;
  attempt: number;
  maxAttempts: number;
  delayMs: number;
}

export interface UseChatReturn {
  messages: UIMessage[];
  isAssistantResponding: boolean;
  activeModel: string | null;
  activeProvider: Provider | null;
  activeThinking: string | null;
  activeTemperature: number | null;
  activeShowThoughts: boolean | null;
  activeSmallModelMode: boolean | null;
  rateLimitState: RateLimitState | null;
  /** True when the last response stopped at the tool-call step limit */
  toolLimitReached: boolean;
  /** True while a compaction summary is being generated */
  isCompacting: boolean;
  /** True when the most recent compaction can still be undone (in-memory) */
  canUndoCompaction: boolean;
  handleSend: (message: string, options?: MessageOverrides) => Promise<void>;
  handleRetry: (mergedMessageIndex: number) => Promise<void>;
  handleEdit: (mergedMessageIndex: number, newMessage: string) => Promise<void>;
  /** Compact the conversation up to and including the given UI message */
  compact: (mergedMessageIndex: number) => Promise<void>;
  /** Restore the pre-compaction history (while still available) */
  undoCompaction: () => void;
  clearConversation: () => void;
  stopResponse: () => void;
  getChatHistory: () => unknown[];
  restoreChatHistory: (
    chatHistory: unknown[],
    lockedSettings?: ConversationLockedSettings,
  ) => void;
}

export interface UseChatProps<
  TClient extends ChatClient<TMessage>,
  TMessage,
  TConfig,
> {
  provider: Provider;
  apiKey: string;
  model: string;
  thinking: string;
  temperature: number;
  enabledTools: Record<string, boolean>;
  mcpStatus: "connected" | "connecting" | "error";
  mcpError: string | null;
  checkMcpConnection: () => Promise<void>;
  smallModelMode: boolean;
  adapter: ChatAdapter<TClient, TMessage, TConfig>;
  extraParams?: Record<string, unknown>;
  autoSaveRef?: { current: (() => void) | null };
}
