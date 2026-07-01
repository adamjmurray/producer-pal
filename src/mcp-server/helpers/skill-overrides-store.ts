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

import { createHash } from "node:crypto";
import { VERSION } from "#src/shared/config.ts";
import { type SkillOverrides } from "#src/skills/build-skills.ts";
import {
  SKILL_SLOT_NAMES,
  SKILL_SLOTS,
  type SkillSlotName,
} from "#src/skills/skill-slots.ts";
import {
  deleteConfigMarkdown,
  readConfigMarkdown,
  writeConfigMarkdown,
} from "./config-markdown-store.ts";
import { parseFrontmatter, serializeFrontmatter } from "./frontmatter.ts";

/** Fork-time provenance recorded in a saved override's frontmatter. */
export interface SkillOverrideProvenance {
  /** Producer Pal version the override was forked from. */
  producerPalVersion: string;
  /** SHA-256 of the built-in fragment at fork time. */
  builtInHash: string;
}

/** Full state of one override slot, for the webui editor. */
export interface SkillSlotState {
  /** Stable public slot name. */
  name: SkillSlotName;
  /** Human label for the editor. */
  title: string;
  /** The current release-tuned built-in fragment. */
  builtIn: string;
  /** The user's override body ("" when the slot tracks the built-in). */
  override: string;
  /** Whether the built-in changed since this override was forked. */
  drifted: boolean;
  /** Fork-time provenance (null when there is no override). */
  provenance: SkillOverrideProvenance | null;
}

/**
 * Read every active override fragment for buildSkills. Only known slots are
 * consulted, so stray files under ~/.producer-pal/skills are ignored. Empty or
 * whitespace-only bodies are dropped so the slot falls back to the built-in.
 *
 * @returns Per-slot override bodies (only slots the user has overridden)
 */
export function readSkillOverrides(): SkillOverrides {
  const overrides: SkillOverrides = {};

  for (const name of SKILL_SLOT_NAMES) {
    const body = readOverrideBody(name);

    if (body) overrides[name] = body;
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
    builtIn: slot.builtIn,
    override,
    drifted:
      provenance != null &&
      provenance.builtInHash !== hashFragment(slot.builtIn),
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

  const provenance: SkillOverrideProvenance = {
    producerPalVersion: VERSION,
    builtInHash: hashFragment(SKILL_SLOTS[name].builtIn),
  };

  writeConfigMarkdown(
    filenameFor(name),
    serializeFrontmatter(
      {
        producerPalVersion: provenance.producerPalVersion,
        builtInHash: provenance.builtInHash,
      },
      `${body}\n`,
    ),
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
 * @returns Relative filename (e.g. "skills/core-standard.md")
 */
function filenameFor(name: SkillSlotName): string {
  return `skills/${name}.md`;
}

/**
 * The trimmed override body for a slot, with any frontmatter stripped ("" when
 * absent/empty).
 *
 * @param name - The slot name
 * @returns The override body to feed buildSkills
 */
function readOverrideBody(name: SkillSlotName): string {
  return parseFrontmatter(readConfigMarkdown(filenameFor(name))).body.trim();
}

/**
 * Extract provenance from parsed frontmatter, or null when either field is
 * missing (a hand-authored override without provenance).
 *
 * @param data - Parsed frontmatter fields
 * @returns Provenance when both fields are present, else null
 */
function readProvenance(
  data: Record<string, string>,
): SkillOverrideProvenance | null {
  const producerPalVersion = data.producerPalVersion;
  const builtInHash = data.builtInHash;

  if (!producerPalVersion || !builtInHash) return null;

  return { producerPalVersion, builtInHash };
}

/**
 * SHA-256 of a fragment, used for fork-time provenance and drift detection.
 *
 * @param fragment - The built-in fragment string
 * @returns Hex-encoded SHA-256 digest
 */
function hashFragment(fragment: string): string {
  return createHash("sha256").update(fragment).digest("hex");
}
