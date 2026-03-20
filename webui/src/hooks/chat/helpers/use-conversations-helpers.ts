// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type TokenUsage } from "#webui/chat/sdk/types";
import { type ConversationLockedSettings } from "#webui/hooks/chat/use-chat-types";
import { getModelName } from "#webui/lib/config";
import { type ConversationRecord } from "#webui/lib/conversation-db";
import { type Provider } from "#webui/types/settings";

/** Mutable metadata for the active conversation (excludes ID which is tracked separately) */
export interface ActiveMeta {
  title: string | null;
  createdAt: number | null;
  bookmarked: boolean;
  model: string | null;
  provider: Provider | null;
  thinking: string | null;
  temperature: number | null;
  showThoughts: boolean | null;
  smallModelMode: boolean | null;
}

export const DEFAULT_META: ActiveMeta = {
  title: null,
  createdAt: null,
  bookmarked: false,
  model: null,
  provider: null,
  thinking: null,
  temperature: null,
  showThoughts: null,
  smallModelMode: null,
};

/** Ref snapshot for building a save record */
export interface ActiveRefs extends ActiveMeta {
  id: string;
}

/**
 * Read the conversation ID from the URL hash.
 * @returns The conversation ID, or null if no hash is set
 */
export function getHashConversationId(): string | null {
  const hash = window.location.hash.slice(1);

  return hash || null;
}

/**
 * Set the URL hash to the given conversation ID (or clear it).
 * @param id - Conversation ID, or null to clear the hash
 */
export function setLocationHash(id: string | null): void {
  if (id) {
    window.location.hash = id;
  } else {
    // Remove hash without scrolling — pushState avoids hashchange event issues
    history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
  }
}

/**
 * Build locked settings from a conversation record for restoring.
 * @param record - Conversation record to extract settings from
 * @returns Locked settings for restoreChatHistory
 */
export function buildLockedSettings(
  record: ConversationRecord,
): ConversationLockedSettings {
  return {
    model: record.model,
    provider: record.provider as Provider | null,
    thinking: record.thinking,
    temperature: record.temperature,
    showThoughts: record.showThoughts,
    smallModelMode: record.smallModelMode,
  };
}

/**
 * Build a ConversationRecord for saving from active refs and chat history.
 * @param refs - Current active ref values
 * @param existing - Previously saved record (if updating)
 * @param chatHistory - Current chat messages
 * @param updatedAt - Explicit timestamp for updatedAt (omit to preserve existing)
 * @returns Record ready for saveConversation
 */
export function buildSaveRecord(
  refs: ActiveRefs,
  existing: ConversationRecord | undefined,
  chatHistory: unknown[],
  updatedAt?: number,
): ConversationRecord {
  const now = Date.now();
  const existingTitle = existing?.title ?? refs.title ?? null;
  const title = deriveTitle(existingTitle, chatHistory);

  return {
    id: refs.id,
    title,
    createdAt: existing?.createdAt ?? refs.createdAt ?? now,
    updatedAt: updatedAt ?? existing?.updatedAt ?? now,
    bookmarked: existing?.bookmarked ?? refs.bookmarked,
    provider: refs.provider,
    model: refs.model,
    modelLabel: refs.model ? getModelName(refs.model) : null,
    thinking: refs.thinking,
    temperature: refs.temperature,
    showThoughts: refs.showThoughts,
    smallModelMode: refs.smallModelMode,
    totalUsage: sumMessageUsage(chatHistory),
    messages: chatHistory as ConversationRecord["messages"],
  };
}

/**
 * Sum token usage across all assistant messages in the chat history.
 * @param chatHistory - Chat messages (typed as unknown[] for generic compat)
 * @returns Summed usage, or null if no usage data found
 */
export function sumMessageUsage(chatHistory: unknown[]): TokenUsage | null {
  const messages = chatHistory as Array<{ role: string; usage?: TokenUsage }>;
  let hasUsage = false;
  let inputTokens = 0;
  let outputTokens = 0;
  let reasoningTokens = 0;

  for (const msg of messages) {
    if (msg.role !== "assistant" || !msg.usage) continue;

    hasUsage = true;
    inputTokens += msg.usage.inputTokens ?? 0;
    outputTokens += msg.usage.outputTokens ?? 0;
    reasoningTokens += msg.usage.reasoningTokens ?? 0;
  }

  if (!hasUsage) return null;

  return {
    inputTokens,
    outputTokens,
    ...(reasoningTokens > 0 && { reasoningTokens }),
  };
}

const CONNECT_PATTERN =
  /^\s*(connect(\s+to\s+ableton)?|ableton)\s*[!,.:;?]*\s*$/i;

/**
 * Extracts the first line of a message content string.
 * @param content - Raw message content
 * @returns First non-empty line, or the whole string if single-line
 */
function firstLine(content: string): string {
  return content.split("\n")[0]?.trim() ?? "";
}

/**
 * Derives an automatic title from chat history when no manual title exists.
 *
 * Uses the first user message's first line as the title. If that looks like
 * a "connect to Ableton" command, upgrades to the second user message's
 * first line when available.
 * @param currentTitle - Existing title (null if none)
 * @param chatHistory - Current chat messages
 * @returns Derived title, or currentTitle if already set manually
 */
export function deriveTitle(
  currentTitle: string | null,
  chatHistory: unknown[],
): string | null {
  const messages = chatHistory as Array<{ role: string; content: string }>;
  const userMessages = messages.filter((m) => m.role === "user");

  if (userMessages.length === 0) return currentTitle;

  const firstUserLine = firstLine(userMessages[0]?.content ?? "");

  // Keep manually-set titles that don't match auto-derived ones
  if (currentTitle != null && !CONNECT_PATTERN.test(currentTitle)) {
    return currentTitle;
  }

  // If first message is a connect command, try second user message
  if (CONNECT_PATTERN.test(firstUserLine) && userMessages.length > 1) {
    return firstLine(userMessages[1]?.content ?? "") || firstUserLine;
  }

  return firstUserLine || null;
}
