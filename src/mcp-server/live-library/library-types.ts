// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Shared types for Live library queries (ppal-library tool routes).
 */

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
 * `folder_kind` integers; "folder" is the special case for files
 * found via the user-configured custom sample folder (V8 filesystem
 * scan, not in Live's DB).
 */
export type LibrarySource =
  | "folder"
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
  sort?: LibrarySort;
  limit?: number;
}

export interface LibraryItem {
  /** Filename only */
  name: string;
  /** Absolute filesystem path (POSIX-style) */
  path: string;
  /** Resolved content kind, or null if file_type didn't map to a known kind */
  kind: LibraryKind | null;
  /** Tag names attached to this file */
  tags: string[];
  /** Live's persistent usage counter */
  useCount: number;
  /** Resolved source category, or null if folder_kind was unrecognized */
  source: LibrarySource | null;
}

export interface LibrarySearchResult {
  items: LibraryItem[];
  /** Present when the Live DB was consulted. False if the DB couldn't be
   * found (Live not installed). Omitted when the request bypassed the DB
   * entirely (e.g. source=folder). */
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
