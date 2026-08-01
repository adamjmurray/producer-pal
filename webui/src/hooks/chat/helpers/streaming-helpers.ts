// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { isNotation, type Notation } from "#src/shared/notation";
import {
  type ChatAdapter,
  type ChatClient,
  type MessageOverrides,
  type PendingForkRef,
} from "#webui/hooks/chat/use-chat-types";
import { resolveSystemInstruction } from "#webui/lib/config";
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

/** Dependencies for {@link recoverFromChatError}. */
export interface RecoverFromChatErrorArgs<
  TClient extends ChatClient<TMessage>,
  TMessage,
  TConfig,
> {
  error: unknown;
  adapter: ChatAdapter<TClient, TMessage, TConfig>;
  clientRef: { current: TClient | null };
  pendingHistoryRef: { current: TMessage[] | null };
  /** The user message stashed before this turn, or null (fork passes none). */
  stashed: TMessage | null;
  setMessages: (msgs: UIMessage[]) => void;
  autoSaveRef?: { current: (() => void) | null };
  pendingForkRef?: PendingForkRef;
}

/**
 * Render a chat turn failure and recover transient state. Surfaces the error in
 * the message list (against the live client history, or the restored-but-not-
 * yet-sent history when init threw before a client existed), stashes a user
 * message that never reached the client for retry/edit, autosaves when a client
 * exists, and otherwise drops any pending-fork signal so it can't linger and
 * mis-branch a later, unrelated save.
 *
 * @param args - Error and the chat refs/adapter needed to recover
 */
export function recoverFromChatError<
  TClient extends ChatClient<TMessage>,
  TMessage,
  TConfig,
>(args: RecoverFromChatErrorArgs<TClient, TMessage, TConfig>): void {
  const {
    error,
    adapter,
    clientRef,
    pendingHistoryRef,
    stashed,
    setMessages,
    autoSaveRef,
    pendingForkRef,
  } = args;

  // Fall back to the restored-but-not-yet-sent history when no client was built
  // (init threw early, e.g. MCP down) so a failed fork/send renders the existing
  // conversation instead of an empty view. Copy it — createErrorMessage mutates
  // the array, and pendingHistoryRef must stay clean for a later send to
  // bootstrap from.
  const baseHistory =
    clientRef.current?.chatHistory ??
    (pendingHistoryRef.current ? [...pendingHistoryRef.current] : []);
  // When init fails before client.sendMessage, the user message never reached
  // chatHistory. Surface it in the error UI and stash it for retry/edit so the
  // user isn't stranded if there's no usable client.
  const includeStashed = stashed && !baseHistory.includes(stashed);
  const errorHistory = includeStashed ? [...baseHistory, stashed] : baseHistory;

  if (!clientRef.current && includeStashed) {
    pendingHistoryRef.current = [stashed];
  }

  setMessages(adapter.createErrorMessage(error, errorHistory));

  if (clientRef.current) {
    // The includeStashed path built errorHistory as a fresh array
    // ([...chatHistory, stashedUserMessage]) and createErrorMessage then
    // appended the error to it. This is the init-failure case: the client exists
    // but sendMessage never ran, so its chatHistory is still empty and has
    // neither the user message nor the error. Assign the whole array — pushing
    // only the error (the previous behavior) persisted the error without the
    // user message that prompted it, so a reload showed a dangling error.
    // Reassigning is safe: sendMessage and compact() read chatHistory fresh.
    if (errorHistory !== clientRef.current.chatHistory) {
      clientRef.current.chatHistory = errorHistory;
    }

    autoSaveRef?.current?.();
  } else if (pendingForkRef) {
    // No client means init threw before one was built (e.g. MCP down), so the
    // recovery autosave above — the only consumer of a pending fork signal —
    // never runs. Drop the signal here or it lingers and mis-branches the next,
    // unrelated save into a spurious sibling.
    pendingForkRef.current = null;
  }
}

