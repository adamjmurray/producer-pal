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
}

export interface LibrarySearchResult {
  items: LibraryItem[];
  /** Present when the Live DB was consulted. False if the DB couldn't be
   * found (Live not installed). Omitted when the request bypassed the DB
   * entirely (e.g. source=sampleFolder). */
  dbAvailable?: boolean;
  /** Set when items is empty due to a discoverable failure (e.g. DB missing). */
  reason?: string;
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
  /** Set when tags is empty due to a discoverable failure (e.g. DB missing). */
  reason?: string;
}
