// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Node-side store for the user's built-in skills-fragment overrides under
// ~/.producer-pal/skills/<slot>.md (ADR-0010, "the first true replace of
// release-tuned content"). Each file replaces one buildSkills fragment; an
// empty folder means every slot tracks the latest built-in. The filesystem
// lives on the Node-for-Max side, so V8's buildSkills is assembled here (see
// skills-inject.ts) and the webui editor round-trips through a REST route.
//
// A saved override carries fork-time PROVENANCE in frontmatter (the Producer
// Pal version and a hash of the built-in it forked from) so we can later flag
// "the default changed since you forked" drift. Provenance is stamped here on
// save — never authored by hand — keeping all filesystem + hashing logic
// Node-side.

import { type SkillOverrides } from "#src/skills/build-skills.ts";
import {
  SKILL_SLOT_NAMES,
  SKILL_SLOTS,
  type SkillSlotName,
} from "#src/skills/skill-slots.ts";
import {
  deleteConfigMarkdown,
  listConfigMarkdownFilesRecursive,
  readConfigMarkdown,
  writeConfigMarkdown,
} from "./markdown-store/config-markdown-store.ts";
import { parseFrontmatter } from "./markdown-store/frontmatter.ts";
import {
  hashBuiltIn,
  isDrifted,
  type OverrideProvenance,
  readProvenance,
  stampProvenance,
} from "./override-provenance.ts";

// Built-in fragments are static module imports, so their hashes never change at
// runtime. Precompute them once: GET /skill-overrides is polled every 5s and
// would otherwise re-hash all slots on each poll. (The override *files* are
// still re-read per request — they change on disk and must surface promptly.)
const BUILT_IN_HASHES: Record<SkillSlotName, string> = Object.fromEntries(
  SKILL_SLOT_NAMES.map((name) => [
    name,
    hashBuiltIn(SKILL_SLOTS[name].builtIn),
  ]),
) as Record<SkillSlotName, string>;

/** Full state of one override slot, for the webui editor. */
export interface SkillSlotState {
  /** Stable public slot name. */
  name: SkillSlotName;
  /** Human label for the editor. */
  title: string;
  /** One-line explainer shown beside the slot dropdown. */
  description: string;
  /** The current release-tuned built-in fragment. */
  builtIn: string;
  /** The user's override body ("" when the slot tracks the built-in). */
  override: string;
  /** Whether the built-in changed since this override was forked. */
  drifted: boolean;
  /** Fork-time provenance (null when there is no override). */
  provenance: OverrideProvenance | null;
}

/**
 * Read every override fragment for buildSkills. EVERY `.md` in the skills dir is
 * read, not just the curated slots: a fork may override a driver, a notation
 * head, or include a fragment of the user's own. `resolveIncludes` only pulls
 * the names its graph references, and the readdir scope here plus the resolver's
 * ref validation keep resolution inside the dir. Empty or whitespace-only bodies
 * are dropped so that name falls back to the built-in.
 *
 * @returns Fragment name → override body (only files the user has added)
 */
export function readSkillOverrides(): SkillOverrides {
  const overrides: SkillOverrides = {};

  // Read EVERY .md under the skills dir (nested included), not just the curated
  // slots: an override may be a driver, a wrapper, or a fragment of the user's
  // own that a fork includes — e.g. `skills/drums/backbeat.md` keyed as
  // "drums/backbeat". `resolveIncludes` only pulls names the graph references,
  // and its ref validation + this readdir scope keep resolution inside the dir.
  for (const file of listConfigMarkdownFilesRecursive("skills")) {
    const body = readFragmentBody(`skills/${file}`);

    if (body) overrides[file.slice(0, -".md".length)] = body;
  }

  return overrides;
}

/**
 * Full state of every override slot (built-in default, current override, and
 * drift), for the webui editor's list + diff.
 *
 * @returns One state entry per registered slot, in registry order
 */
export function listSkillSlotStates(): SkillSlotState[] {
  return SKILL_SLOT_NAMES.map(readSkillSlotState);
}

/**
 * Full state of a single override slot.
 *
 * @param name - The slot to read
 * @returns The slot's built-in, override, provenance, and drift state
 */
export function readSkillSlotState(name: SkillSlotName): SkillSlotState {
  const slot = SKILL_SLOTS[name];
  const { data, body } = parseFrontmatter(
    readConfigMarkdown(filenameFor(name)),
  );
  const override = body.trim();
  const provenance = override ? readProvenance(data) : null;

  return {
    name,
    title: slot.title,
    description: slot.description,
    builtIn: slot.builtIn,
    override,
    drifted: isDrifted(provenance, BUILT_IN_HASHES[name]),
    provenance,
  };
}

/**
 * Save an override for a slot, stamping fork-time provenance in frontmatter.
 * Blank content resets the slot to the built-in (deletes the file), matching
 * the editor's "reset to default".
 *
 * @param name - The slot to override
 * @param content - The override body (blank resets to built-in)
 * @returns The slot's new state
 */
export function writeSkillOverride(
  name: SkillSlotName,
  content: string,
): SkillSlotState {
  const body = content.trim();

  if (!body) return deleteSkillOverride(name);

  writeConfigMarkdown(
    filenameFor(name),
    stampProvenance(`${body}\n`, BUILT_IN_HASHES[name]),
  );

  return readSkillSlotState(name);
}

/**
 * Reset a slot to the built-in default (delete its override file).
 *
 * @param name - The slot to reset
 * @returns The slot's new state (override cleared)
 */
export function deleteSkillOverride(name: SkillSlotName): SkillSlotState {
  deleteConfigMarkdown(filenameFor(name));

  return readSkillSlotState(name);
}

// --- Helpers below main exports ---

/**
 * The override filename for a slot, under the skills/ subfolder of the config
 * directory.
 *
 * @param name - The slot name
 * @returns Relative filename (e.g. "skills/barbeat-standard.md")
 */
function filenameFor(name: SkillSlotName): string {
  return `skills/${name}.md`;
}

/**
 * The trimmed body of a skills override file, with any frontmatter stripped
 * ("" when absent/empty), for {@link readSkillOverrides}.
 *
 * @param filename - Config-relative path (e.g. "skills/barbeat-standard.md")
 * @returns The override body to feed buildSkills
 */
function readFragmentBody(filename: string): string {
  return parseFrontmatter(readConfigMarkdown(filename)).body.trim();
}
