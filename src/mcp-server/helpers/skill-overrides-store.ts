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
//
// A slot also carries an `enabled` flag, the second and independent axis: OFF
// resolves the fragment to "" with no fallback, which is what an empty override
// body can never mean (that one falls back to the built-in). The two axes cross,
// so a file may hold a body, a flag, or both — and "reset to default" clears the
// body while leaving the switch alone.

import { type SkillOverrides } from "#src/skills/build-skills.ts";
import {
  fragmentGate,
  type FragmentGate,
} from "#src/skills/fragment-tool-gates.ts";
import {
  isDisableableSkillSlot,
  SKILL_SLOT_NAMES,
  SKILL_SLOTS,
  type SkillSlotName,
} from "#src/skills/skill-slots.ts";
import {
  deleteConfigMarkdown,
  listConfigMarkdownFilesRecursive,
  readConfigMarkdown,
  writeConfigMarkdown,
} from "./config-store/config-markdown-store.ts";
import {
  parseFrontmatter,
  type ParsedFrontmatter,
  serializeFrontmatter,
} from "./config-store/frontmatter.ts";
import {
  freshProvenance,
  hashBuiltIn,
  isDrifted,
  type OverrideProvenance,
  PROVENANCE_FRONTMATTER_KEYS,
  readProvenance,
} from "./override-provenance.ts";

/**
 * The frontmatter keys a skills override file carries: fork-time provenance
 * plus the per-slot on/off flag. `enabled` is STORED rather than derived from
 * the file's presence because the two axes are independent — a slot can be
 * switched off while still tracking the built-in, and that file holds the flag
 * and nothing else.
 */
const SKILL_FRONTMATTER_KEYS = [
  ...PROVENANCE_FRONTMATTER_KEYS,
  "enabled",
] as const;

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
  /** Whether this fragment is assembled at all (off ⇒ it resolves to ""). */
  enabled: boolean;
  /** Whether the editor may offer an off switch (false for the drivers). */
  canDisable: boolean;
  /**
   * The tools (any-of) that keep this fragment, or `"always"` /
   * `"conversation-only"`; null for the drivers. Sent so the editor can state
   * the rule — a fragment's conditional behavior was only ever described in its
   * prose description, which drifts.
   */
  gate: FragmentGate | null;
  /** Whether the built-in changed since this override was forked. */
  drifted: boolean;
  /** Fork-time provenance (null when there is no override). */
  provenance: OverrideProvenance | null;
}

/**
 * A write to one override slot. Either axis may be omitted to leave it exactly
 * as stored, so the editor's body autosave and its on/off toggle never clobber
 * each other.
 */
export interface SkillSlotWrite {
  /** New override body (blank clears it); omitted keeps the stored one. */
  content?: string;
  /** New on/off flag; omitted keeps the stored one. */
  enabled?: boolean;
}

/**
 * Read the user's whole skills customization for buildSkills: override bodies
 * and the names switched off. EVERY `.md` in the skills dir is read, not just
 * the curated slots: a fork may override a driver, a notation head, or include a
 * fragment of the user's own. `resolveIncludes` only pulls the names its graph
 * references, and the readdir scope here plus the resolver's ref validation keep
 * resolution inside the dir. Empty or whitespace-only bodies are dropped so that
 * name falls back to the built-in — a file that carries only `enabled: false`
 * therefore contributes a switch-off and no body, which is the whole point of
 * storing the flag separately.
 *
 * @returns The override bodies and the disabled fragment names
 */
export function readSkillOverrides(): SkillOverrides {
  const fragments: Record<string, string> = {};
  const disabled: string[] = [];

  // Read EVERY .md under the skills dir (nested included), not just the curated
  // slots: an override may be a driver, a wrapper, or a fragment of the user's
  // own that a fork includes — e.g. `skills/drums/backbeat.md` keyed as
  // "drums/backbeat". `resolveIncludes` only pulls names the graph references,
  // and its ref validation + this readdir scope keep resolution inside the dir.
  for (const file of listConfigMarkdownFilesRecursive("skills")) {
    const name = file.slice(0, -".md".length);
    const { data, body } = readSlotFile(`skills/${file}`);
    const override = body.trim();

    if (override) fragments[name] = override;
    if (!isEnabled(data)) disabled.push(name);
  }

  return { fragments, disabled };
}

