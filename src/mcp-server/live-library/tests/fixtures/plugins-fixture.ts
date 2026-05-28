// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Fixtures for Live plugin-DB tests.
 *
 * Builds SQLite files matching the plugin table shape verified against a real
 * Live 12.3 install (a `plugins` table with name, vendor, version, scanstate,
 * enabled, subcategories, dev_identifier). Three flavors:
 *  - separate `Live-plugins-NNNN.db` (Live 12.3+), v1 (no ARA cols) and v2
 *    (with the two ARA columns) shapes;
 *  - a `Live-files-NNNN.db` that ALSO carries the plugins table inline
 *    (Live 11 / 12.0–12.1 fallback path).
 *
 * SCHEMA NOTE: column/table names verified against a real Live 12.3 install
 * (see list-plugins.ts header).
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export interface PluginsFixture {
  dir: string;
  dbPath: string;
  cleanup: () => void;
}

/** Whether to include the v2-only ARA columns in the plugins table. */
export type PluginsSchema = "v1" | "v2";

interface PluginSeed {
  name: string;
  vendor: string | null;
  version: string | null;
  scanstate: number | null;
  enabled: number;
  subcategories: string | null;
  dev_identifier: string | null;
}

/**
 * Default synthetic plugin set covering every format + category, an
 * unparseable dev_identifier, a disabled row, and varied vendors/versions.
 */
const DEFAULT_PLUGINS: PluginSeed[] = [
  {
    name: "Massive",
    vendor: "Native Instruments",
    version: "1.5.0",
    scanstate: 2,
    enabled: 1,
    // multi-segment → leading category token dropped, rest kept
    subcategories: "Instrument|Synth|Bass",
    dev_identifier: "device:vst3:instr:Massive",
  },
  {
    name: "FabFilter Pro-Q 3",
    vendor: "FabFilter",
    version: "3.2",
    scanstate: 2,
    enabled: 1,
    subcategories: "Fx|EQ",
    dev_identifier: "device:vst3:audiofx:ProQ3",
  },
  {
    name: "Serum",
    vendor: "Xfer Records",
    version: "1.3.6",
    scanstate: 2,
    enabled: 1,
    // empty subcategories (typical of VST2-format rows) → []
    subcategories: "",
    dev_identifier: "device:vst:instr:Serum",
  },
  {
    name: "ValhallaRoom",
    vendor: "Valhalla DSP",
    version: "1.6.1",
    scanstate: 2,
    enabled: 1,
    subcategories: "Fx|Reverb",
    dev_identifier: "device:au:audiofx:ValhallaRoom",
  },
  {
    // dev_identifier we can't parse → format/category should be null
    name: "Mystery Box",
    vendor: "Unknown Co",
    version: null,
    scanstate: null,
    enabled: 1,
    // null subcategories → []
    subcategories: null,
    dev_identifier: "garbage-no-scheme",
  },
  {
    // disabled → must be excluded
    name: "Old Reverb",
    vendor: "Legacy Audio",
    version: "0.9",
    scanstate: 2,
    enabled: 0,
    subcategories: "Fx|Reverb",
    dev_identifier: "device:vst3:audiofx:OldReverb",
  },
];

/**
 * Create a temp separate `Live-plugins-NNNN.db` with the synthetic plugin set.
 *
 * @param schema - v1 (no ARA cols) or v2 (with ARA cols)
 * @param plugins - Plugin rows to seed (defaults to DEFAULT_PLUGINS)
 * @returns Fixture handle with the DB path and a cleanup function.
 */
