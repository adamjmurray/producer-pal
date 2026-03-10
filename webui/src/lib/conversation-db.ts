// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type IDBPDatabase } from "idb";
import { type AiSdkMessage } from "#webui/chat/ai-sdk/ai-sdk-types";
import { STORE_NAME, tryOpenDb } from "#webui/lib/conversation-db-helpers";

export const MAX_CONVERSATIONS = 200;

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
  messages: AiSdkMessage[];
}

/** Lightweight summary for list display (no messages) */
export interface ConversationSummary {
  id: string;
  title: string | null;
  createdAt: number;
  updatedAt: number;
  bookmarked: boolean;
  provider: string | null;
  model: string | null;
  modelLabel: string | null;
}

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

  return await (db.get(STORE_NAME, id) as Promise<
    ConversationRecord | undefined
  >);
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
 * List all conversations. Bookmarked first, then by createdAt descending.
 * @returns Array of conversation summaries
 */
export async function listConversations(): Promise<ConversationSummary[]> {
  const db = await getConversationDb();
  const all = (await db.getAll(STORE_NAME)) as ConversationRecord[];

  return all
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
      }) => ({
        id,
        title,
        createdAt,
        updatedAt,
        bookmarked,
        provider,
        model,
        modelLabel,
      }),
    )
    .sort((a, b) => b.createdAt - a.createdAt);
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
