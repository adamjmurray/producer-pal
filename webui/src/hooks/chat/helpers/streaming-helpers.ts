// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type ChatAdapter,
  type ChatClient,
  type MessageOverrides,
} from "#webui/hooks/chat/use-chat-types";
import { type UIMessage } from "#webui/types/messages";
import { type Provider } from "#webui/types/settings";

/**
 * Generic streaming handler for chat messages.
 * Returns true if completed successfully, false if aborted.
 * @param {AsyncIterable<TMessage[]>} stream - Stream of message arrays
 * @param {(history: TMessage[]) => UIMessage[]} formatter - Function to format messages
 * @param {(messages: UIMessage[]) => void} onUpdate - Callback for message updates
 * @returns {any} - Hook return value
 */
export async function handleMessageStream<TMessage>(
  stream: AsyncIterable<TMessage[]>,
  formatter: (history: TMessage[]) => UIMessage[],
  onUpdate: (messages: UIMessage[]) => void,
): Promise<boolean> {
  try {
    for await (const chatHistory of stream) {
      onUpdate(formatter(chatHistory));
    }

    return true;
  } catch (error) {
    // Abort errors are expected when user cancels - don't treat as error
    if (error instanceof Error && error.name === "AbortError") {
      return false;
    }

    throw error;
  }
}

/**
 * Validates MCP connection status and throws if there's an error.
 * Auto-retries connection if it failed.
 * @param {"connected" | "connecting" | "error"} mcpStatus - MCP connection status
 * @param {string | null} mcpError - MCP error message if any
 * @param {() => Promise<void>} checkMcpConnection - Callback to retry connection
 * @returns {any} - Hook return value
 */
export async function validateMcpConnection(
  mcpStatus: "connected" | "connecting" | "error",
  mcpError: string | null,
  checkMcpConnection: () => Promise<void>,
): Promise<void> {
  if (mcpStatus === "error") {
    await checkMcpConnection();
    throw new Error(`MCP connection failed: ${mcpError}`);
  }
}

interface ConversationDefaults {
  thinking: string | null;
}

/**
 * Filter per-message overrides to only include fields that differ from
 * conversation defaults. Returns undefined if no fields differ.
 * @param overrides - Raw overrides from the UI (always populated)
 * @param defaults - Conversation-locked defaults
 * @returns Filtered overrides, or undefined if nothing differs
 */
export function filterOverrides(
  overrides: MessageOverrides | undefined,
  defaults: ConversationDefaults,
): MessageOverrides | undefined {
  if (!overrides) return undefined;

  if (overrides.thinking != null && overrides.thinking !== defaults.thinking) {
    return { thinking: overrides.thinking };
  }

  return undefined;
}

/**
 * Show error when API key is not configured. Stashes the user message to
 * pendingHistoryRef so retry/edit can recover after the user fixes settings.
 * @param adapter - Chat adapter for formatting
 * @param userMessage - The user's message text
 * @param setMessages - State setter for messages
 * @param pendingHistoryRef - Ref to stash the user message entry for retry/edit
 * @param pendingHistoryRef.current - The stashed history (set by this function)
 */
export function showMissingApiKeyError<
  TClient extends ChatClient<TMessage>,
  TMessage,
  TConfig,
>(
  adapter: ChatAdapter<TClient, TMessage, TConfig>,
  userMessage: string,
  setMessages: (msgs: UIMessage[]) => void,
  pendingHistoryRef: { current: TMessage[] | null },
): void {
  const entry = adapter.createUserMessage(userMessage);

  pendingHistoryRef.current = [entry];
  setMessages(
    adapter.createErrorMessage(
      new Error("No API key configured. Please add your API key in Settings."),
      [entry],
    ),
  );
}

/** Effective connection used to (re)build a chat client at init time. */
export interface InitConnection {
  provider: Provider;
  model: string;
  apiKey: string;
  extraParams: Record<string, unknown>;
}

/**
 * Resolve the provider/model/connection to (re)build a client with.
 *
 * Honors the conversation's locked provider+model when continuing a restored
 * conversation (locked values are non-null), falling back to current settings
 * for a brand-new conversation. The key + base URL always come from the user's
 * *current* settings for the effective provider — no API key is ever persisted
 * with the conversation.
 *
 * @param locked - Conversation's locked provider/model (null fields if unset)
 * @param locked.activeProvider - Locked provider, or null when not locked
 * @param locked.activeModel - Locked model, or null when not locked
 * @param fallback - Current-settings provider/model (used when not locked)
 * @param fallback.provider - Current-settings provider
 * @param fallback.model - Current-settings model
 * @param resolveConnection - Resolves a provider's current key + base URL
 * @param extraParams - Base extra params to merge the connection into
 * @returns Effective provider, model, key, and merged extra params
 */
export function resolveInitConnection(
  locked: { activeProvider: Provider | null; activeModel: string | null },
  fallback: { provider: Provider; model: string },
  resolveConnection: (provider: Provider) => {
    apiKey: string;
    baseUrl?: string;
  },
  extraParams?: Record<string, unknown>,
): InitConnection {
  const provider = locked.activeProvider ?? fallback.provider;
  const model = locked.activeModel ?? fallback.model;
  const { apiKey, baseUrl } = resolveConnection(provider);

  return {
    provider,
    model,
    apiKey,
    extraParams: { ...extraParams, provider, apiKey, baseUrl },
  };
}
