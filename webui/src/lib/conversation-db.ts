// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { openDB, type IDBPDatabase, type IDBPTransaction } from "idb";
import { type AiSdkMessage } from "#webui/chat/ai-sdk/ai-sdk-types";

const DB_NAME = "producer-pal-conversations";
const DB_VERSION = 3;
const STORE_NAME = "conversations";

/** Full conversation record stored in IndexedDB */
export interface ConversationRecord {
  id: string;
  title: string | null;
  createdAt: number;
  updatedAt: number;
  bookmarked: boolean;
  provider: string | null;
  model: string | null;
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
}

let dbPromise: Promise<IDBPDatabase> | null = null;

/**
 * Open (or return cached) the conversations database.
 * @returns IndexedDB database instance
 */
export function getConversationDb(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, _newVersion, transaction) {
      if (oldVersion < 1) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });

        store.createIndex("updatedAt", "updatedAt");
      }

      if (oldVersion < 2) {
        void migrateToV2(transaction);
      }

      if (oldVersion < 3) {
        void migrateToV3(transaction);
      }
    },
  });

  return dbPromise;
}

/**
 * Save or update a conversation record.
 * @param record - The conversation to save
 */
export async function saveConversation(
  record: ConversationRecord,
): Promise<void> {
  const db = await getConversationDb();

  await db.put(STORE_NAME, record);
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
      ({ id, title, createdAt, updatedAt, bookmarked, provider, model }) => ({
        id,
        title: title ?? null,
        createdAt,
        updatedAt,
        // Pre-v2 records may lack bookmarked field
        bookmarked: (bookmarked as boolean | undefined) ?? false,
        // Pre-v3 records may lack provider/model fields
        provider: (provider as string | null | undefined) ?? null,
        model: (model as string | null | undefined) ?? null,
      }),
    )
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Reset the cached DB promise. Used in tests to ensure a fresh database.
 */
export function resetDbCache(): void {
  dbPromise = null;
}

// --- Helpers below main exports ---

/**
 * Migrate existing records to v2 by adding bookmarked field.
 * @param transaction - The upgrade transaction
 */
/**
 * Migrate existing records to v3 by adding provider and model fields.
 * @param transaction - The upgrade transaction
 */
async function migrateToV3(
  transaction: IDBPTransaction<unknown, string[], "versionchange">,
): Promise<void> {
  const store = transaction.objectStore(STORE_NAME);
  let cursor = await store.openCursor();

  while (cursor) {
    const record = cursor.value as Record<string, unknown>;

    if (record.provider == null) {
      record.provider = null;
      record.model = null;
      await cursor.update(record);
    }

    cursor = await cursor.continue();
  }
}

/**
 * Migrate existing records to v2 by adding bookmarked field.
 * @param transaction - The upgrade transaction
 */
async function migrateToV2(
  transaction: IDBPTransaction<unknown, string[], "versionchange">,
): Promise<void> {
  const store = transaction.objectStore(STORE_NAME);
  let cursor = await store.openCursor();

  while (cursor) {
    const record = cursor.value as Record<string, unknown>;

    if (record.bookmarked == null) {
      record.bookmarked = false;
      await cursor.update(record);
    }

    cursor = await cursor.continue();
  }
}
