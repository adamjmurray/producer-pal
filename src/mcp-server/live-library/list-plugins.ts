// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * List installed audio plugins (VST / VST3 / AU) that Live knows about,
 * read from Live's plugin SQLite database.
 *
 * DB selection (Live version branching):
 *  - Live 12.3+ keeps a separate `Live-plugins-*.db` carrying the plugin
 *    tables. If `findLivePluginsDbPath()` returns a path, query it.
 *  - Live 11 / 12.0–12.1 store the plugin tables INSIDE the main
 *    `Live-files-*.db`. When no separate plugins DB exists we fall back to the
 *    active files DB, but only if it actually carries a `plugins` table — a
 *    table-presence probe is the robust signal (the schema-version row is not
 *    a reliable discriminator across these releases).
 *
 * SCHEMA NOTE: The plugin table name (`plugins`) and column names
 * (`name, vendor, version, scanstate, enabled, dev_identifier`) are taken from
 * the ticket's spike notes, NOT from a live DB capture. They should be verified
 * against a real Live 12.3+ install (and a Live 11 / 12.0–12.1 install for the
 * files-DB fallback). We only SELECT the columns we need so a v1-shaped DB
 * (without the v2 ARA columns `lowest_ara_api_generation` /
 * `highest_ara_api_generation`) works identically — we never name the ARA
 * columns, so their presence or absence is irrelevant.
 *
 * Read-only: SELECT statements only. Never write SQL, never ATTACH.
 */

import { type DatabaseSync } from "node:sqlite";
import {
  clampLibraryLimit,
  DEFAULT_LIBRARY_LIMIT,
  type ListPluginsArgs,
  type ListPluginsResult,
  type PluginCategory,
  type PluginFormat,
  type PluginItem,
} from "./library-types.ts";
import { findLiveFilesDbPath, findLivePluginsDbPath } from "./live-db-path.ts";
import { openLiveDb } from "./live-db.ts";

/** Name of the plugin table in Live's DB (per spike notes — see file header). */
const PLUGINS_TABLE = "plugins";

interface PluginRow {
  name: string;
  vendor: string | null;
  version: string | null;
  // scanstate meaning is uncertain per the spike; selected so a future
  // refinement can use it, but deliberately NOT filtered on.
  scanstate: number | null;
  enabled: number | null;
  dev_identifier: string | null;
}

/**
 * List installed plugins Live knows about, with optional filtering.
 *
 * @param args - Filter parameters (name/vendor substrings, format, category)
 * @returns Result with plugin items, plus dbAvailable flag for graceful
 *   fallback when no plugin source DB is installed.
 */
export async function listPlugins(
  args: ListPluginsArgs = {},
): Promise<ListPluginsResult> {
  const source = await selectPluginDb();

  if (!source) {
    return {
      dbAvailable: false,
      plugins: [],
      reason: "Live plugin database not found",
    };
  }

  const db = openLiveDb(source);

  try {
    // Defensive `enabled = 1` filter: the spike couldn't confirm disabled-plugin
    // semantics, so we only surface plugins Live reports as enabled.
    const rows = db
      .prepare(
        `SELECT name, vendor, version, scanstate, enabled, dev_identifier
         FROM ${PLUGINS_TABLE}
         WHERE enabled = 1
         ORDER BY name COLLATE NOCASE ASC`,
      )
      .all() as unknown as PluginRow[];
    const limit = clampLibraryLimit(args.limit, DEFAULT_LIBRARY_LIMIT);
    const plugins = rows
      .map(buildPluginItem)
      .filter((item) => matchesFilters(item, args))
      .slice(0, limit);

    return { dbAvailable: true, plugins };
  } finally {
    db.close();
  }
}

/**
 * Choose which DB to read plugins from. Prefers a separate
 * `Live-plugins-*.db` (Live 12.3+). Falls back to the active files DB only
 * when it actually carries the `plugins` table (Live 11 / 12.0–12.1).
 *
 * @returns Absolute path to a DB containing plugin tables, or null if none.
 */
async function selectPluginDb(): Promise<string | null> {
  const pluginsDbPath = await findLivePluginsDbPath();

  if (pluginsDbPath != null) {
    return pluginsDbPath;
  }

  const filesDbPath = await findLiveFilesDbPath();

  if (filesDbPath == null) {
    return null;
  }

  // Probe the files DB: only Live 11 / 12.0–12.1 carry the plugin tables here.
  const db = openLiveDb(filesDbPath);

  try {
    return hasPluginTable(db) ? filesDbPath : null;
  } finally {
    db.close();
  }
}

