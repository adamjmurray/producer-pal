// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { openDB, type IDBPDatabase } from "idb";

/** Set once a newer Producer Pal needs a DB and this tab has stepped aside. */
let retired = false;

/** Every connection this tab holds, so stepping aside lets go of all of them. */
const connections = new Set<IDBPDatabase>();

/**
 * The error to throw when this tab gave up its connections for a newer build.
 * @returns The error, or undefined while the connections are usable
 */
export function retiredDbError(): Error | undefined {
  return retired
    ? new Error("Producer Pal was updated in another tab — reload this one")
    : undefined;
}

/**
 * Forget that this tab stepped aside. Used in tests.
 */
export function resetDbRetired(): void {
  retired = false;
  connections.clear();
}

/**
 * Open one of the chat UI's databases with the cross-tab handling they share.
 * `version` undefined opens whatever version exists.
 * @param name - Database name
 * @param version - Version to open at
 * @param upgrade - Creates what the version needs
 * @returns The open connection
 */
export async function openTrackedDb(
  name: string,
  version: number | undefined,
  upgrade?: (db: IDBPDatabase) => void,
): Promise<IDBPDatabase> {
  const db = await openDB(name, version, {
    upgrade,
    // A tab still open on the old version holds the upgrade until it closes.
    blocked() {
      alert("Close other Producer Pal tabs to finish updating.");
    },
    // Step aside for a newer build, and never reopen: that offers a data wipe.
    blocking(_current, _blocked, event) {
      (event.target as IDBDatabase).close();
      retireConnections();
      alert("Producer Pal was updated in another tab. Reload this one.");
    },
  });

  connections.add(db);

  return db;
}

/**
 * Stop this tab using the databases. The newer build can't upgrade one while
 * any connection to it stays open, and both may be changing.
 */
function retireConnections(): void {
  retired = true;

  for (const db of connections) {
    db.close();
  }

  connections.clear();
}
