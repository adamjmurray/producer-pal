// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The shared "loadable markdown collection" store: a dynamic set of frontmatter'd
// entries under ~/.producer-pal/<subdir>/<slug>.md plus a DERIVED index the
// backend regenerates on every mutation. The memory store and the custom-skills
// store are thin bindings over this factory (see dev/Memory-System.md → "The
// loadable-collection primitive"); the CRUD, the filesystem-safe slugging + path
// traversal guard, and the reserved-index-slug protection all live here ONCE so a
// fix reaches every collection. Callers supply only what genuinely differs: the
// subdir/index names, how a file parses into an entry (toEntry), how entries are
// ordered (sortEntries), how the index body renders (renderIndexSections), and
// any type-specific create-time validation + frontmatter (buildStored).

import {
  deleteConfigMarkdown,
  listConfigMarkdownFiles,
  readConfigMarkdown,
  writeConfigMarkdown,
} from "./config-markdown-store.ts";
import { serializeFrontmatter } from "./frontmatter.ts";

/** The fields every collection entry shares (its filename slug + recall hook). */
export interface CollectionEntry {
  /** Slug (filename without extension); the stable handle for read/forget. */
  name: string;
  /** One-line recall hook, shown in the index. */
  description: string;
}

/** The create/overwrite fields every collection's `remember` accepts. */
export interface CollectionInput {
  /** Desired name (slugified before use). */
  name: string;
  /** One-line hook (whitespace collapsed to a single line before storing). */
  description: string;
  /** The entry body. */
  body: string;
}

/** Arguments handed to {@link MarkdownCollectionConfig.buildStored}. */
export interface BuildStoredArgs<
  Entry extends CollectionEntry,
  Input extends CollectionInput,
> {
  /** The filesystem-safe slug (already validated non-empty and non-reserved). */
  slug: string;
  /** The raw create/overwrite input. */
  input: Input;
  /** The current on-disk entry, or null on create (to preserve a field). */
  existing: Entry | null;
  /** The trimmed + whitespace-collapsed description. */
  description: string;
  /** The trimmed body (already validated non-empty). */
  body: string;
}

/** Per-collection configuration for {@link makeMarkdownCollectionStore}. */
export interface MarkdownCollectionConfig<
  Entry extends CollectionEntry,
  Input extends CollectionInput,
> {
  /** Subfolder under the config dir, e.g. "memory" or "skills-custom". */
  subdir: string;
  /** Derived index filename, e.g. "MEMORY.md". Its slug is reserved. */
  indexFilename: string;
  /** Title line for the derived index file, e.g. "# Producer Pal Memory". */
  indexTitle: string;
  /** Capitalized noun for user-facing error messages, e.g. "Memory" or "Skill". */
  noun: string;
  /**
   * Reject a create/overwrite/rename whose description is blank (memory).
   * Collections where a description is optional (custom skills) leave it unset.
   * Only the WRITE path enforces — a legacy/hand-authored file with no
   * description still reads and renders (its index line just omits the dash).
   */
  requireDescription?: boolean;
  /** Parse a raw file into an entry (the filename slug is authoritative). */
  toEntry: (slug: string, raw: string) => Entry;
  /** Order entries for listing and the index (returns a new sorted array). */
  sortEntries: (entries: Entry[]) => Entry[];
  /** Render the derived index body (no title) from the sorted entries. */
  renderIndexSections: (entries: Entry[]) => string;
  /**
   * Type-specific validation + frontmatter for a create/overwrite. Runs after the
   * generic non-empty-slug / non-reserved / non-empty-body guards. May throw a
   * user-facing Error. Returns the frontmatter fields to write and the entry to
   * return (its body is the same trimmed `body`).
   */
  buildStored: (args: BuildStoredArgs<Entry, Input>) => {
    data: Record<string, string>;
    entry: Entry;
  };
}

/** The CRUD surface a collection binding re-exports under its own names. */
export interface MarkdownCollectionStore<
  Entry extends CollectionEntry,
  Input extends CollectionInput,
> {
  /** Normalize a name to a filesystem-safe slug. */
  slugify: (name: string) => string;
  /** Whether a slug collides with the derived index file. */
  isReservedSlug: (slug: string) => boolean;
  /** Read one entry by name, or null when absent/reserved/unslugifiable. */
  read: (name: string) => Entry | null;
  /** Whether a non-empty entry file already exists for this name. */
  exists: (name: string) => boolean;
  /** Every stored entry (index file excluded), in the config's sortEntries order. */
  list: () => Entry[];
  /** Create or overwrite an entry (same slug ⇒ update), then rebuild the index. */
  remember: (input: Input) => Entry;
  /**
   * Rename an entry: write `input` (the current fields) under its new slug,
   * delete the old file, and rebuild the index — atomic from the caller's view.
   * Throws when no entry exists under `oldName`, on an invalid/reserved/empty
   * new name, or on a collision with a different existing entry. A no-op slug
   * change (same slug) just updates in place. Preserves fields not in `input`
   * from the old entry via `buildStored`.
   */
  rename: (oldName: string, input: Input) => Entry;
  /** Delete an entry (if present), then rebuild the index. */
  forget: (name: string) => boolean;
  /** Rebuild the derived index from the current files; "" when the set is empty. */
  regenerateIndex: () => string;
}

