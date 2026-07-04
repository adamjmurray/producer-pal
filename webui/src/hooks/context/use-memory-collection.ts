// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  getMemoryCollectionUrl,
  getMemoryEntryUrl,
} from "#webui/utils/mcp-url";
import {
  type DocCollectionStatus,
  type UseDocCollectionReturn,
  useDocCollection,
} from "./use-doc-collection";

/** One stored memory, as the manager needs it. */
export interface MemoryEntryView {
  /** Slug (filename without extension); the stable handle for save/delete. */
  name: string;
  /** Which bucket it belongs to (drives list grouping). */
  type: string;
  /** One-line recall hook shown in the list. */
  description: string;
  /** The fact body (markdown). */
  body: string;
}

/** The fields a save writes (the slug comes from the entry name / URL). */
export interface MemoryEntryInput {
  type: string;
  description: string;
  content: string;
}

/** Status of the whole memory collection. */
export type MemoryCollectionStatus = DocCollectionStatus<MemoryEntryView>;

export type UseMemoryCollectionReturn = UseDocCollectionReturn<
  MemoryEntryView,
  MemoryEntryInput
>;

/**
 * Read/write the LLM-managed memory collection (~/.producer-pal/memory/) as one
 * collection — a thin binding of the generic {@link useDocCollection} to the
 * memory endpoints. The list GET returns every entry (name/type/description/
 * body); a PUT echoes the saved entry, a DELETE removes one; focus/interval
 * polling surfaces external writes.
 *
 * @returns Collection state plus save/delete and refresh actions
 */
export function useMemoryCollection(): UseMemoryCollectionReturn {
  return useDocCollection<MemoryEntryView, MemoryEntryInput>({
    label: "Memory",
    collectionUrl: getMemoryCollectionUrl,
    entryUrl: getMemoryEntryUrl,
  });
}
