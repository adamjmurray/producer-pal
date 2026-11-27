// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type DatabaseSync } from "node:sqlite";

/**
 * SQL that leaves out plug-ins whose folder is switched off in Live's Plug-Ins
 * settings. Live keeps those rows with `plugins.enabled = 1` and records the
 * switch per file in `plugin_domains`, so a plug-in counts when its file has an
 * enabled domain, or none at all.
 *
 * @param db - The open plug-in database
 * @param alias - The query's name for the `plugins` table
 * @returns An `AND ...` clause, or "" when the database has no `plugin_domains`
 *   table (older Live)
 */
export function pluginFolderFilter(db: DatabaseSync, alias: string): string {
  const hasDomains = db
    .prepare(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'plugin_domains'",
    )
    .get();

  if (hasDomains == null) {
    return "";
  }

  const ofModule = `SELECT 1 FROM plugin_domains d WHERE d.module_id = ${alias}.module_id`;

  return `AND (NOT EXISTS (${ofModule}) OR EXISTS (${ofModule} AND d.enabled = 1))`;
}
