// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Notation } from "#src/shared/notation.ts";
import { coreBasic } from "#src/skills/core/core-basic.ts";
import { coreStandard } from "#src/skills/core/core-standard.ts";
import { abstark } from "#src/skills/notation/abstark.ts";
import { barbeatBasic } from "#src/skills/notation/barbeat-basic.ts";
import { barbeatStandard } from "#src/skills/notation/barbeat-standard.ts";
import { midiJson } from "#src/skills/notation/midi-json.ts";
import { stark } from "#src/skills/notation/stark.ts";

// The user-facing override "slots" (~/.producer-pal skills overrides, ADR-0010).
// A slot name is a PUBLIC CONTRACT: it keys a user's override file to a built-in
// buildSkills fragment. Renaming one orphans that user's override, so the set is
// kept small, coarse, and stable. Every fragment buildSkills can emit has
// exactly one slot; midi-json/stark/abstark reuse a single head across both the
// standard and basic (small-model) levels, so they are one slot each.
export const SKILL_SLOT_NAMES = [
  "core-standard",
  "core-basic",
  "barbeat-standard",
  "barbeat-basic",
  "midi-json",
  "stark",
  "abstark",
] as const;

export type SkillSlotName = (typeof SKILL_SLOT_NAMES)[number];

/**
 * A single overridable skills fragment. The slot name is the key in
 * {@link SKILL_SLOTS}, so it is not repeated in the definition.
 */
export interface SkillSlotDef {
  /** Human label for the webui editor. */
  title: string;
  /** One-line explainer shown beside the slot dropdown in the webui editor. */
  description: string;
  /** The release-tuned built-in fragment this slot replaces. */
  builtIn: string;
}

/** The overridable skills fragments, keyed by their stable slot name. */
export const SKILL_SLOTS: Record<SkillSlotName, SkillSlotDef> = {
  "core-standard": {
    title: "Core (standard)",
    description:
      "The main instructions: the tools, the workflow, and how Producer Pal drives Ableton Live. Used with capable models.",
    builtIn: coreStandard,
  },
  "core-basic": {
    title: "Core (small-model)",
    description:
      "A trimmed version of the core instructions for smaller or local models (small-model mode).",
    builtIn: coreBasic,
  },
  "barbeat-standard": {
    title: "bar|beat notation (standard)",
    description:
      "How to read and write bar|beat notation, the default note format. Used with capable models.",
    builtIn: barbeatStandard,
  },
  "barbeat-basic": {
    title: "bar|beat notation (small-model)",
    description:
      "A trimmed bar|beat notation guide for smaller or local models (small-model mode).",
    builtIn: barbeatBasic,
  },
  "midi-json": {
    title: "midi-json notation",
    description:
      "The note format guide used when midi-json notation is active.",
    builtIn: midiJson,
  },
  stark: {
    title: "stark notation",
    description: "The note format guide used when stark notation is active.",
    builtIn: stark,
  },
  abstark: {
    title: "abstark notation",
    description: "The note format guide used when abstark notation is active.",
    builtIn: abstark,
  },
};

/** The two slots buildSkills assembles for a given runtime context. */
export interface ActiveSkillSlots {
  /** The notation head slot prepended to the core body. */
  head: SkillSlotName;
  /** The shared core body slot. */
  core: SkillSlotName;
}

/**
 * Resolve which head + core slots buildSkills uses for a runtime context. The
 * level (standard vs basic) selects the core body; the notation selects the
 * head. bar|beat has a distinct head per level; the other three notations reuse
 * one head across both levels, so their slot name equals the notation name.
 *
 * @param notation - The active notation
 * @param smallModelMode - Whether small-model (basic) skills are active
 * @returns The head and core slot names in effect
 */
export function activeSkillSlots(
  notation: Notation,
  smallModelMode: boolean,
): ActiveSkillSlots {
  const core: SkillSlotName = smallModelMode ? "core-basic" : "core-standard";
  const head: SkillSlotName =
    notation === "barbeat"
      ? smallModelMode
        ? "barbeat-basic"
        : "barbeat-standard"
      : notation;

  return { head, core };
}

/**
 * Type guard for a value being a known skill slot name (validates route params
 * and override filenames against the public contract).
 *
 * @param value - Candidate slot name
 * @returns True when the value is a registered slot name
 */
export function isSkillSlotName(value: unknown): value is SkillSlotName {
  return (
    typeof value === "string" &&
    (SKILL_SLOT_NAMES as readonly string[]).includes(value)
  );
}
