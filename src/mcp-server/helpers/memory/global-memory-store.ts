// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Node-side store for the LLM-managed memory collection under
// ~/.producer-pal/memory/<slug>.md — one typed fact per file, plus a DERIVED
// index (MEMORY.md) the backend regenerates on every remember/forget. This is
// the first "loadable markdown collection" (see dev/plans/Memory-System.md):
// a dynamic set of frontmatter'd entries whose index is always injected and
// whose lazy bodies load on demand.
//
// Unlike the fixed-slot skills overrides, memory has NO provenance/eject trap
// (ADR-0010): entries are purely additive user content with nothing upstream to
// drift from, so frontmatter here is plain structure (name/description/type).
// The filesystem lives on the Node-for-Max side; V8's ppal-context round-trips
// through the memory.* RPC routes.

import {
  deleteConfigMarkdown,
  listConfigMarkdownFiles,
  readConfigMarkdown,
  writeConfigMarkdown,
} from "../config-markdown-store.ts";
import { parseFrontmatter, serializeFrontmatter } from "../frontmatter.ts";
import {
  isMemoryType,
  MEMORY_TYPE_LABELS,
  MEMORY_TYPES,
  type MemoryType,
} from "./memory.ts";

const MEMORY_SUBDIR = "memory";
const INDEX_FILENAME = "MEMORY.md";
// The derived index lives at memory/MEMORY.md, so its slug ("memory") is
// reserved. On case-insensitive filesystems (macOS APFS, Windows NTFS) a user
// memory that slugifies to "memory" would write the SAME file as the index and
// silently clobber it, so every read/write/forget guards this slug. Linux CI is
// case-sensitive and can't see the collision — the guard is what protects it.
const INDEX_SLUG = INDEX_FILENAME.replace(/\.md$/i, "").toLowerCase();

/** One stored memory: its slug, type, one-line hook, and body. */
export interface MemoryEntry {
  /** Slug (filename without extension); the stable handle for read/forget. */
  name: string;
  /** Which bucket it belongs to (its `## Label` group in the index). */
  type: MemoryType;
  /** One-line recall hook, shown in the index. */
  description: string;
  /** The fact itself (trimmed). */
  body: string;
}

/** Fields required to store a memory via {@link rememberMemory}. */
export interface RememberMemoryInput {
  /** Desired name (slugified before use). */
  name: string;
  /** Memory bucket. */
  type: MemoryType;
  /** One-line recall hook (whitespace collapsed to a single line). */
  description: string;
  /** The fact body. */
  body: string;
}

/**
 * Normalize an arbitrary name into a filesystem-safe slug: lowercase, non
 * alphanumerics collapsed to single hyphens, edges trimmed. Also the path
 * traversal guard — the result can only match `[a-z0-9-]`, so it can never
 * escape the memory subdir.
 *
 * @param name - The raw name (may be a title, phrase, or existing slug)
 * @returns The slug, or "" when the name has no usable characters
 */
export function slugifyMemoryName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replaceAll(/[^\da-z]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
}

/**
 * Read one memory by name (slugified to locate the file).
 *
 * @param name - The memory name (slugified before lookup)
 * @returns The entry, or null when no such memory exists
 */
export function readMemoryEntry(name: string): MemoryEntry | null {
  const slug = slugifyMemoryName(name);

  if (!slug || isReservedMemorySlug(slug)) return null;

  const raw = readConfigMarkdown(filenameFor(slug));

  if (!raw.trim()) return null;

  return toEntry(slug, raw);
}

/**
 * Whether a memory with this name already exists on disk. Used by the create
 * flow to reject a name collision (a PUT is create-or-overwrite, so without this
 * a new entry would silently clobber an existing one). Returns false for an
 * unslugifiable or reserved name so the caller falls through to the store's own
 * (more specific) error for those.
 *
 * @param name - The memory name (slugified before lookup)
 * @returns True when a non-empty memory file already exists for that slug
 */
export function memoryExists(name: string): boolean {
  const slug = slugifyMemoryName(name);

  if (!slug || isReservedMemorySlug(slug)) return false;

  return readConfigMarkdown(filenameFor(slug)).trim() !== "";
}

/**
 * List every stored memory, sorted by type (index order) then name. The
 * derived index file itself is skipped.
 *
 * @returns All memory entries
 */
export function listMemoryEntries(): MemoryEntry[] {
  return listConfigMarkdownFiles(MEMORY_SUBDIR)
    .filter((file) => file.toLowerCase() !== INDEX_FILENAME.toLowerCase())
    .map((file) => {
      const slug = file.replace(/\.md$/, "");

      return toEntry(slug, readConfigMarkdown(`${MEMORY_SUBDIR}/${file}`));
    })
    .sort(
      (a, b) =>
        MEMORY_TYPES.indexOf(a.type) - MEMORY_TYPES.indexOf(b.type) ||
        a.name.localeCompare(b.name),
    );
}

