// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type IDBPDatabase } from "idb";
import { type ChatMessage, type TokenUsage } from "#webui/chat/sdk/types";
import { STORE_NAME, tryOpenDb } from "#webui/lib/conversation-db-helpers";

export const MAX_CONVERSATIONS = 200;

/** Distinguishes chat (text) from voice transcripts. Older records are treated as "text". */
export type SessionType = "text" | "voice";

/** Full conversation record stored in IndexedDB */
export interface ConversationRecord {
  id: string;
  title: string | null;
  createdAt: number;
  updatedAt: number;
  bookmarked: boolean;
  provider: string | null;
  model: string | null;
  modelLabel: string | null;
  thinking: string | null;
  temperature: number | null;
  showThoughts: boolean | null;
  smallModelMode: boolean | null;
  totalUsage: TokenUsage | null;
  sessionType: SessionType;
  messages: ChatMessage[];
  // RealtimeItem[] for voice records, null for text. Typed as unknown[] so the
  // storage layer stays decoupled from @openai/agents/realtime.
  voiceHistory: unknown[] | null;
}

/** Lightweight summary for list display (no transcript payload) */
export type ConversationSummary = Omit<
  ConversationRecord,
  "messages" | "voiceHistory"
>;

/** Result of enforcing the conversation limit during save */
export interface EnforceLimitResult {
  deletedCount: number;
  /** True when all slots are consumed by bookmarked conversations */
  limitReached: boolean;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

/**
 * Open (or return cached) the conversations database.
 * @returns IndexedDB database instance
 */
export function getConversationDb(): Promise<IDBPDatabase> {
  dbPromise ??= tryOpenDb();

  return dbPromise;
}

/**
 * Save or update a conversation record, enforcing the conversation limit.
 * @param record - The conversation to save
 * @returns Result indicating whether old conversations were deleted
 */
export async function saveConversation(
  record: ConversationRecord,
): Promise<EnforceLimitResult> {
  const result = await enforceConversationLimit(record.id);
  const db = await getConversationDb();

  await db.put(STORE_NAME, record);

  return result;
}

/**
 * Load a single conversation by ID.
 * @param id - Conversation ID
 * @returns The conversation record, or undefined if not found
 */
export async function loadConversation(
  id: string,
): Promise<ConversationRecord | undefined> {
  const db = await getConversationDb();
  const raw = (await db.get(STORE_NAME, id)) as
    | Partial<ConversationRecord>
    | undefined;

  if (!raw) return undefined;

  return normalizeLegacyRecord(raw);
}

/**
 * Delete a conversation by ID.
 * @param id - Conversation ID to delete
 */
export async function deleteConversation(id: string): Promise<void> {
  const db = await getConversationDb();

  await db.delete(STORE_NAME, id);
}

/**
 * Delete all conversations.
 */
export async function deleteAllConversations(): Promise<void> {
  const db = await getConversationDb();

  await db.clear(STORE_NAME);
}

/**
 * Delete all unbookmarked conversations.
 */
export async function deleteUnbookmarkedConversations(): Promise<void> {
  const db = await getConversationDb();
  const all = (await db.getAll(STORE_NAME)) as ConversationRecord[];
  const tx = db.transaction(STORE_NAME, "readwrite");

  for (const record of all) {
    if (!record.bookmarked) void tx.store.delete(record.id);
  }

  await tx.done;
}

/**
 * Rename a conversation.
 * @param id - Conversation ID
 * @param title - New title (null to clear)
 */
export async function renameConversation(
  id: string,
  title: string | null,
): Promise<void> {
  const db = await getConversationDb();
  const record = (await db.get(STORE_NAME, id)) as
    | ConversationRecord
    | undefined;

  if (!record) return;

  record.title = title;
  await db.put(STORE_NAME, record);
}

/**
 * Set the bookmarked state of a conversation.
 * @param id - Conversation ID
 * @param bookmarked - Whether to bookmark
 */
export async function setBookmark(
  id: string,
  bookmarked: boolean,
): Promise<void> {
  const db = await getConversationDb();
  const record = (await db.get(STORE_NAME, id)) as
    | ConversationRecord
    | undefined;

  if (!record) return;

  record.bookmarked = bookmarked;
  await db.put(STORE_NAME, record);
}

/**
 * List all conversations, sorted by updatedAt descending.
 * @returns Array of conversation summaries
 */
export async function listConversations(): Promise<ConversationSummary[]> {
  const db = await getConversationDb();
  const all = (await db.getAll(STORE_NAME)) as Partial<ConversationRecord>[];

  return all
    .map(normalizeLegacyRecord)
    .map(
      ({
        id,
        title,
        createdAt,
        updatedAt,
        bookmarked,
        provider,
        model,
        modelLabel,
        thinking,
        temperature,
        showThoughts,
        smallModelMode,
        totalUsage,
        sessionType,
      }) => ({
        id,
        title,
        createdAt,
        updatedAt,
        bookmarked,
        provider,
        model,
        modelLabel,
        thinking,
        temperature,
        showThoughts,
        smallModelMode,
        totalUsage,
        sessionType,
      }),
    )
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Close the DB connection and reset the cached promise. Used in tests.
 */
export async function resetDbCache(): Promise<void> {
  const cached = dbPromise;

  dbPromise = null;

  if (cached) {
    const db = await cached;

    db.close();
  }
}

// --- Helpers below main exports ---

/**
 * Fill in fields missing from records written by earlier schema versions, so
 * the rest of the code can treat the result as a full {@link ConversationRecord}.
 * @param raw - Raw record from IndexedDB (possibly missing newer fields)
 * @returns Record with all fields populated to current shape
 */
function normalizeLegacyRecord(
  raw: Partial<ConversationRecord>,
): ConversationRecord {
  raw.thinking ??= null;
  raw.temperature ??= null;
  raw.showThoughts ??= null;
  raw.smallModelMode ??= null;
  raw.totalUsage ??= null;
  raw.sessionType ??= "text";
  raw.voiceHistory ??= null;

  return raw as ConversationRecord;
}

/**
 * Enforce the conversation limit by deleting oldest non-bookmarked conversations.
 * @param excludeId - ID of the conversation being saved (excluded from deletion)
 * @returns Result with deletion count and whether the limit is fully consumed by bookmarks
 */
async function enforceConversationLimit(
  excludeId: string,
): Promise<EnforceLimitResult> {
  const db = await getConversationDb();
  const all = (await db.getAll(STORE_NAME)) as ConversationRecord[];

  // The excludeId conversation will be saved after this, so count it
  const existingExcluded = all.some((r) => r.id === excludeId);
  const totalAfterSave = existingExcluded ? all.length : all.length + 1;

  if (totalAfterSave <= MAX_CONVERSATIONS) {
    return { deletedCount: 0, limitReached: false };
  }

  const excess = totalAfterSave - MAX_CONVERSATIONS;
  const deletable = all
    .filter((r) => !r.bookmarked && r.id !== excludeId)
    .sort((a, b) => a.updatedAt - b.updatedAt);

  const toDelete = deletable.slice(0, excess);

  for (const record of toDelete) {
    await db.delete(STORE_NAME, record.id);
  }

  return {
    deletedCount: toDelete.length,
    limitReached: toDelete.length < excess,
  };
}
