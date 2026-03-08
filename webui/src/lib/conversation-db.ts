// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { openDB, type IDBPDatabase } from "idb";
import { type AiSdkMessage } from "#webui/chat/ai-sdk/ai-sdk-types";

const DB_NAME = "producer-pal-conversations";
const DB_VERSION = 1;
const STORE_NAME = "conversations";

/** Full conversation record stored in IndexedDB */
export interface ConversationRecord {
  id: string;
  createdAt: number;
  updatedAt: number;
  messages: AiSdkMessage[];
}

/** Lightweight summary for list display (no messages) */
export interface ConversationSummary {
  id: string;
  createdAt: number;
  updatedAt: number;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

/**
 * Open (or return cached) the conversations database.
 * @returns IndexedDB database instance
 */
export function getConversationDb(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });

      store.createIndex("updatedAt", "updatedAt");
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
 * List all conversations sorted by createdAt descending (newest first).
 * @returns Array of conversation summaries
 */
export async function listConversations(): Promise<ConversationSummary[]> {
  const db = await getConversationDb();
  const all = (await db.getAll(STORE_NAME)) as ConversationRecord[];

  return all
    .map(({ id, createdAt, updatedAt }) => ({ id, createdAt, updatedAt }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Reset the cached DB promise. Used in tests to ensure a fresh database.
 */
export function resetDbCache(): void {
  dbPromise = null;
}
