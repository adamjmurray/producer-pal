// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type IDBPDatabase } from "idb";
import {
  openTrackedDb,
  retiredDbError,
} from "#webui/lib/conversations/open-tracked-db";

/**
 * Image bytes live in their own database, not in `producer-pal-conversations`:
 * that one stays at version 1 so older chat UIs, served from this same origin,
 * still open it. (They reset it on a version error.)
 */
export const IMAGE_DB_NAME = "producer-pal-conversation-images";
const IMAGE_DB_VERSION = 1;

/**
 * Image bytes keyed by content hash, shared by every record that shows them,
 * so an edit/retry fork doesn't store another copy. Records hold
 * `{ mediaType, ref }` instead of the bytes.
 */
export const IMAGE_STORE = "images";

/**
 * When each image was last saved or re-used by a save (ms), keyed like
 * {@link IMAGE_STORE}. A sweep spares recent images, because the save that
 * wrote one may not have written its conversation yet.
 */
export const TOUCHED_STORE = "touched";

let imageDbPromise: Promise<IDBPDatabase> | null = null;

/**
 * Open (or return cached) the image database.
 * @returns IndexedDB database instance
 */
export function getImageDb(): Promise<IDBPDatabase> {
  const retired = retiredDbError();

  if (retired) {
    return Promise.reject(retired);
  }

  if (imageDbPromise == null) {
    const opening = openTrackedDb(IMAGE_DB_NAME, IMAGE_DB_VERSION, (db) => {
      db.createObjectStore(IMAGE_STORE);
      db.createObjectStore(TOUCHED_STORE);
    });

    imageDbPromise = opening;
    // A failed open isn't kept: the next call tries again.
    opening.catch(() => {
      if (imageDbPromise === opening) {
        imageDbPromise = null;
      }
    });
  }

  return imageDbPromise;
}

/**
 * Close the image DB connection and reset the cached promise. Used in tests.
 */
export async function resetImageDbCache(): Promise<void> {
  const cached = imageDbPromise;

  imageDbPromise = null;

  // A failed open has nothing to close.
  const db = await cached?.catch(() => null);

  db?.close();
}
