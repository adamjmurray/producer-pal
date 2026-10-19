// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { libraryModifiedMs } from "./user-library-fs.ts";

const LEFTOVER_MIN_AGE_MS = 60_000;

/**
 * Whether an install's temp file or folder is old enough to delete. A young one
 * may belong to an install running right now, in this process or another.
 *
 * @param path - The leftover
 * @returns Whether it's there and over a minute old. One whose age can't be
 *   read (a looped link) counts as old: no install is writing into it.
 */
export function isStaleLeftover(path: string): boolean {
  let modified: number | undefined;

  try {
    modified = libraryModifiedMs(path);
  } catch {
    return true;
  }

  return modified != null && Date.now() - modified > LEFTOVER_MIN_AGE_MS;
}
