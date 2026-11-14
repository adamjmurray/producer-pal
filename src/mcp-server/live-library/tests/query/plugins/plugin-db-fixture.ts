// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll } from "vitest";

// [name, vendor, enabled, dev_identifier, module path]
export type PluginSeed = [string, string | null, number, string, string];

/**
 * Build a plug-in database with the plugins and plugin_modules tables.
 *
 * @param dir - Folder to put it in
 * @param seeds - The plug-ins to put in it
 * @param withModules - false leaves out plugin_modules (older Live layouts)
 * @returns The database path
 */
export function buildPluginDb(
  dir: string,
  seeds: PluginSeed[],
  withModules: boolean,
): string {
  const dbPath = join(dir, withModules ? "Live-plugins-1.db" : "Live-old.db");
  const db = new DatabaseSync(dbPath);

  db.exec(
    `CREATE TABLE plugins (name TEXT, vendor TEXT, enabled INTEGER,
       dev_identifier TEXT, module_id INTEGER);
     CREATE TABLE ${withModules ? "plugin_modules" : "other"}
       (module_id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT);`,
  );

  if (withModules) {
    const addModule = db.prepare(
      "INSERT INTO plugin_modules (path) VALUES (?)",
    );
    const addPlugin = db.prepare("INSERT INTO plugins VALUES (?, ?, ?, ?, ?)");
    const ids = new Map<string, number>();

    for (const [name, vendor, enabled, devId, path] of seeds) {
      let id = ids.get(path);

      if (id == null) {
        id = Number(addModule.run(path).lastInsertRowid);
        ids.set(path, id);
      }

      addPlugin.run(name, vendor, enabled, devId, id);
    }
  }

  db.close();

  return dbPath;
}

/**
 * Make a temp folder before a suite's tests and remove it after.
 *
 * @param prefix - Start of the folder's name
 * @returns A function giving the folder's path (valid once the tests run)
 */
export function useTempDir(prefix: string): () => string {
  let dir = "";

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), prefix));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  return () => dir;
}