/**
 * Normalize an arbitrary name into a filesystem-safe slug: lowercase, non
 * alphanumerics collapsed to single hyphens, edges trimmed. Also the path
 * traversal guard — the result can only match `[a-z0-9-]`, so it can never
 * escape the collection subdir.
 *
 * @param name - The raw name (may be a title, phrase, or existing slug)
 * @returns The slug, or "" when the name has no usable characters
 */
export function slugifyCollectionName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replaceAll(/[^\da-z]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
}

/**
 * One index line for an entry: `- \`name\` — description`, or just the backticked
 * slug when the description is blank. Shared by every collection's index.
 *
 * @param entry - The entry to render
 * @returns The index line
 */
export function collectionIndexLine(entry: CollectionEntry): string {
  return entry.description
    ? `- \`${entry.name}\` — ${entry.description}`
    : `- \`${entry.name}\``;
}

/**
 * Build a markdown-collection store from its per-collection config. Returns the
 * shared CRUD closures; a binding module re-exports them under its domain names
 * and supplies the domain-specific `renderIndexSections` / `toEntry` / etc.
 *
 * @param config - The per-collection configuration
 * @returns The store's CRUD surface
 */
export function makeMarkdownCollectionStore<
  Entry extends CollectionEntry,
  Input extends CollectionInput,
>(
  config: MarkdownCollectionConfig<Entry, Input>,
): MarkdownCollectionStore<Entry, Input> {
  // The derived index lives at <subdir>/<indexFilename>, so its slug is reserved:
  // on a case-insensitive filesystem (macOS APFS, Windows NTFS) an entry that
  // slugifies to it would write the SAME file as the index and silently clobber
  // it. Every read/write/forget guards it; Linux CI can't see the collision.
  const indexSlug = config.indexFilename.replace(/\.md$/i, "").toLowerCase();
  const filenameFor = (slug: string): string => `${config.subdir}/${slug}.md`;
  const isReservedSlug = (slug: string): boolean => slug === indexSlug;

  // Resolve a slug to the relative path of the file backing it. The canonical
  // <subdir>/<slug>.md wins when it exists; otherwise scan for a hand-authored
  // file whose own basename slugifies to the same slug (e.g. "Kick Drum
  // Samples.md" backs the slug "kick-drum-samples"), so a freely-named file
  // still reads, updates in place, and deletes rather than being unreadable or
  // silently duplicated. Falls back to the canonical path when nothing matches —
  // the create target for remember.
  const resolveFile = (slug: string): string => {
    const canonical = filenameFor(slug);

    if (readConfigMarkdown(canonical).trim() !== "") return canonical;

    const match = listConfigMarkdownFiles(config.subdir).find(
      (file) =>
        file.toLowerCase() !== config.indexFilename.toLowerCase() &&
        slugifyCollectionName(file.replace(/\.md$/, "")) === slug,
    );

    return match ? `${config.subdir}/${match}` : canonical;
  };

  const read = (name: string): Entry | null => {
    const slug = slugifyCollectionName(name);

    if (!slug || isReservedSlug(slug)) return null;

    const raw = readConfigMarkdown(resolveFile(slug));

    if (!raw.trim()) return null;

    return config.toEntry(slug, raw);
  };

  const exists = (name: string): boolean => {
    const slug = slugifyCollectionName(name);

    if (!slug || isReservedSlug(slug)) return false;

    return readConfigMarkdown(resolveFile(slug)).trim() !== "";
  };

  const list = (): Entry[] => {
    // Normalize each basename to its canonical slug so a hand-authored filename
    // (spaces, caps, punctuation) lists under the same handle read/forget/
    // remember derive. De-dupe by slug and read each back through resolveFile:
    // when two files collide on one slug (e.g. a hand-authored "Kick Drum.md"
    // beside "kick-drum.md") only the one resolveFile targets is reachable, so
    // listing exactly that one keeps the index from surfacing a ghost line no
    // lookup could resolve — and keeps the listed entry identical to the one
    // read/forget/remember act on, by construction.
    const seen = new Set<string>();
    const entries: Entry[] = [];

    for (const file of listConfigMarkdownFiles(config.subdir)) {
      if (file.toLowerCase() === config.indexFilename.toLowerCase()) continue;

      const slug = slugifyCollectionName(file.replace(/\.md$/, ""));

      if (seen.has(slug)) continue;
      seen.add(slug);

      entries.push(config.toEntry(slug, readConfigMarkdown(resolveFile(slug))));
    }

    return config.sortEntries(entries);
  };

  const regenerateIndex = (): string => {
    const entries = list();

    if (entries.length === 0) {
      deleteConfigMarkdown(`${config.subdir}/${config.indexFilename}`);

      return "";
    }

    const content = `${config.indexTitle}\n\n${config.renderIndexSections(entries)}\n`;

    writeConfigMarkdown(`${config.subdir}/${config.indexFilename}`, content);

    return content;
  };

  const { remember, rename } = makeCollectionWriteOps(config, {
    isReservedSlug,
    resolveFile,
    read,
    regenerateIndex,
  });

  const forget = (name: string): boolean => {
    const slug = slugifyCollectionName(name);

    if (!slug || isReservedSlug(slug)) return false;

    const file = resolveFile(slug);
    const existed = readConfigMarkdown(file).trim() !== "";

    deleteConfigMarkdown(file);
    regenerateIndex();

    return existed;
  };

  return {
    slugify: slugifyCollectionName,
    isReservedSlug,
    read,
    exists,
    list,
    remember,
    rename,
    forget,
    regenerateIndex,
  };
}

