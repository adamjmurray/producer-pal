// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Shared types for Live library queries (ppal-library tool routes).
 */

/**
 * Default item cap for library.search and the tool layer. Lower than
 * the prior ppal-context.search-samples default (100): the modern tool
 * returns richer per-item payloads (tags, source, kind), so 50 keeps
 * the typical response token-budget-friendly.
 */
export const DEFAULT_LIBRARY_LIMIT = 50;

/** Default item cap for library.listTags (tag names are short, so we can
 * afford a wider window than for full search rows). */
export const DEFAULT_LIST_TAGS_LIMIT = 200;

/** Upper bound on `limit` for library queries. */
export const MAX_LIBRARY_LIMIT = 1_000;

/**
 * Clamp a requested limit to safe positive-integer bounds. Shared by
 * library.search, library.listTags, and the tool layer so all three
 * apply the same coercion semantics (non-finite/non-positive → default,
 * cap at MAX_LIBRARY_LIMIT, floor fractional values).
 *
 * @param requested - User-supplied limit
 * @param defaultLimit - Fallback when requested is missing/invalid
 * @returns Integer between 1 and MAX_LIBRARY_LIMIT
 */
export function clampLibraryLimit(
  requested: number | undefined,
  defaultLimit: number,
): number {
  if (requested == null || !Number.isFinite(requested) || requested <= 0) {
    return defaultLimit;
  }

  return Math.min(Math.floor(requested), MAX_LIBRARY_LIMIT);
}

/** Content kinds supported by `library.search` and the ppal-library tool */
export type LibraryKind =
  | "audio"
  | "midi"
  | "live-clip"
  | "preset"
  | "device-group"
  | "m4l-device"
  | "live-set"
  | "plugin"
  | "image"
  | "video"
  | "folder";

/** Device classification — narrows preset/plugin/device results */
export type LibraryDeviceKind = "instrument" | "audiofx" | "midifx";

/**
 * Where in Live's library a file lives. Mostly collapses Live's
 * `folder_kind` integers; "sampleFolder" is the special case for files
 * found via the user-configured custom sample folder (V8 filesystem
 * scan, not in Live's DB).
 */
export type LibrarySource =
  | "sampleFolder"
  | "user"
  | "pack"
  | "builtin"
  | "cloud"
  | "plugin";

/** Sort order for search results */
export type LibrarySort = "use_count" | "mod_date" | "name";

export interface LibrarySearchArgs {
  query?: string;
  /** Comma-separated tag names; results must match ALL listed tags */
  tags?: string;
  kind?: LibraryKind;
  deviceKind?: LibraryDeviceKind;
  source?: LibrarySource;
  /** Absolute folder path; restrict results to immediate children of that folder */
  inFolder?: string;
  sort?: LibrarySort;
  limit?: number;
  /**
   * When true, stat each result's reconstructed path and report whether the
   * file still exists on disk via LibraryItem.pathExists. Off by default
   * (adds one filesystem check per result).
   */
  verifyPaths?: boolean;
}

export interface LibraryItem {
  /** Filename only */
  name: string;
  /** Absolute filesystem path (forward-slash style on both POSIX and Windows) */
  path: string;
  /** Resolved content kind, or null if file_type didn't map to a known kind */
  kind: LibraryKind | null;
  /** Tag names attached to this file */
  tags: string[];
  /** Live's persistent usage counter */
  useCount: number;
  /** Resolved source category, or null if folder_kind was unrecognized */
  source: LibrarySource | null;
  /**
   * Immediate parent folder's display name (e.g. "One Shots", "IR Library").
   * Lets the caller self-filter Live's noisy tagging — a "Closed Hihat"-tagged
   * file under "IR Library" probably isn't a hihat. Omitted for files at the
   * filesystem root, which have no parent folder.
   */
  folder?: string;
  /**
   * Present when `path` is missing leading segments because the parent
   * chain exceeded the reconstruction depth cap. Omitted otherwise.
   */
  pathTruncated?: true;
  /**
   * Whether `path` currently exists on disk. Only present when the request
   * set verifyPaths. Lets the caller skip stale entries (moved Packs, deleted
   * samples, disconnected drives) before passing a path to another tool.
   * Omitted for truncated paths, which can't be verified.
   */
  pathExists?: boolean;
}

