// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Node-side store for user-authored custom skills under
// ~/.producer-pal/skills-custom/<slug>.md — one instruction pack per file, plus
// a DERIVED index (SKILLS.md) the backend regenerates on every write. This is
// the second "loadable markdown collection" (see dev/plans/Memory-System.md →
// "Reuse by later collections"), a sibling of helpers/memory: a dynamic set of
// frontmatter'd entries whose index is always injected and whose bodies load on
// demand via `ppal-context read`.
//
// Two axes distinguish it from memory: an `enabled` flag (a disabled skill is
// omitted from the injected index entirely) and lazy-only injection (no body is
// ever pinned in v1 — every enabled skill contributes just its index line).
// Distinct from the fixed-slot skills OVERRIDES (helpers/skill-overrides-store):
// those replace a built-in fragment in the always-on blob; custom skills ADD new
// on-demand entries. The filesystem lives Node-side; V8's ppal-context
// round-trips through the skills.* RPC routes.

import {
  deleteConfigMarkdown,
  listConfigMarkdownFiles,
  readConfigMarkdown,
  writeConfigMarkdown,
} from "../config-markdown-store.ts";
import { parseFrontmatter, serializeFrontmatter } from "../frontmatter.ts";

const SKILLS_SUBDIR = "skills-custom";
const INDEX_FILENAME = "SKILLS.md";
// The derived index lives at skills-custom/SKILLS.md, so its slug ("skills") is
// reserved: on case-insensitive filesystems (macOS APFS, Windows NTFS) a skill
// that slugifies to "skills" would write the SAME file as the index and silently
// clobber it. Every read/write/forget guards it; Linux CI is case-sensitive and
// can't see the collision, so the guard is what protects it.
const INDEX_SLUG = INDEX_FILENAME.replace(/\.md$/i, "").toLowerCase();

/** One stored custom skill: its slug, hook, enabled flag, and instructions. */
export interface CustomSkillEntry {
  /** Slug (filename without extension); the stable handle for read/forget. */
  name: string;
  /** One-line "load me when…" hook, shown in the index. */
  description: string;
  /** Whether the skill is injected/loadable (a disabled skill is omitted). */
  enabled: boolean;
  /** The instruction body (trimmed). */
  body: string;
}

/** Fields required to store a custom skill via {@link rememberCustomSkill}. */
export interface RememberCustomSkillInput {
  /** Desired name (slugified before use). */
  name: string;
  /** One-line hook (whitespace collapsed to a single line). */
  description: string;
  /** The instruction body. */
  body: string;
  /**
   * Whether the skill is enabled. Omitted ⇒ preserve the existing entry's flag
   * on update, or default to enabled on create. Enable/disable is a user action
   * (webui / hand-edit), so the assistant's create/edit never flips it.
   */
  enabled?: boolean;
}

/**
 * Normalize an arbitrary name into a filesystem-safe slug: lowercase, non
 * alphanumerics collapsed to single hyphens, edges trimmed. Also the path
 * traversal guard — the result can only match `[a-z0-9-]`, so it can never
 * escape the skills-custom subdir.
 *
 * @param name - The raw name (may be a title, phrase, or existing slug)
 * @returns The slug, or "" when the name has no usable characters
 */
export function slugifyCustomSkillName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replaceAll(/[^\da-z]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
}

/**
 * Read one custom skill by name (slugified to locate the file).
 *
 * @param name - The skill name (slugified before lookup)
 * @returns The entry, or null when no such skill exists
 */
export function readCustomSkill(name: string): CustomSkillEntry | null {
  const slug = slugifyCustomSkillName(name);

  if (!slug || slug === INDEX_SLUG) return null;

  const raw = readConfigMarkdown(filenameFor(slug));

  if (!raw.trim()) return null;

  return toEntry(slug, raw);
}

/**
 * Whether a custom skill with this name already exists on disk. Used by the
 * create flow to reject a name collision (a PUT is create-or-overwrite, so
 * without this a new entry would silently clobber an existing one).
 *
 * @param name - The skill name (slugified before lookup)
 * @returns True when a non-empty skill file already exists for that slug
 */
export function customSkillExists(name: string): boolean {
  const slug = slugifyCustomSkillName(name);

  if (!slug || slug === INDEX_SLUG) return false;

  return readConfigMarkdown(filenameFor(slug)).trim() !== "";
}

/**
 * List every stored custom skill, sorted by name. The derived index file itself
 * is skipped.
 *
 * @returns All custom skill entries
 */