export function createPluginsDbFixture(
  schema: PluginsSchema = "v2",
  plugins: PluginSeed[] = DEFAULT_PLUGINS,
): PluginsFixture {
  const dir = mkdtempSync(join(tmpdir(), "ppal-plugins-fixture-"));
  const dbPath = join(dir, "Live-plugins-12300.db");
  const db = new DatabaseSync(dbPath);

  db.exec(createPluginsTableSql(schema));
  insertPlugins(db, schema, plugins);
  db.close();

  return {
    dir,
    dbPath,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

/**
 * Create a temp `Live-files-NNNN.db` that carries the plugins table inline,
 * modeling the Live 11 / 12.0–12.1 layout where there's no separate plugins DB.
 *
 * @param plugins - Plugin rows to seed (defaults to DEFAULT_PLUGINS)
 * @returns Fixture handle with the DB path and a cleanup function.
 */
export function createFilesDbWithPluginsFixture(
  plugins: PluginSeed[] = DEFAULT_PLUGINS,
): PluginsFixture {
  const dir = mkdtempSync(join(tmpdir(), "ppal-files-plugins-fixture-"));
  const dbPath = join(dir, "Live-files-11000.db");
  const db = new DatabaseSync(dbPath);

  // A token `files` table so it looks like a real files DB, plus the plugins
  // table inline (v1 shape — older Live predates the v2 ARA columns).
  db.exec("CREATE TABLE files (file_id INTEGER PRIMARY KEY, name TEXT);");
  db.exec(createPluginsTableSql("v1"));
  insertPlugins(db, "v1", plugins);
  db.close();

  return {
    dir,
    dbPath,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

/**
 * Create a temp `Live-files-NNNN.db` with NO plugins table — models a modern
 * files DB whose plugins were split out into a separate DB.
 *
 * @returns Fixture handle with the DB path and a cleanup function.
 */
export function createFilesDbWithoutPluginsFixture(): PluginsFixture {
  const dir = mkdtempSync(join(tmpdir(), "ppal-files-noplugins-fixture-"));
  const dbPath = join(dir, "Live-files-12300.db");
  const db = new DatabaseSync(dbPath);

  db.exec("CREATE TABLE files (file_id INTEGER PRIMARY KEY, name TEXT);");
  db.close();

  return {
    dir,
    dbPath,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

/**
 * Build the CREATE TABLE statement for the plugins table.
 *
 * @param schema - v1 omits the ARA columns; v2 includes them
 * @returns SQL string creating the plugins table
 */
function createPluginsTableSql(schema: PluginsSchema): string {
  const araColumns =
    schema === "v2"
      ? `,
      lowest_ara_api_generation INTEGER,
      highest_ara_api_generation INTEGER`
      : "";

  return `
    CREATE TABLE plugins (
      name TEXT,
      vendor TEXT,
      version TEXT,
      scanstate INTEGER,
      enabled INTEGER,
      subcategories TEXT,
      dev_identifier TEXT${araColumns}
    );
  `;
}

/**
 * Insert plugin rows. For v2 the ARA columns are populated so the SELECT (which
 * never names them) is verified to coexist with extra columns.
 *
 * @param db - Open writable DB
 * @param schema - Controls whether ARA columns are written
 * @param plugins - Rows to insert
 */
function insertPlugins(
  db: DatabaseSync,
  schema: PluginsSchema,
  plugins: PluginSeed[],
): void {
  const insert =
    schema === "v2"
      ? db.prepare(
          `INSERT INTO plugins
           (name, vendor, version, scanstate, enabled, subcategories,
            dev_identifier,
            lowest_ara_api_generation, highest_ara_api_generation)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
      : db.prepare(
          `INSERT INTO plugins
           (name, vendor, version, scanstate, enabled, subcategories,
            dev_identifier)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        );

  for (const p of plugins) {
    if (schema === "v2") {
      insert.run(
        p.name,
        p.vendor,
        p.version,
        p.scanstate,
        p.enabled,
        p.subcategories,
        p.dev_identifier,
        1,
        2,
      );
    } else {
      insert.run(
        p.name,
        p.vendor,
        p.version,
        p.scanstate,
        p.enabled,
        p.subcategories,
        p.dev_identifier,
      );
    }
  }
}
