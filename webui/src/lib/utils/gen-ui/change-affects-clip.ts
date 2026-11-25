// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type LiveChange } from "#src/shared/gen-ui-types";

/**
 * Whether a "Live changed" event means a clip widget should re-read. It matches
 * on the widget's own ref and on the id and path its last read found, since a
 * tool may have named the clip by either.
 *
 * @param change - The event
 * @param ref - The widget's ref (an id or a path)
 * @param lastRead - The id and path found the last time the clip was read
 * @param lastRead.id - The clip's id then
 * @param lastRead.path - The clip's path then
 * @returns True when the widget should re-read
 */
export function changeAffectsClip(
  change: LiveChange,
  ref: string,
  lastRead: { id?: string; path?: string } = {},
): boolean {
  if (change.all) {
    return true;
  }

  const named = new Set([...change.ids, ...change.paths]);

  return [ref, lastRead.id, lastRead.path].some(
    (key) => key != null && named.has(key),
  );
}