/**
 * Full state of every override slot (built-in default, current override, on/off
 * flag, and drift), for the webui editor's list + diff.
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
 * @returns The slot's built-in, override, on/off flag, provenance, and drift
 */
export function readSkillSlotState(name: SkillSlotName): SkillSlotState {
  const slot = SKILL_SLOTS[name];
  const { data, body } = readSlotFile(filenameFor(name));
  const override = body.trim();
  const provenance = override ? readProvenance(data) : null;

  return {
    name,
    title: slot.title,
    description: slot.description,
    builtIn: slot.builtIn,
    override,
    enabled: isEnabled(data),
    canDisable: isDisableableSkillSlot(name),
    gate: fragmentGate(name),
    drifted: isDrifted(provenance, BUILT_IN_HASHES[name]),
    provenance,
  };
}

/**
 * Write one slot's override body and/or its on/off flag, stamping fork-time
 * provenance when the BODY is written. An omitted field keeps what is stored, so
 * toggling a slot off preserves its override (and its drift flag — re-stamping
 * provenance on a toggle would silently re-fork content the user hasn't looked
 * at). A slot with no body that is switched back on has nothing left to store,
 * so its file is deleted.
 *
 * @param name - The slot to write
 * @param write - The body and/or flag to change ({@link SkillSlotWrite})
 * @returns The slot's new state
 */
export function writeSkillOverride(
  name: SkillSlotName,
  write: SkillSlotWrite,
): SkillSlotState {
  const filename = filenameFor(name);
  const { data, body: stored } = readSlotFile(filename);
  const body = (write.content ?? stored).trim();
  const enabled = write.enabled ?? isEnabled(data);

  if (!body && enabled) {
    deleteConfigMarkdown(filename);
  } else {
    const provenance =
      write.content == null
        ? readProvenance(data)
        : freshProvenance(BUILT_IN_HASHES[name]);

    writeConfigMarkdown(
      filename,
      serializeFrontmatter(
        slotFrontmatter(provenance, body, enabled),
        body ? `${body}\n` : "",
      ),
    );
  }

  return readSkillSlotState(name);
}

/**
 * Reset a slot's override to the built-in default. The on/off flag is the
 * independent axis and survives: a disabled slot stays disabled, its file kept
 * for the flag alone.
 *
 * @param name - The slot to reset
 * @returns The slot's new state (override cleared)
 */
export function deleteSkillOverride(name: SkillSlotName): SkillSlotState {
  return writeSkillOverride(name, { content: "" });
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
 * Read and split one skills file into its frontmatter and body. A missing file
 * (the common untouched case) yields empty fields, which read as "tracks the
 * built-in, switched on".
 *
 * @param filename - Config-relative path (e.g. "skills/barbeat-standard.md")
 * @returns The parsed frontmatter and body
 */
function readSlotFile(filename: string): ParsedFrontmatter {
  return parseFrontmatter(readConfigMarkdown(filename), SKILL_FRONTMATTER_KEYS);
}

/**
 * Whether a slot's stored frontmatter leaves it switched on. Only an explicit
 * `enabled: false` turns a fragment off, so a hand-authored file with no
 * frontmatter at all is on — the same default the custom-skills store uses.
 *
 * @param data - The slot file's parsed frontmatter
 * @returns True unless the file says exactly `enabled: false`
 */
function isEnabled(data: Record<string, string>): boolean {
  return data.enabled !== "false";
}

/**
 * The frontmatter block for a stored slot file: fork-time provenance (which
 * describes a forked BODY, so a flag-only file carries none) plus the off flag.
 * `enabled: true` is never written — absence is the default, which keeps a
 * hand-authored file free of metadata it never asked for.
 *
 * @param provenance - Fork-time provenance, or null when there is none
 * @param body - The override body being stored ("" for a flag-only file)
 * @param enabled - Whether the slot is switched on
 * @returns The flat key/value block to serialize
 */
function slotFrontmatter(
  provenance: OverrideProvenance | null,
  body: string,
  enabled: boolean,
): Record<string, string> {
  const data: Record<string, string> = {};

  if (body && provenance) Object.assign(data, provenance);
  if (!enabled) data.enabled = "false";

  return data;
}
