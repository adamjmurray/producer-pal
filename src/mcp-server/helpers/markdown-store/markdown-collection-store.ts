// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The shared "loadable markdown collection" store: a dynamic set of frontmatter'd
// entries under ~/.producer-pal/<subdir>/<slug>.md plus a DERIVED index the
// backend regenerates on every mutation. The memory store and the custom-skills
// store are thin bindings over this factory (see dev/plans/Memory-System.md →
// "Reuse by later collections"); the CRUD, the filesystem-safe slugging + path
// traversal guard, and the reserved-index-slug protection all live here ONCE so a
// fix reaches every collection. Callers supply only what genuinely differs: the
// subdir/index names, how a file parses into an entry (toEntry), how entries are
// ordered (sort), how the index body renders (renderIndexSections), and any
// type-specific create-time validation + frontmatter (buildStored).

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
  /** Parse a raw file into an entry (the filename slug is authoritative). */
  toEntry: (slug: string, raw: string) => Entry;
  /** Order entries for listing and the index (returns a new sorted array). */
  sort: (entries: Entry[]) => Entry[];
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
  /** Every stored entry (index file excluded), ordered by the config's sort. */
  list: () => Entry[];
  /** Create or overwrite an entry (same slug ⇒ update), then rebuild the index. */
  remember: (input: Input) => Entry;
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
    const entries = listConfigMarkdownFiles(config.subdir)
      .filter(
        (file) => file.toLowerCase() !== config.indexFilename.toLowerCase(),
      )
      .map((file) => {
        // Normalize the basename to the canonical slug so a hand-authored
        // filename (spaces, caps, punctuation) lists under the same handle that
        // read/forget/remember derive — otherwise the index would surface an
        // entry no lookup could resolve. resolveFile maps that slug back here.
        const slug = slugifyCollectionName(file.replace(/\.md$/, ""));

        return config.toEntry(
          slug,
          readConfigMarkdown(`${config.subdir}/${file}`),
        );
      });

    return config.sort(entries);
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

  const remember = (input: Input): Entry => {
    const slug = slugifyCollectionName(input.name);

    if (!slug) {
      throw new Error(`${config.noun} name must contain letters or digits`);
    }

    if (isReservedSlug(slug)) {
      throw new Error(
        `"${slug}" is a reserved ${config.noun.toLowerCase()} name (the index file)`,
      );
    }

    const body = input.body.trim();

    if (!body) throw new Error(`${config.noun} body must not be empty`);

    const description = input.description.trim().replaceAll(/\s+/g, " ");
    const { data, entry } = config.buildStored({
      slug,
      input,
      existing: read(slug),
      description,
      body,
    });

    writeConfigMarkdown(
      resolveFile(slug),
      serializeFrontmatter(data, `${body}\n`),
    );
    regenerateIndex();

    return entry;
  };

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
    forget,
    regenerateIndex,
  };
}