/**
 * Probe whether the given DB has a `plugins` table. The robust signal for
 * deciding whether the files DB carries the plugin tables (vs relying on the
 * schema `version` row, which isn't a reliable discriminator).
 *
 * @param db - Open database handle
 * @returns true if a table named `plugins` exists
 */
function hasPluginTable(db: DatabaseSync): boolean {
  const row = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1",
    )
    .get(PLUGINS_TABLE) as { name: string } | undefined;

  return row != null;
}

/**
 * Build a public PluginItem from a raw row, deriving format and category
 * from the dev_identifier.
 *
 * @param row - Raw plugin row
 * @returns Public PluginItem
 */
function buildPluginItem(row: PluginRow): PluginItem {
  return {
    name: row.name,
    vendor: row.vendor ?? null,
    version: row.version ?? null,
    format: deriveFormat(row.dev_identifier),
    category: deriveCategory(row.dev_identifier),
    dev_identifier: row.dev_identifier ?? null,
  };
}

/**
 * Apply the in-memory filters (name/vendor substring, format, category).
 * Substring matches are case-insensitive.
 *
 * @param item - Candidate plugin
 * @param args - Filter parameters
 * @returns true if the item passes every active filter
 */
function matchesFilters(item: PluginItem, args: ListPluginsArgs): boolean {
  if (args.query && !includesIgnoreCase(item.name, args.query)) {
    return false;
  }

  if (args.vendor && !includesIgnoreCase(item.vendor ?? "", args.vendor)) {
    return false;
  }

  if (args.format && item.format !== args.format) {
    return false;
  }

  if (args.category && item.category !== args.category) {
    return false;
  }

  return true;
}

/**
 * Case-insensitive substring test.
 *
 * @param haystack - String to search within
 * @param needle - Substring to look for
 * @returns true if haystack contains needle (ignoring case)
 */
function includesIgnoreCase(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

/**
 * Derive the plugin format from a `dev_identifier` URI.
 *
 * Documented shape (per spike notes): `device:<format>:<category>:...`, e.g.
 * `device:vst3:instr:Operator` or `device:au:audiofx:...`. We read the second
 * colon-delimited segment and map it to a public format. Parsing is defensive:
 * an unknown/missing scheme yields null rather than throwing.
 *
 * @param devIdentifier - Raw dev_identifier, possibly null
 * @returns Derived PluginFormat, or null when undeterminable
 */
function deriveFormat(devIdentifier: string | null): PluginFormat | null {
  const scheme = schemeSegment(devIdentifier);

  if (scheme === "vst3") {
    return "VST3";
  }

  if (scheme === "vst") {
    return "VST";
  }

  if (scheme === "au") {
    return "AU";
  }

  return null;
}

/**
 * Derive the device category from a `dev_identifier` URI. We look across all
 * colon-delimited segments for a known category token (Live places it after
 * the format segment, e.g. `device:vst3:instr:...`), so this stays robust to
 * the exact position. Returns "instrument" or "audiofx" only when a recognized
 * token is present; an unparseable identifier, a missing scheme, or a scheme
 * with no known category token all yield null (we don't guess a default —
 * NOTE: token vocabulary is unverified against a real Live plugin DB).
 *
 * @param devIdentifier - Raw dev_identifier, possibly null
 * @returns Derived PluginCategory, or null when undeterminable
 */
function deriveCategory(devIdentifier: string | null): PluginCategory | null {
  const scheme = schemeSegment(devIdentifier);

  // Without a recognizable format scheme we can't trust the rest of the URI.
  if (scheme == null) {
    return null;
  }

  const segments = (devIdentifier as string).toLowerCase().split(":");

  // Recognized category tokens. A scheme with none of these yields null rather
  // than a guessed default (see docstring).
  if (segments.some((seg) => seg === "instr" || seg === "instrument")) {
    return "instrument";
  }

  if (
    segments.some(
      (seg) => seg === "audiofx" || seg === "audio_fx" || seg === "fx",
    )
  ) {
    return "audiofx";
  }

  return null;
}

/**
 * Extract and normalize the format scheme segment from a dev_identifier.
 * Expects `device:<scheme>:...`; returns the lowercased `<scheme>` only when
 * the leading `device` segment is present, else null.
 *
 * @param devIdentifier - Raw dev_identifier, possibly null
 * @returns Lowercased scheme segment, or null
 */
function schemeSegment(devIdentifier: string | null): string | null {
  if (devIdentifier == null) {
    return null;
  }

  const segments = devIdentifier.toLowerCase().split(":");

  if (segments[0] !== "device") {
    return null;
  }

  const scheme = segments[1];

  return scheme != null && scheme.length > 0 ? scheme : null;
}
