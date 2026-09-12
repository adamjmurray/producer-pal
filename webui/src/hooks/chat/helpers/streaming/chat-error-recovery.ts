// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type ChatImage } from "#webui/chat/sdk/types";
import {
  type ChatAdapter,
  type ChatClient,
  type PendingForkRef,
} from "#webui/hooks/chat/use-chat-types";
import { type UIMessage } from "#webui/types/messages";

/**
 * Show error when API key is not configured, against the conversation the
 * message was sent from. With no client yet, the message is stashed onto that
 * conversation so retry/edit — and the next send, which bootstraps a client from
 * the stash — pick up where the user left off.
 * @param adapter - Chat adapter for formatting
 * @param userMessage - The user's message text
 * @param setMessages - State setter for messages
 * @param clientRef - Ref to the live chat client, or null before one is built
 * @param clientRef.current - The live client, whose history wins when it exists
 * @param pendingHistoryRef - Ref holding the restored-but-not-yet-sent history
 * @param pendingHistoryRef.current - That history, extended by this function
 * @param images - Images attached to the message, kept for the retry
 */
export function showMissingApiKeyError<
  TClient extends ChatClient<TMessage>,
  TMessage,
  TConfig,
>(
  adapter: ChatAdapter<TClient, TMessage, TConfig>,
  userMessage: string,
  setMessages: (msgs: UIMessage[]) => void,
  clientRef: { current: TClient | null },
  pendingHistoryRef: { current: TMessage[] | null },
  images?: ChatImage[],
): void {
  const entry = adapter.createUserMessage(userMessage, images);
  // Keep the conversation this message was sent from. Showing (and stashing)
  // the message alone truncated a restored conversation to it, and the next
  // send bootstrapped a client from that truncation and saved it over the
  // record. Copy the base: createErrorMessage pushes onto the array it is
  // given, and nothing was sent, so the live client's history must not grow.
  const base =
    clientRef.current?.chatHistory ?? pendingHistoryRef.current ?? [];
  const history = [...base, entry];

  // Only when no client exists: a client owns the history once it has one, so
  // the stash would be a stale duplicate. The error rides along, as in
  // recoverFromChatError — it is skipped when building model messages.
  if (!clientRef.current) {
    pendingHistoryRef.current = history;
  }

  setMessages(
    adapter.createErrorMessage(
      new Error("No API key configured. Please add your API key in Settings."),
      history,
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
  // the array, and a failed fork (which stashes nothing) must leave
  // pendingHistoryRef untouched for a later send to bootstrap from.
  const baseHistory =
    clientRef.current?.chatHistory ??
    (pendingHistoryRef.current ? [...pendingHistoryRef.current] : []);
  // When init fails before client.sendMessage, the user message never reached
  // chatHistory. Surface it in the error UI and stash it for retry/edit so the
  // user isn't stranded if there's no usable client.
  const includeStashed = stashed && !baseHistory.includes(stashed);
  const errorHistory = includeStashed ? [...baseHistory, stashed] : baseHistory;

  if (!clientRef.current && includeStashed) {
    // Keep the conversation the message was sent from. Stashing the message
    // alone truncated a restored conversation to it, and the autosave that
    // follows the failed turn wrote that truncation over the saved record.
    // errorHistory picks up the error below, matching what the client branch
    // persists.
    pendingHistoryRef.current = errorHistory;
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
