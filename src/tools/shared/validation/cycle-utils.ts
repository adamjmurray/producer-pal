// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/v8-max-console.ts";

/**
 * Get the entry for a specific index from a list, cycling via modulo when the
 * list is shorter than the number of items (mirrors getColorForIndex).
 * @param list - List of values (or undefined when the parameter was omitted)
 * @param index - Current item index
 * @returns Value for this index, or undefined if the list is empty/undefined
 */
export function getCycledEntry(
  list: string[] | undefined,
  index: number,
): string | undefined {
  if (list == null || list.length === 0) return;

  return list[index % list.length];
}

/**
 * Emit a warning when a list has more entries than there are items to apply
 * them to (mirrors warnExtraNames). Extra entries are silently ignored by the
 * modulo cycling, so this surfaces the likely mistake.
 * @param list - List of values (or undefined when the parameter was omitted)
 * @param count - Number of items the list is applied to
 * @param toolName - Tool name for the warning message
 * @param label - Parameter label for the warning message (e.g., "transforms")
 */
export function warnExtraEntries(
  list: string[] | undefined,
  count: number,
  toolName: string,
  label: string,
): void {
  if (list != null && list.length > count) {
    console.warn(
      `${toolName}: ${list.length} ${label} provided but only ${count} clips — ignoring extra`,
    );
  }
}
