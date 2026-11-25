// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/** Fewest options a list has to have to be worth a table entry. */
const MIN_SHARED_OPTIONS = 3;

/**
 * Say each option list used by two or more params once. Those params swap their
 * `options` for an `optionList` key, and the keys map to the lists. A list used
 * once, or too short to be worth the indirection, stays on its param.
 * Mutates the params.
 * @param parameters - Param entries as read, with their `options`
 * @returns The key-to-list table, in order of first use; undefined when no
 *   list is shared
 */
export function shareOptionLists(
  parameters: Record<string, unknown>[],
): Record<string, unknown[]> | undefined {
  const usersByList = new Map<string, Record<string, unknown>[]>();

  for (const param of parameters) {
    if (!Array.isArray(param.options)) {
      continue;
    }

    const key = JSON.stringify(param.options);

    usersByList.set(key, [...(usersByList.get(key) ?? []), param]);
  }

  const lists: Record<string, unknown[]> = {};

  for (const users of usersByList.values()) {
    const options = users[0]?.options as unknown[];

    if (users.length < 2 || options.length < MIN_SHARED_OPTIONS) {
      continue;
    }

    const listKey = `L${Object.keys(lists).length + 1}`;

    lists[listKey] = options;

    for (const user of users) {
      delete user.options;
      user.optionList = listKey;
    }
  }

  return Object.keys(lists).length > 0 ? lists : undefined;
}
