// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Delete an IndexedDB database by name, resolving once it is gone.
 *
 * Tests call this from beforeEach to start from a clean database. It only
 * resolves promptly when no connection is still open, since an open connection
 * blocks the delete request.
 * @param name - Name of the database to delete
 */
export async function deleteIndexedDb(name: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