/**
 * Create or overwrite a memory (same slug ⇒ update in place), then regenerate
 * the index. Rejects an empty slug or body so a malformed call can't write a
 * useless or path-unsafe file.
 *
 * @param input - The memory to store
 * @returns The stored entry (as re-read from disk)
 */
export function rememberMemory(input: RememberMemoryInput): MemoryEntry {
  const slug = slugifyMemoryName(input.name);

  if (!slug) throw new Error("Memory name must contain letters or digits");

  if (isReservedMemorySlug(slug)) {
    throw new Error(`"${slug}" is a reserved memory name (the index file)`);
  }

  if (!isMemoryType(input.type)) {
    throw new Error(`Invalid memory type: ${String(input.type)}`);
  }

  const body = input.body.trim();

  if (!body) throw new Error("Memory body must not be empty");

  const description = input.description.trim().replaceAll(/\s+/g, " ");

  writeConfigMarkdown(
    filenameFor(slug),
    serializeFrontmatter(
      { name: slug, description, type: input.type },
      `${body}\n`,
    ),
  );
  regenerateIndex();

  return { name: slug, type: input.type, description, body };
}

/**
 * Delete a memory (if present) and regenerate the index.
 *
 * @param name - The memory name (slugified before lookup)
 * @returns True when a memory existed and was removed
 */
export function forgetMemory(name: string): boolean {
  const slug = slugifyMemoryName(name);

  if (!slug || isReservedMemorySlug(slug)) return false;

  const existed = readConfigMarkdown(filenameFor(slug)).trim() !== "";

  deleteConfigMarkdown(filenameFor(slug));
  regenerateIndex();

  return existed;
}

/**
 * Rebuild MEMORY.md from the current memory files' frontmatter. Deletes the
 * index when there are no memories so an empty collection leaves no stale file.
 * Called after every mutation, and by `list` to self-heal a hand-edited store.
 *
 * @returns The rendered index markdown ("" when there are no memories)
 */
export function regenerateIndex(): string {
  const entries = listMemoryEntries();

  if (entries.length === 0) {
    deleteConfigMarkdown(`${MEMORY_SUBDIR}/${INDEX_FILENAME}`);

    return "";
  }

  const content = `# Producer Pal Memory\n\n${renderMemoryIndexSections(entries)}\n`;

  writeConfigMarkdown(`${MEMORY_SUBDIR}/${INDEX_FILENAME}`, content);

  return content;
}

// --- Helpers below main exports ---

/**
 * Whether a slug collides with the derived index file (`memory/MEMORY.md`).
 * Reserved so a memory named "memory" can't overwrite the index on a
 * case-insensitive filesystem.
 *
 * @param slug - A slugified memory name (already lowercased)
 * @returns True when the slug is reserved for the index
 */
function isReservedMemorySlug(slug: string): boolean {
  return slug === INDEX_SLUG;
}

/**
 * The memory filename for a slug, under the memory/ subfolder of the config
 * directory.
 *
 * @param slug - The memory slug
 * @returns Relative filename (e.g. "memory/prefers-c-minor.md")
 */
function filenameFor(slug: string): string {
  return `${MEMORY_SUBDIR}/${slug}.md`;
}

/**
 * Parse a raw memory file into an entry. The filename slug is authoritative for
 * `name` (frontmatter is user-editable and may drift); type coerces to
 * `reference` (a low-risk default) when missing or invalid on a hand-edited
 * file.
 *
 * @param slug - The slug from the filename
 * @param raw - The raw file contents
 * @returns The parsed entry
 */
function toEntry(slug: string, raw: string): MemoryEntry {
  const { data, body } = parseFrontmatter(raw);

  return {
    name: slug,
    type: isMemoryType(data.type) ? data.type : "reference",
    description: data.description ?? "",
    body: body.trim(),
  };
}

/**
 * Render the memory index body: entries grouped by type under `## Label`
 * headings, one `- \`name\` — description` line each (description omitted when
 * blank). Shared by the derived `MEMORY.md` file and the always-injected
 * connect block (see `memory-inject.ts`), so both show the identical recall
 * index. The document title is added by the caller.
 *
 * @param entries - The entries to index (already sorted)
 * @returns The grouped index markdown (no document title)
 */
export function renderMemoryIndexSections(entries: MemoryEntry[]): string {
  const sections = MEMORY_TYPES.flatMap((type) => {
    const lines = entries.filter((entry) => entry.type === type).map(indexLine);

    if (lines.length === 0) return [];

    return [`## ${MEMORY_TYPE_LABELS[type]}\n\n${lines.join("\n")}`];
  });

  return sections.join("\n\n");
}

/**
 * One index line for an entry: `- \`name\` — description`, or just the
 * backticked slug when the description is blank.
 *
 * @param entry - The memory entry
 * @returns The index line
 */
function indexLine(entry: MemoryEntry): string {
  return entry.description
    ? `- \`${entry.name}\` — ${entry.description}`
    : `- \`${entry.name}\``;
}