/**
 * Advisory that the served DB snapshot may be stale.
 *
 * We open Live's DB with `immutable=1`, which ignores the WAL sidecar. When a
 * `-wal` persists with an mtime newer than the committed `.db` (typical after
 * an unclean Live exit), the immutable read serves the last-checkpoint
 * snapshot — missing whatever the WAL holds. This payload quantifies the gap.
 */
export interface StalenessRisk {
  kind: "wal-pending";
  /** Committed `.db` modification time (epoch ms). */
  dbMtime: number;
  /** `-wal` sidecar modification time (epoch ms). */
  walMtime: number;
  /** `-wal` sidecar size in MB (2-decimal rounding). */
  walSizeMb: number;
  /** How stale the served data could be: (walMtime - dbMtime) / 1000. */
  ageSeconds: number;
}

export interface LibrarySearchResult {
  items: LibraryItem[];
  /** Present when the Live DB was consulted. False if the DB couldn't be
   * found (Live not installed). Omitted when the request bypassed the DB
   * entirely (e.g. source=sampleFolder). */
  dbAvailable?: boolean;
  /** Set when the served snapshot may be stale (unclean Live exit left a
   * pending WAL). Omitted when there's no detectable risk. */
  stalenessRisk?: StalenessRisk;
  /** Set when items is empty due to a discoverable failure (e.g. DB missing). */
  reason?: string;
}

/** One query in a searchBatch call: the single-search filter set plus an
 * optional label used to group its results in the response. */
export interface LibraryBatchQuery extends LibrarySearchArgs {
  /** Result-group label; defaults to the query's index (as a string). */
  label?: string;
}

/** Results for a single searchBatch query, grouped under its label. */
export interface LibraryBatchEntry {
  /** Provided label, or the query's index as a string when none was given. */
  label: string;
  items: LibraryItem[];
  /** Set when items is empty due to a discoverable failure (e.g. DB missing). */
  reason?: string;
}

export interface LibraryBatchResult {
  results: LibraryBatchEntry[];
  /** Present when the Live DB was consulted; false if it couldn't be found.
   * Omitted when every query bypassed the DB (e.g. all source=sampleFolder). */
  dbAvailable?: boolean;
}

export interface LibraryTag {
  name: string;
  /** How many files carry this tag */
  count: number;
}

export interface LibraryListTagsResult {
  tags: LibraryTag[];
  /** Present when the Live DB was consulted; false if it couldn't be found. */
  dbAvailable?: boolean;
  /** Set when the served snapshot may be stale (unclean Live exit left a
   * pending WAL). Omitted when there's no detectable risk. */
  stalenessRisk?: StalenessRisk;
  /** Set when tags is empty due to a discoverable failure (e.g. DB missing). */
  reason?: string;
}

/** Plugin binary format, derived from the `dev_identifier` URI scheme. */
export type PluginFormat = "VST" | "VST3" | "AU";

/** Plugin device classification, derived from the `dev_identifier`. */
export type PluginCategory = "instrument" | "audiofx";

export interface ListPluginsArgs {
  /** Case-insensitive substring match on the plugin name. */
  query?: string;
  /** Case-insensitive substring match on the vendor/manufacturer. */
  vendor?: string;
  /** Restrict to a single binary format. */
  format?: PluginFormat;
  /** Restrict to a single device classification. */
  category?: PluginCategory;
  /** Max plugins to return. */
  limit?: number;
}

export interface PluginItem {
  /** Plugin display name. */
  name: string;
  /** Vendor / manufacturer, or null when Live recorded none. */
  vendor: string | null;
  /** Version string, or null when Live recorded none. */
  version: string | null;
  /** Binary format, or null when it couldn't be derived from dev_identifier. */
  format: PluginFormat | null;
  /** Device classification, or null when it couldn't be derived. */
  category: PluginCategory | null;
  /** Live's raw plugin identifier URI (e.g. "device:vst3:instr:..."). */
  dev_identifier: string | null;
}

export interface ListPluginsResult {
  plugins: PluginItem[];
  /** Present when a plugin source DB was consulted; false if none was found. */
  dbAvailable?: boolean;
  /** Set when plugins is empty due to a discoverable failure (e.g. DB missing). */
  reason?: string;
}
