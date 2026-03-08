// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type UIMessage } from "#webui/types/messages";
import { type Provider } from "#webui/types/settings";

/** Per-message overrides for thinking, temperature, and showThoughts */
export interface MessageOverrides {
  thinking?: string;
  temperature?: number;
  showThoughts?: boolean;
}

/** Chat client interface that all providers must implement */
export interface ChatClient<TMessage> {
  chatHistory: TMessage[];
  initialize: () => Promise<void>;
  sendMessage: (
    message: string,
    signal: AbortSignal,
    overrides?: MessageOverrides,
  ) => AsyncIterable<TMessage[]>;
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
  rateLimitState: RateLimitState | null;
  handleSend: (message: string, options?: MessageOverrides) => Promise<void>;
  handleRetry: (mergedMessageIndex: number) => Promise<void>;
  handleEdit: (mergedMessageIndex: number, newMessage: string) => Promise<void>;
  clearConversation: () => void;
  stopResponse: () => void;
  getChatHistory: () => unknown[];
  restoreChatHistory: (chatHistory: unknown[]) => void;
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
  adapter: ChatAdapter<TClient, TMessage, TConfig>;
  extraParams?: Record<string, unknown>;
}
