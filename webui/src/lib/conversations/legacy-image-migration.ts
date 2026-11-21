// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type IDBPDatabase } from "idb";
import {
  IMAGE_STORE,
  TOUCHED_STORE,
  getImageDb,
} from "#webui/lib/conversations/image-db";

/**
 * Pre-release builds kept images in the conversations database itself, bumped
 * to version 2. A database can't be downgraded, so such a database keeps its
 * version and its now-unused store.
 */
const LEGACY_IMAGE_STORE = "images";

/** Images moved per transaction, so a big history isn't held in memory at once. */
const BATCH_SIZE = 20;

/**
 * Move the images in the conversations database's old image store to the image
 * database. Safe to re-run, and to run in two tabs at once: an image leaves the
 * old store only after its copy is committed, and copying the same key twice
 * writes the same bytes. If a copy fails this throws and nothing is deleted,
 * so the next open tries again.
 * @param conversationsDb - The open conversations database
 */
export async function migrateLegacyImages(
  conversationsDb: IDBPDatabase,
): Promise<void> {
  if (!conversationsDb.objectStoreNames.contains(LEGACY_IMAGE_STORE)) {
    return;
  }

  const keys = await conversationsDb.getAllKeys(LEGACY_IMAGE_STORE);

  for (let i = 0; i < keys.length; i += BATCH_SIZE) {
    const batch = keys.slice(i, i + BATCH_SIZE) as string[];
    const copied = await copyToImageDb(conversationsDb, batch);

    const tx = conversationsDb.transaction(LEGACY_IMAGE_STORE, "readwrite");

    for (const key of copied) {
      void tx.store.delete(key);
    }

    await tx.done;
  }
}

/**
 * Copy one batch of images across, waiting for the write to commit.
 * @param conversationsDb - The open conversations database
 * @param keys - Image keys to copy
 * @returns The keys now safe in the image database
 */
async function copyToImageDb(
  conversationsDb: IDBPDatabase,
  keys: string[],
): Promise<string[]> {
  const read = conversationsDb.transaction(LEGACY_IMAGE_STORE, "readonly");
  const found: Array<[string, unknown]> = [];

  for (const key of keys) {
    const data = await read.store.get(key);

    // Gone: another tab moved it already.
    if (data != null) {
      found.push([key, data]);
    }
  }

  const imageDb = await getImageDb();
  const write = imageDb.transaction([IMAGE_STORE, TOUCHED_STORE], "readwrite");
  const now = Date.now();

  for (const [key, data] of found) {
    void write.objectStore(IMAGE_STORE).put(data, key);
    void write.objectStore(TOUCHED_STORE).put(now, key);
  }

  await write.done;

  return found.map(([key]) => key);
}
