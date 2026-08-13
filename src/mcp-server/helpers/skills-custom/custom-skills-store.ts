// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Node-side store for user-authored custom skills under
// ~/.producer-pal/skills-custom/<slug>.md — one instruction pack per file, plus a
// DERIVED index (SKILLS.md) the backend regenerates on every write. A thin
// binding over the shared markdown-collection store (helpers/markdown-collection-
// store.ts), a sibling of helpers/memory: the CRUD, slugging + traversal guard,
// and reserved-index protection live there; here we supply only what's skills-
// specific — the `enabled` flag (a disabled skill is omitted from the injected
// index) and its default-preserving logic on update.
//
// Distinct from the fixed-slot skills OVERRIDES (helpers/skill-overrides-store):
// those replace a built-in fragment in the always-on blob; custom skills ADD new
// on-demand entries whose bodies load via `ppal-context read`. The filesystem
// lives Node-side; V8's ppal-context round-trips through the skills.* RPC routes.

import { parseFrontmatter } from "../config-store/frontmatter.ts";
import {
  type BuildStoredArgs,
  collectionIndexLine,
  makeMarkdownCollectionStore,
} from "../config-store/markdown-collection-store.ts";

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

const store = makeMarkdownCollectionStore<
  CustomSkillEntry,
  RememberCustomSkillInput
>({
  subdir: "skills-custom",
  indexFilename: "SKILLS.md",
  indexTitle: "# Producer Pal Custom Skills",
  noun: "Skill",
  toEntry,
  sort: sortByName,
  renderIndexSections: renderSkillsIndexSections,
  buildStored: buildStoredSkill,
});

/** Normalize a name to a filesystem-safe skill slug (see the shared store). */
export const slugifyCustomSkillName = store.slugify;
/** Read one custom skill by name, or null when absent/reserved/unslugifiable. */
export const readCustomSkill = store.read;
/** Whether a non-empty custom-skill file already exists for a name. */
export const customSkillExists = store.exists;
/** Every stored custom skill, sorted by name. */
export const listCustomSkills = store.list;
/** Create or overwrite a custom skill (same slug ⇒ update), then rebuild index. */
export const rememberCustomSkill = store.remember;
/** Delete a custom skill (if present) and rebuild the index. */
export const forgetCustomSkill = store.forget;
/** Rebuild SKILLS.md from the current files; "" when there are no skills. */
export const regenerateSkillsIndex = store.regenerateIndex;

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
    .map(collectionIndexLine)
    .join("\n");
}

// --- Skill-specific config helpers (passed to the shared store) ---

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
  const { data, body } = parseFrontmatter(raw, [
    "name",
    "description",
    "enabled",
  ]);

  return {
    name: slug,
    description: data.description ?? "",
    enabled: data.enabled !== "false",
    body: body.trim(),
  };
}

/**
 * Order skills by name.
 *
 * @param entries - The freshly-read entries to sort
 * @returns The same array, sorted in place
 */
function sortByName(entries: CustomSkillEntry[]): CustomSkillEntry[] {
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Build a custom skill's stored frontmatter + returned entry, resolving the
 * `enabled` flag (explicit ⇒ preserved existing ⇒ default true).
 *
 * @param args - The slug, raw input, existing entry, description, and body
 * @returns The frontmatter fields to write and the entry to return
 */
function buildStoredSkill(
  args: BuildStoredArgs<CustomSkillEntry, RememberCustomSkillInput>,
): { data: Record<string, string>; entry: CustomSkillEntry } {
  const { slug, input, existing, description, body } = args;
  const enabled = input.enabled ?? existing?.enabled ?? true;

  return {
    data: { name: slug, description, enabled: String(enabled) },
    entry: { name: slug, description, enabled, body },
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
  const disabled = entries
    .filter((entry) => !entry.enabled)
    .map(collectionIndexLine);
  const sections = enabled ? [enabled] : [];

  if (disabled.length > 0) {
    sections.push(`## Disabled\n\n${disabled.join("\n")}`);
  }

  return sections.join("\n\n");
}