/** Effective connection used to (re)build a chat client at init time. */
export interface InitConnection {
  provider: Provider;
  model: string;
  apiKey: string;
  extraParams: Record<string, unknown>;
  /** The resolved system instruction to lock and send for this init. */
  systemInstruction: string;
  /**
   * The notation to lock and send for this init, or null when the caller has no
   * notation of its own (voice mode, tests) and the request should fall through
   * to the device global.
   */
  notation: Notation | null;
  /** The small-model mode to lock and send for this init. */
  smallModelMode: boolean;
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
 * A restored conversation also carries its locked system instruction through as
 * `lockedSystemInstruction`, so the adapter sends what the conversation started
 * with rather than the current global override. Null (brand-new conversation)
 * lets the adapter fall back to resolving the current override. Its locked
 * notation and small-model mode ride along the same way, as `lockedNotation` and
 * `lockedSmallModelMode`.
 *
 * @param locked - Conversation's locked provider/model/system-instruction/notation/small-model mode (null fields if unset)
 * @param locked.activeProvider - Locked provider, or null when not locked
 * @param locked.activeModel - Locked model, or null when not locked
 * @param locked.activeSystemInstruction - Locked system instruction, or null when not locked
 * @param locked.activeNotation - Locked notation, or null when not locked
 * @param locked.activeSmallModelMode - Locked small-model mode, or null when not locked
 * @param fallback - Current-settings provider/model (used when not locked)
 * @param fallback.provider - Current-settings provider
 * @param fallback.model - Current-settings model
 * @param resolveConnection - Resolves a provider's current key + base URL
 * @param extraParams - Base extra params to merge the connection into
 * @returns Effective provider, model, key, and merged extra params
 */
export function resolveInitConnection(
  locked: {
    activeProvider: Provider | null;
    activeModel: string | null;
    activeSystemInstruction: string | null;
    activeNotation: Notation | null;
    activeSmallModelMode: boolean | null;
  },
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
  const mergedExtraParams = {
    ...extraParams,
    provider,
    apiKey,
    baseUrl,
    lockedSystemInstruction: locked.activeSystemInstruction,
    lockedNotation: locked.activeNotation,
    lockedSmallModelMode: locked.activeSmallModelMode,
  };

  return {
    provider,
    model,
    apiKey,
    extraParams: mergedExtraParams,
    systemInstruction: resolveLockedSystemInstruction(mergedExtraParams),
    notation: resolveLockedNotation(mergedExtraParams),
    smallModelMode: resolveLockedSmallModelMode(mergedExtraParams),
  };
}

/**
 * The system instruction to lock for an init: the conversation's locked snapshot
 * when continuing a restored chat, else the resolved current override for a
 * brand-new one. Mirrors the adapter's resolution so the locked value equals
 * what was sent.
 * @param extraParams - The init's extra params (locked snapshot + current override)
 * @returns The effective system instruction to lock and send
 */
export function resolveLockedSystemInstruction(
  extraParams: Record<string, unknown>,
): string {
  return (
    (extraParams.lockedSystemInstruction as string | null) ??
    resolveSystemInstruction(
      extraParams.systemInstructionOverride as string | undefined,
    )
  );
}

/**
 * The notation to lock and send for an init: the conversation's locked snapshot
 * when continuing a restored chat, else the caller's current notation for a
 * brand-new one. Mirrors the adapter's resolution so the locked value equals
 * what was sent. Null when neither is present — a caller with no notation of its
 * own (voice mode, tests) sends no header and gets the device global, the same
 * contract external MCP clients have.
 * @param extraParams - The init's extra params (locked snapshot + current setting)
 * @returns The effective notation, or null to fall through to the device global
 */
export function resolveLockedNotation(
  extraParams: Record<string, unknown>,
): Notation | null {
  const locked = extraParams.lockedNotation;

  if (isNotation(locked)) return locked;

  return isNotation(extraParams.notation) ? extraParams.notation : null;
}

/**
 * The small-model mode to lock and send for an init: the conversation's locked
 * snapshot when continuing a restored chat, else the current setting for a
 * brand-new one. Mirrors the adapter's resolution so the locked value equals
 * what was sent — the tool schemas and skills variant a restored conversation
 * gets must not flip when the Settings toggle moves under it.
 * @param extraParams - The init's extra params (locked snapshot + current setting)
 * @returns The effective small-model mode
 */
export function resolveLockedSmallModelMode(
  extraParams: Record<string, unknown>,
): boolean {
  const locked = extraParams.lockedSmallModelMode;

  if (typeof locked === "boolean") return locked;

  return Boolean(extraParams.smallModelMode);
}