export function listCustomSkills(): CustomSkillEntry[] {
  return listConfigMarkdownFiles(SKILLS_SUBDIR)
    .filter((file) => file.toLowerCase() !== INDEX_FILENAME.toLowerCase())
    .map((file) => {
      const slug = file.replace(/\.md$/, "");

      return toEntry(slug, readConfigMarkdown(`${SKILLS_SUBDIR}/${file}`));
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Create or overwrite a custom skill (same slug ⇒ update in place), then
 * regenerate the index. Rejects an empty slug or body so a malformed call can't
 * write a useless or path-unsafe file. An omitted `enabled` preserves the
 * existing flag (or defaults to enabled on create) — see
 * {@link RememberCustomSkillInput}.
 *
 * @param input - The skill to store
 * @returns The stored entry
 */
export function rememberCustomSkill(
  input: RememberCustomSkillInput,
): CustomSkillEntry {
  const slug = slugifyCustomSkillName(input.name);

  if (!slug) throw new Error("Skill name must contain letters or digits");

  if (slug === INDEX_SLUG) {
    throw new Error(`"${slug}" is a reserved skill name (the index file)`);
  }

  const body = input.body.trim();

  if (!body) throw new Error("Skill body must not be empty");

  const description = input.description.trim().replaceAll(/\s+/g, " ");
  const enabled = input.enabled ?? readCustomSkill(slug)?.enabled ?? true;

  writeConfigMarkdown(
    filenameFor(slug),
    serializeFrontmatter(
      { name: slug, description, enabled: String(enabled) },
      `${body}\n`,
    ),
  );
  regenerateSkillsIndex();

  return { name: slug, description, enabled, body };
}

/**
 * Delete a custom skill (if present) and regenerate the index.
 *
 * @param name - The skill name (slugified before lookup)
 * @returns True when a skill existed and was removed
 */
export function forgetCustomSkill(name: string): boolean {
  const slug = slugifyCustomSkillName(name);

  if (!slug || slug === INDEX_SLUG) return false;

  const existed = readConfigMarkdown(filenameFor(slug)).trim() !== "";

  deleteConfigMarkdown(filenameFor(slug));
  regenerateSkillsIndex();

  return existed;
}

/**
 * Rebuild SKILLS.md from the current skill files' frontmatter. Deletes the index
 * when there are no skills so an empty collection leaves no stale file. Called
 * after every mutation, and by `list` to self-heal a hand-edited store.
 *
 * @returns The rendered index markdown ("" when there are no skills)
 */
export function regenerateSkillsIndex(): string {
  const entries = listCustomSkills();

  if (entries.length === 0) {
    deleteConfigMarkdown(`${SKILLS_SUBDIR}/${INDEX_FILENAME}`);

    return "";
  }

  const content = `# Producer Pal Custom Skills\n\n${renderSkillsIndexSections(entries)}\n`;

  writeConfigMarkdown(`${SKILLS_SUBDIR}/${INDEX_FILENAME}`, content);

  return content;
}

/**
 * Render the enabled skills as index lines (`- \`name\` — description`), one per
 * line. This is the recall harness injected on connect: only enabled skills,
 * hooks only, bodies loaded on demand. Returns "" when nothing is enabled.
 *
 * @param entries - The skill entries (already sorted)
 * @returns The enabled index lines, or "" when none are enabled
 */
export function renderEnabledSkillsIndex(entries: CustomSkillEntry[]): string {
  return entries
    .filter((entry) => entry.enabled)
    .map(indexLine)
    .join("\n");
}

// --- Helpers below main exports ---

/**
 * The skill filename for a slug, under the skills-custom/ subfolder.
 *
 * @param slug - The skill slug
 * @returns Relative filename (e.g. "skills-custom/jazz-voicings.md")
 */
function filenameFor(slug: string): string {
  return `${SKILLS_SUBDIR}/${slug}.md`;
}

/**
 * Parse a raw skill file into an entry. The filename slug is authoritative for
 * `name` (frontmatter is user-editable and may drift); `enabled` defaults to
 * true unless the frontmatter says exactly `false`, so a hand-authored file with
 * no `enabled:` line is on by default.
 *
 * @param slug - The slug from the filename
 * @param raw - The raw file contents
 * @returns The parsed entry
 */
function toEntry(slug: string, raw: string): CustomSkillEntry {
  const { data, body } = parseFrontmatter(raw);

  return {
    name: slug,
    description: data.description ?? "",
    enabled: data.enabled !== "false",
    body: body.trim(),
  };
}

/**
 * Render the derived SKILLS.md body: enabled skills as a flat list, then a
 * `## Disabled` section for any that are off (so a user browsing the file sees
 * everything, while the injected index — {@link renderEnabledSkillsIndex} —
 * shows only the enabled ones).
 *
 * @param entries - The skill entries (already sorted)
 * @returns The index markdown (no document title)
 */
function renderSkillsIndexSections(entries: CustomSkillEntry[]): string {
  const enabled = renderEnabledSkillsIndex(entries);
  const disabled = entries.filter((entry) => !entry.enabled).map(indexLine);
  const sections = enabled ? [enabled] : [];

  if (disabled.length > 0) {
    sections.push(`## Disabled\n\n${disabled.join("\n")}`);
  }

  return sections.join("\n\n");
}

/**
 * One index line for an entry: `- \`name\` — description`, or just the
 * backticked slug when the description is blank.
 *
 * @param entry - The skill entry
 * @returns The index line
 */
function indexLine(entry: CustomSkillEntry): string {
  return entry.description
    ? `- \`${entry.name}\` — ${entry.description}`
    : `- \`${entry.name}\``;
}