/** The store closures the write operations depend on. */
interface WriteOpsDeps<Entry extends CollectionEntry> {
  /** Whether a slug collides with the derived index file. */
  isReservedSlug: (slug: string) => boolean;
  /** Resolve a slug to the relative path of the file backing it. */
  resolveFile: (slug: string) => string;
  /** Read one entry by name, or null when absent. */
  read: (name: string) => Entry | null;
  /** Rebuild the derived index from the current files. */
  regenerateIndex: () => string;
}

/**
 * Build the create ({@link MarkdownCollectionStore.remember}) and
 * {@link MarkdownCollectionStore.rename} write closures. Extracted from
 * {@link makeMarkdownCollectionStore} so that factory stays within the
 * function-size limit; it shares the store's slug guard, file resolver, reader,
 * and index rebuilder via `deps`.
 *
 * @param config - The per-collection configuration
 * @param deps - The store closures the writers depend on
 * @returns The remember + rename closures
 */
function makeCollectionWriteOps<
  Entry extends CollectionEntry,
  Input extends CollectionInput,
>(
  config: MarkdownCollectionConfig<Entry, Input>,
  deps: WriteOpsDeps<Entry>,
): {
  remember: (input: Input) => Entry;
  rename: (oldName: string, input: Input) => Entry;
} {
  const { isReservedSlug, resolveFile, read, regenerateIndex } = deps;

  // Slugify + guard a create/rename target, throwing the user-facing message on
  // an empty (no usable characters) or reserved (index-file) name.
  const validateTargetSlug = (name: string): string => {
    const slug = slugifyCollectionName(name);

    if (!slug) {
      throw new Error(`${config.noun} name must contain letters or digits`);
    }

    if (isReservedSlug(slug)) {
      throw new Error(
        `"${slug}" is a reserved ${config.noun.toLowerCase()} name (the index file)`,
      );
    }

    return slug;
  };

  // Validate the body, build the frontmatter+entry (preserving fields not in
  // `input` from `existing`), and write the file. The slug is assumed already
  // validated. Shared by remember (existing = same slug) and rename (existing =
  // the old slug). Does NOT rebuild the index — the caller does, once.
  const validateAndWrite = (
    slug: string,
    input: Input,
    existing: Entry | null,
  ): Entry => {
    const body = input.body.trim();

    if (!body) throw new Error(`${config.noun} body must not be empty`);

    const description = input.description.trim().replaceAll(/\s+/g, " ");

    if (config.requireDescription && !description) {
      throw new Error(`${config.noun} description must not be empty`);
    }

    const { data, entry } = config.buildStored({
      slug,
      input,
      existing,
      description,
      body,
    });

    writeConfigMarkdown(
      resolveFile(slug),
      serializeFrontmatter(data, `${body}\n`),
    );

    return entry;
  };

  const remember = (input: Input): Entry => {
    const slug = validateTargetSlug(input.name);
    const entry = validateAndWrite(slug, input, read(slug));

    regenerateIndex();

    return entry;
  };

  const rename = (oldName: string, input: Input): Entry => {
    const oldSlug = slugifyCollectionName(oldName);
    // Rename moves an EXISTING entry. Read it first (also carried over to
    // buildStored so fields absent from `input` — e.g. a custom skill's enabled
    // flag — survive), and reject a missing source: without this guard a rename
    // of a never-created slug falls through to validateAndWrite and silently
    // creates a brand-new entry under the new name (the old-file delete being a
    // harmless no-op) — a create masquerading as a rename.
    const existing = read(oldSlug);

    if (existing == null) {
      throw new Error(
        `No ${config.noun.toLowerCase()} named "${oldSlug}" exists`,
      );
    }

    const newSlug = validateTargetSlug(input.name);

    if (
      newSlug !== oldSlug &&
      readConfigMarkdown(resolveFile(newSlug)).trim() !== ""
    ) {
      throw new Error(
        `A ${config.noun.toLowerCase()} named "${newSlug}" already exists`,
      );
    }

    const entry = validateAndWrite(newSlug, input, existing);

    if (newSlug !== oldSlug) deleteConfigMarkdown(resolveFile(oldSlug));

    regenerateIndex();

    return entry;
  };

  return { remember, rename };
}
