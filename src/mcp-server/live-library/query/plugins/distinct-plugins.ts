// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { existsSync } from "node:fs";

/**
 * Keep one row per plug-in. The same plug-in installed in two folders has two
 * rows with one `dev_identifier`: keep a copy whose file is there, else the
 * first. Rows with different identifiers are different plug-ins and all stay.
 *
 * @param rows - Plug-in rows of one name and format
 * @returns One row per identifier, in first-seen order
 */
export function distinctPlugins<
  T extends { dev_identifier: string | null; path: string | null },
>(rows: T[]): T[] {
  const kept = new Map<string | null, T>();

  for (const row of rows) {
    const current = kept.get(row.dev_identifier);

    if (current == null || (!onDisk(current) && onDisk(row))) {
      kept.set(row.dev_identifier, row);
    }
  }

  return [...kept.values()];
}

function onDisk(row: { path: string | null }): boolean {
  return existsSync(String(row.path));
}
