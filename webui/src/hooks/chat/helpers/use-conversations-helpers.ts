// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect } from "preact/hooks";
import { type TokenUsage } from "#webui/chat/sdk/types";
import { type TransferNotificationData } from "#webui/components/chat/TransferNotification";
import {
  type ConversationLockedSettings,
  type PendingFork,
} from "#webui/hooks/chat/use-chat-types";
import { getModelName } from "#webui/lib/config";
import { deriveForkParentId } from "#webui/lib/conversation-branch-helpers";
import {
  type ConversationRecord,
  deleteConversation,
  loadConversation,
} from "#webui/lib/conversation-db";
import { type Provider } from "#webui/types/settings";

/** Mutable metadata for the active conversation (excludes ID which is tracked separately) */
export interface ActiveMeta {
  title: string | null;
  createdAt: number | null;
  bookmarked: boolean;
  model: string | null;
  provider: Provider | null;
  thinking: string | null;
  smallModelMode: boolean | null;
  /** Resolved system instruction in effect (snapshotted onto the record). */
  systemInstruction: string | null;
}

export const DEFAULT_META: ActiveMeta = {
  title: null,
  createdAt: null,
  bookmarked: false,
  model: null,
  provider: null,
  thinking: null,
  smallModelMode: null,
  systemInstruction: null,
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
 * Route browser back/forward (hashchange) to the matching conversation: switch
 * to the hashed id, or start a new conversation when the hash clears. Ignores
 * the programmatic hash writes the manager makes itself (guarded by a ref flag).
 * @param params - Navigation dependencies
 * @param params.programmaticHashRef - Flag set when the manager wrote the hash itself
 * @param params.programmaticHashRef.current - The mutable flag value
 * @param params.activeIdRef - Ref holding the current active conversation id
 * @param params.activeIdRef.current - The mutable active-id value
 * @param params.switchConversation - Loads and activates a conversation by id
 * @param params.startNewConversation - Clears state for a brand-new conversation
 */
export function useHashNavigation(params: {
  programmaticHashRef: { current: boolean };
  activeIdRef: { current: string | null };
  switchConversation: (id: string) => Promise<void>;
  startNewConversation: () => void;
}): void {
  const {
    programmaticHashRef,
    activeIdRef,
    switchConversation,
    startNewConversation,
  } = params;

  useEffect(() => {
    const handler = () => {
      if (programmaticHashRef.current) {
        programmaticHashRef.current = false;

        return;
      }

      const hashId = getHashConversationId();

      if (hashId === activeIdRef.current) return;

      if (hashId) {
        void switchConversation(hashId);
      } else {
        void startNewConversation();
      }
    };

    window.addEventListener("hashchange", handler);

    return () => window.removeEventListener("hashchange", handler);
  }, [
    programmaticHashRef,
    activeIdRef,
    switchConversation,
    startNewConversation,
  ]);
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
    smallModelMode: record.smallModelMode,
    systemInstruction: record.systemInstruction ?? null,
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
  // Lock the snapshot at the first save: prefer an already-stored value.
  const systemInstruction =
    existing?.systemInstruction ?? refs.systemInstruction;

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
    smallModelMode: refs.smallModelMode,
    totalUsage: sumMessageUsage(chatHistory),
    sessionType: "text",
    messages: chatHistory as ConversationRecord["messages"],
    voiceHistory: null,
    // Snapshot the system instruction (locked above). Omitted when unknown so a
    // record with no resolved instruction keeps its prior shape.
    ...(systemInstruction != null && { systemInstruction }),
    // Carry branch linkage across updates. A fork's later saves (e.g. the
    // post-response autosave) route through here too; without this they would
    // strip the fields that make it a sibling, so its ‹ n/m › arrows vanish and
    // the list stops collapsing it into its family.
    ...(existing?.forkParentId != null && {
      forkParentId: existing.forkParentId,
    }),
    ...(existing?.forkedAtIndex != null && {
      forkedAtIndex: existing.forkedAtIndex,
    }),
  };
}

/**
 * Build a ConversationRecord for a new branch forked from an earlier turn. It is
 * a fresh record (new id, own createdAt, no inherited title/bookmark) carrying
 * the forked chat history plus the parent-pointer linkage. Conversation settings
 * (model/provider/etc.) are inherited from the active refs.
 * @param refs - Active ref values to inherit settings from
 * @param chatHistory - The forked chat history (shared prefix + the new turn)
 * @param fork - Linkage for the new branch
 * @param fork.newId - Freshly allocated id for the branch record
 * @param fork.parentId - Trunk id the branch attaches to (its `forkParentId`)
 * @param fork.anchorIndex - UI message index the branch arrows sit under
 * @returns Record ready for saveConversation
 */
export function buildForkedRecord(
  refs: ActiveRefs,
  chatHistory: unknown[],
  fork: { newId: string; parentId: string; anchorIndex: number },
): ConversationRecord {
  const base = buildSaveRecord(
    {
      ...refs,
      id: fork.newId,
      createdAt: null,
      title: null,
      bookmarked: false,
    },
    undefined,
    chatHistory,
  );

  return {
    ...base,
    forkParentId: fork.parentId,
    forkedAtIndex: fork.anchorIndex,
  };
}

