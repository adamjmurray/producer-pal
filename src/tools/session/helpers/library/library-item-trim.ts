// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  type LibraryItem,
  type LibrarySearchArgs,
  type LibraryToolItem,
} from "#src/mcp-server/live-library/library-types.ts";

/**
 * Drop what a search result item says twice, to spare the model's context.
 * Nothing is lost: each dropped field is the last or second-to-last segment of
 * `path`, or is implied by the request, or is the zero default.
 * - `name` and `folder` go when they equal the matching segment of `path`. A
 *   name with a "/" in it (a ":" in the file name on disk) shows as ":" in the
 *   path, so it differs and stays.
 * - `useCount` goes when 0.
 * - `kind` and `source` go when they equal the search's own filter.
 *
 * @param items - Merged, sorted items (sorting needs the full fields)
 * @param args - The search's filters
 * @returns The items as the tool returns them
 */
export function trimLibraryItems(
  items: LibraryItem[],
  args: LibrarySearchArgs,
): LibraryToolItem[] {
  return items.map((item) => trimLibraryItem(item, args));
}

/**
 * @param item - One full item
 * @param args - The search's filters
 * @returns The item without its redundant fields
 */
function trimLibraryItem(
  item: LibraryItem,
  args: LibrarySearchArgs,
): LibraryToolItem {
  const segments = item.path.split("/");
  // Deleting from a copy keeps the fields in their usual order.
  const trimmed: LibraryToolItem = { ...item };

  if (item.name === segments.at(-1)) {
    delete trimmed.name;
  }

  if (item.folder != null && item.folder === segments.at(-2)) {
    delete trimmed.folder;
  }

  if (item.useCount === 0) {
    delete trimmed.useCount;
  }

  if (item.kind === args.kind) {
    delete trimmed.kind;
  }

  if (item.source === args.source) {
    delete trimmed.source;
  }

  return trimmed;
}
