// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Node-side store for the LLM-managed memory collection under
// ~/.producer-pal/memory/<slug>.md — one fact per file, plus a DERIVED
// index (MEMORY.md) the backend regenerates on every remember/forget. A thin
// binding over the shared markdown-collection store (helpers/markdown-collection-
// store.ts): the CRUD, slugging + traversal guard, and reserved-index protection
// live there; here we supply only what's memory-specific — the flat,
// alphabetical-by-name index render.
//
// Unlike the fixed-slot skills overrides, memory has NO provenance/eject trap
// (ADR-0010): entries are purely additive user content with nothing upstream to
// drift from, so frontmatter here is plain structure (name/description). A
// legacy file with a `type:` line (the now-removed grouping axis) still reads
// fine — parseFrontmatter tolerates unknown keys, and this store simply never
// looks at `type`. The filesystem lives on the Node-for-Max side; V8's
// ppal-context round-trips through the memory.* RPC routes.

import { parseFrontmatter } from "../markdown-store/frontmatter.ts";
import {
  type BuildStoredArgs,
  collectionIndexLine,
  makeMarkdownCollectionStore,
} from "../markdown-store/markdown-collection-store.ts";

/** One stored memory: its slug, one-line hook, and body. */
export interface MemoryEntry {
  /** Slug (filename without extension); the stable handle for read/forget. */
  name: string;
  /** One-line recall hook, shown in the index. */
  description: string;
  /** The fact itself (trimmed). */
  body: string;
}

/** Fields required to store a memory via {@link rememberMemory}. */
export interface RememberMemoryInput {
  /** Desired name (slugified before use). */
  name: string;
  /** One-line recall hook (whitespace collapsed to a single line). */
  description: string;
  /** The fact body. */
  body: string;
}

const store = makeMarkdownCollectionStore<MemoryEntry, RememberMemoryInput>({
  subdir: "memory",
  indexFilename: "MEMORY.md",
  indexTitle: "# Producer Pal Memory",
  noun: "Memory",
  toEntry,
  sort: sortByName,
  renderIndexSections: renderMemoryIndex,
  buildStored: buildStoredMemory,
});

/** Normalize a name to a filesystem-safe memory slug (see the shared store). */
export const slugifyMemoryName = store.slugify;
/** Read one memory by name, or null when absent/reserved/unslugifiable. */
export const readMemoryEntry = store.read;
/** Whether a non-empty memory file already exists for a name. */
export const memoryExists = store.exists;
/** Every stored memory, sorted alphabetically by name. */
export const listMemoryEntries = store.list;
/** Create or overwrite a memory (same slug ⇒ update), then rebuild the index. */
export const rememberMemory = store.remember;
/** Delete a memory (if present) and rebuild the index. */
export const forgetMemory = store.forget;
/** Rebuild MEMORY.md from the current files; "" when there are no memories. */
export const regenerateIndex = store.regenerateIndex;

/**
 * Render the memory index body: a flat, alphabetical-by-name list of
 * `- \`name\` — description` lines (description omitted when blank). Shared by
 * the derived `MEMORY.md` file and the always-injected connect block (see
 * `memory-inject.ts`), so both show the identical recall index. The document
 * title is added by the caller.
 *
 * @param entries - The entries to index (already sorted)
 * @returns The flat index markdown (no document title)
 */
export function renderMemoryIndex(entries: MemoryEntry[]): string {
  return entries.map(collectionIndexLine).join("\n");
}

// --- Memory-specific config helpers (passed to the shared store) ---

/**
 * Parse a raw memory file into an entry. The filename slug is authoritative for
 * `name` (frontmatter is user-editable and may drift). Any other frontmatter
 * key — including a legacy `type:` line from before the grouping axis was
 * removed — is simply ignored.
 *
 * @param slug - The slug from the filename
 * @param raw - The raw file contents
 * @returns The parsed entry
 */
function toEntry(slug: string, raw: string): MemoryEntry {
  const { data, body } = parseFrontmatter(raw);

  return {
    name: slug,
    description: data.description ?? "",
    body: body.trim(),
  };
}

/**
 * Order memories alphabetically by name.
 *
 * @param entries - The freshly-read entries to sort
 * @returns The same array, sorted in place
 */
function sortByName(entries: MemoryEntry[]): MemoryEntry[] {
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Build a memory's stored frontmatter + returned entry.
 *
 * @param args - The slug, raw input, existing entry, description, and body
 * @returns The frontmatter fields to write and the entry to return
 */
function buildStoredMemory(
  args: BuildStoredArgs<MemoryEntry, RememberMemoryInput>,
): { data: Record<string, string>; entry: MemoryEntry } {
  const { slug, description, body } = args;

  return {
    data: { name: slug, description },
    entry: { name: slug, description, body },
  };
}