/**
 * Resolve the record to persist for the current save: a new branch when a fork
 * is pending (and there is a saved source to diverge from), otherwise a normal
 * create/update of the active record.
 * @param args - Save inputs
 * @param args.id - Id to save under (freshly minted for a fork or new chat)
 * @param args.reuseId - The active conversation id, or null for a brand-new chat
 * @param args.fork - Pending fork signal, or null for a normal save
 * @param args.refs - Active refs supplying conversation settings
 * @param args.chatHistory - Current chat history to persist
 * @param args.updatedAt - Explicit updatedAt for a normal save (ignored for forks)
 * @returns The conversation record to save
 */
export async function buildConversationSaveRecord(args: {
  id: string;
  reuseId: string | null;
  fork: PendingFork | null;
  refs: ActiveRefs;
  chatHistory: unknown[];
  updatedAt: number | undefined;
}): Promise<ConversationRecord> {
  const { id, reuseId, fork, refs, chatHistory, updatedAt } = args;

  if (fork != null && reuseId != null) {
    const source = await loadConversation(reuseId);
    const parentId = source
      ? deriveForkParentId(source, fork.anchorIndex)
      : reuseId;

    const forked = buildForkedRecord(refs, chatHistory, {
      newId: id,
      parentId,
      anchorIndex: fork.anchorIndex,
    });

    // A fork shares the trunk's transcript, so it inherits the trunk's
    // system-prompt snapshot rather than re-capturing the current global.
    return source?.systemInstruction != null
      ? { ...forked, systemInstruction: source.systemInstruction }
      : forked;
  }

  const existing = reuseId == null ? undefined : await loadConversation(id);

  return buildSaveRecord(refs, existing, chatHistory, updatedAt);
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
  let cacheReadTokens = 0;

  for (const msg of messages) {
    if (msg.role !== "assistant" || !msg.usage) continue;

    hasUsage = true;
    inputTokens += msg.usage.inputTokens ?? 0;
    outputTokens += msg.usage.outputTokens ?? 0;
    reasoningTokens += msg.usage.reasoningTokens ?? 0;
    cacheReadTokens += msg.usage.cacheReadTokens ?? 0;
  }

  if (!hasUsage) return null;

  return {
    inputTokens,
    outputTokens,
    ...(reasoningTokens > 0 && { reasoningTokens }),
    ...(cacheReadTokens > 0 && { cacheReadTokens }),
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

/**
 * Delete a conversation, first snapshotting the full record so it can be
 * restored via undo — the DB row is gone the moment deletion resolves.
 * @param id - Conversation id to delete
 * @param onSnapshot - Receives the deleted record for undo (skipped if the id
 *   had no record)
 */
export async function deleteConversationWithSnapshot(
  id: string,
  onSnapshot: (record: ConversationRecord) => void,
): Promise<void> {
  const record = await loadConversation(id);

  await deleteConversation(id);

  if (record) onSnapshot(record);
}

/**
 * Pick which banner the conversation panel shows and the matching dismiss
 * handler. Rank by severity first — an error (a save failure / data-loss
 * signal) outranks a warning — then let the fresher undo-delete banner win
 * within the same severity. Severity-first matters because the undo banner
 * never auto-expires, so without it a stale "Deleted …" banner would
 * indefinitely mask a later save-error banner.
 * @param undo - Undo-delete notification state and dismiss handler
 * @param undo.undoNotification - The pending undo banner, or null when none
 * @param undo.dismissUndoNotification - Clears all pending undos
 * @param limit - Limit/save-error notification state and dismiss handler
 * @param limit.limitNotification - The limit/save-error banner, or null
 * @param limit.dismissLimitNotification - Clears the limit/save-error banner
 * @returns The active notification and the handler that dismisses it
 */
export function resolvePanelNotification(
  undo: {
    undoNotification: TransferNotificationData | null;
    dismissUndoNotification: () => void;
  },
  limit: {
    limitNotification: TransferNotificationData | null;
    dismissLimitNotification: () => void;
  },
): {
  notification: TransferNotificationData | null;
  dismissNotification: () => void;
} {
  const undoNote = undo.undoNotification;
  const limitNote = limit.limitNotification;
  // The limit/save-error banner wins when there is no undo to defer to, or when
  // it is an error and the undo banner is merely a warning.
  const limitWins =
    limitNote != null &&
    (undoNote == null ||
      (limitNote.type === "error" && undoNote.type !== "error"));

  if (limitWins) {
    return {
      notification: limitNote,
      dismissNotification: limit.dismissLimitNotification,
    };
  }

  return {
    notification: undoNote ?? limitNote,
    dismissNotification: undoNote
      ? undo.dismissUndoNotification
      : limit.dismissLimitNotification,
  };
}

/**
 * Chain `work` after the ref's current promise and store the new tail, so
 * successive conversation saves run strictly in order. This keeps a later
 * save's read-back from racing ahead of an earlier save's write (which would
 * drop a freshly-forked record's branch linkage).
 * @param ref - Ref holding the in-flight save chain
 * @param ref.current - The current tail promise
 * @param work - Save work to run once prior saves settle
 * @returns The new tail promise
 */
export function chainSave(
  ref: { current: Promise<void> },
  work: () => Promise<void>,
): Promise<void> {
  const next = ref.current.then(work);

  ref.current = next;

  return next;
}
