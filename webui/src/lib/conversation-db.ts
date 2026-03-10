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
 * Try to open the DB, handling version mismatch from downgrades.
 * @returns IndexedDB database instance
 */
async function tryOpenDb(): Promise<IDBPDatabase> {
  try {
    return await openDb();
  } catch (err) {
    if (err instanceof DOMException && err.name === "VersionError") {
      return await handleVersionMismatch();
    }

    /* v8 ignore next */
    throw err;
  }
}

/**
 * Open the conversations database at the expected version.
 * @returns IndexedDB database instance
 */
function openDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });

      store.createIndex("updatedAt", "updatedAt");
    },
  });
}

/**
 * Handle a version mismatch by offering export and reset.
 * @returns Fresh IndexedDB database instance after reset
 */
async function handleVersionMismatch(): Promise<IDBPDatabase> {
  if (confirm("Export a backup of your conversations before resetting?")) {
    await exportFromMismatchedDb();
  }

  const deleteConfirmed = confirm(
    "Delete all conversation history and reset the database? " +
      "This cannot be undone. Cancel will keep your data, but conversations " +
      "will not be saved until you upgrade Producer Pal.",
  );

  if (!deleteConfirmed) {
    throw new Error("Database version mismatch — upgrade Producer Pal");
  }

  await deleteDb(DB_NAME);

  return await openDb();
}

/**
 * Open the mismatched DB without a version to read and export its data.
 */
async function exportFromMismatchedDb(): Promise<void> {
  const db = await openDbVersionless();

  try {
    const all = await getAllFromRawDb(db);
    const json = JSON.stringify(
      {
        version: 1,
        exportedAt: new Date().toISOString(),
        conversations: all,
      },
      null,
      2,
    );

    downloadJson(
      json,
      `producer-pal-conversations-${new Date().toISOString().slice(0, 10)}.json`,
    );
  } finally {
    db.close();
  }
}

/**
 * Open the DB at its current version without triggering an upgrade.
 * @returns Raw IDBDatabase at whatever version exists
 */
function openDbVersionless(): Promise<IDBDatabase> {
  return wrapIdbRequest(indexedDB.open(DB_NAME));
}

/**
 * Read all records from a raw IDBDatabase (not the idb wrapper).
 * @param db - Raw IDBDatabase instance
 * @returns All conversation records
 */
function getAllFromRawDb(db: IDBDatabase): Promise<unknown[]> {
  const tx = db.transaction(STORE_NAME, "readonly");

  return wrapIdbRequest(tx.objectStore(STORE_NAME).getAll());
}

/**
 * Delete an IndexedDB database by name.
 * @param name - Database name to delete
 */
async function deleteDb(name: string): Promise<void> {
  await wrapIdbRequest(indexedDB.deleteDatabase(name));
}

/**
 * Wrap a raw IDBRequest in a Promise.
 * @param request - The IDB request to wrap
 * @returns Promise resolving with the request result
 */
function wrapIdbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    /* v8 ignore next */
    request.onerror = () => reject(request.error);
  });
}

/**
 * Trigger a JSON file download in the browser.
 * @param json - JSON string content
 * @param filename - Download filename
 */
function downloadJson(json: string, filename: string): void {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
