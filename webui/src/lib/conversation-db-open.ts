// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type IDBPDatabase } from "idb";
import { type ChatMessage } from "#webui/chat/sdk/types";
import { loadConversationImages } from "#webui/lib/conversations/conversation-images";
import { openTrackedDb } from "#webui/lib/conversations/open-tracked-db";
import { migrateLegacyImages } from "#webui/lib/conversations/legacy-image-migration";
import { downloadTextFile } from "#webui/utils/text-file-io";

const DB_NAME = "producer-pal-conversations";

/**
 * Never bump this casually. Every chat UI is served from one origin, and a Live
 * Set can still hold an older device: on a version it doesn't know it offers to
 * delete all history. Images live in their own database for that reason.
 */
const DB_VERSION = 1;

/**
 * Pre-release builds bumped the database to 2 to add an image store. It can't
 * be downgraded, so this version is opened as is. A real bump must skip it.
 */
const LEGACY_DB_VERSION = 2;

export const STORE_NAME = "conversations";

/**
 * Try to open the DB, handling version mismatch from downgrades, and move any
 * images a pre-release build left in it to the image database.
 * @returns IndexedDB database instance
 */
export async function tryOpenDb(): Promise<IDBPDatabase> {
  let db: IDBPDatabase;

  try {
    db = await openDb();
  } catch (err) {
    if (!isVersionError(err)) {
      throw err;
    }

    // A fresh database has nothing to migrate.
    return await handleVersionMismatch();
  }

  try {
    await migrateLegacyImages(db);
  } catch (err) {
    // Nothing caches this connection, so nothing else would close it.
    db.close();
    throw err;
  }

  return db;
}

/**
 * Open the conversations database at the expected version, or at the
 * pre-release version a build of this one may have left. Never raises it.
 * @returns IndexedDB database instance
 */
async function openDb(): Promise<IDBPDatabase> {
  const db = await openAtKnownVersion();

  if (db.objectStoreNames.contains(STORE_NAME)) {
    return db;
  }

  // An empty database (no stores) holds nothing to lose. Recreate it at
  // DB_VERSION rather than upgrading: no code path may raise the version.
  db.close();
  await deleteDb(DB_NAME);

  return await openTrackedDb(DB_NAME, DB_VERSION, createConversationStore);
}

/**
 * Open at {@link DB_VERSION}, falling back to {@link LEGACY_DB_VERSION}.
 * @returns IndexedDB database instance
 */
async function openAtKnownVersion(): Promise<IDBPDatabase> {
  try {
    return await openTrackedDb(DB_NAME, DB_VERSION, createConversationStore);
  } catch (err) {
    if (!isVersionError(err)) {
      throw err;
    }

    const db = await openTrackedDb(DB_NAME, undefined);

    if (db.version === LEGACY_DB_VERSION) {
      return db;
    }

    db.close();
    throw err;
  }
}

/**
 * Whether an open failed because the DB is at a newer version.
 * @param err - The error thrown
 * @returns True for a version error
 */
function isVersionError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "VersionError";
}

/**
 * Create the conversations store. Run only when the database is created.
 * @param db - The database being upgraded
 */
function createConversationStore(db: IDBPDatabase): void {
  db.createObjectStore(STORE_NAME, { keyPath: "id" }).createIndex(
    "updatedAt",
    "updatedAt",
  );
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
    const all = await withImages(await getAllFromRawDb(db));
    const json = JSON.stringify(
      {
        version: 1,
        exportedAt: new Date().toISOString(),
        conversations: all,
      },
      null,
      2,
    );

    downloadTextFile(
      `producer-pal-conversations-${new Date().toISOString().slice(0, 10)}.json`,
      json,
      "application/json",
    );
  } finally {
    db.close();
  }
}

/**
 * Put image bytes back into the records, so the backup stands alone. Without
 * them the backup is still worth having, so a failure here only drops images.
 * @param records - Raw records from the mismatched DB
 * @returns The records with inline images, or as they were
 */
async function withImages(records: unknown[]): Promise<unknown[]> {
  try {
    const full: unknown[] = [];

    for (const record of records) {
      full.push(
        await loadConversationImages(record as { messages: ChatMessage[] }),
      );
    }

    return full;
  } catch {
    return records;
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
  const request = indexedDB.deleteDatabase(name);

  // The delete waits for other tabs' connections to close.
  request.onblocked = () => {
    alert("Close other Producer Pal tabs to finish updating.");
  };

  await wrapIdbRequest(request);
}

/**
 * Wrap a raw IDBRequest in a Promise.
 * @param request - The IDB request to wrap
 * @returns Promise resolving with the request result
 */
function wrapIdbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    /* v8 ignore start -- IDB onerror callback: untestable with fake-indexeddb */
    request.onerror = () => reject(request.error);
    /* v8 ignore stop */
  });
}
