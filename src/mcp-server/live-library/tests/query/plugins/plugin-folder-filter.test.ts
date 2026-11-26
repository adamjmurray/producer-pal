// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { pluginFolderFilter } from "../../../query/plugins/plugin-folder-filter.ts";

// [plug-in name, module id]
const PLUGINS: [string, number][] = [
  ["System Only", 1],
  ["Custom Only", 2],
  ["Both Folders", 3],
  ["No Domain", 4],
];

// [domain, module id, enabled]: the system folders are off, the custom one on.
const DOMAINS: [string, number, number][] = [
  ["global", 1, 0],
  ["custom", 2, 1],
  ["global", 3, 0],
  ["custom", 3, 1],
];

function openDb(withDomains: boolean): DatabaseSync {
  const db = new DatabaseSync(":memory:");

  db.exec("CREATE TABLE plugins (name TEXT, module_id INTEGER)");

  const addPlugin = db.prepare("INSERT INTO plugins VALUES (?, ?)");

  for (const row of PLUGINS) {
    addPlugin.run(...row);
  }

  if (withDomains) {
    db.exec(
      "CREATE TABLE plugin_domains (id TEXT, module_id INTEGER, enabled INTEGER)",
    );

    const addDomain = db.prepare("INSERT INTO plugin_domains VALUES (?, ?, ?)");

    for (const row of DOMAINS) {
      addDomain.run(...row);
    }
  }

  return db;
}

function names(db: DatabaseSync): unknown[] {
  return db
    .prepare(
      `SELECT p.name FROM plugins p WHERE 1 = 1 ${pluginFolderFilter(db, "p")}
       ORDER BY p.rowid`,
    )
    .all()
    .map((row) => row.name);
}

describe("pluginFolderFilter", () => {
  it("leaves out a plug-in found only in a folder that is switched off", () => {
    const db = openDb(true);

    expect(names(db)).toStrictEqual([
      "Custom Only",
      "Both Folders",
      "No Domain",
    ]);
    db.close();
  });

  it("filters nothing when the database has no plugin_domains table", () => {
    const db = openDb(false);

    expect(pluginFolderFilter(db, "p")).toBe("");
    expect(names(db)).toHaveLength(PLUGINS.length);
    db.close();
  });
});
