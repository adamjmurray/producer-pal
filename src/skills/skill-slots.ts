// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { basicDriver, standardDriver } from "#src/skills/builtin-fragments.ts";
import { coreArrangement } from "#src/skills/core/core-arrangement.ts";
import {
  coreContextBasic,
  coreContextStandard,
} from "#src/skills/core/core-context.ts";
import { coreDevices } from "#src/skills/core/core-devices.ts";
import { coreLibrary } from "#src/skills/core/core-library.ts";
import { coreTransforms } from "#src/skills/core/core-transforms.ts";
import { barbeatBasic } from "#src/skills/notation/barbeat-basic.ts";
import { barbeatStandard } from "#src/skills/notation/barbeat-standard.ts";
import { midiJson } from "#src/skills/notation/midi-json.ts";
import { starkBasic, starkStandard } from "#src/skills/notation/stark.ts";

// The user-facing override "slots" (~/.producer-pal skills overrides, ADR-0010).
// A slot name is a PUBLIC CONTRACT: it keys a user's override file to a built-in
// fragment. Renaming one orphans that user's override, so the set is kept coarse
// and stable. Three tiers: the `standard`/`basic` DRIVERS are the top-level
// roots (chosen by small-model mode) that inline the shared core body and pull
// in a notation head via `@include`; the `core-*` SECTIONS are the core's
// task-oriented chunks, pulled in by a driver's includes (so a driver override
// can suppress one by deleting its include line) — all of them the standard
// core's, except the context pair, which is carved out at BOTH levels and so
// takes the same `-standard`/`-basic` suffix the notation heads use
// (`core-context-standard`, `core-context-basic`); the notation heads are the
// note-format guides. bar|beat and
// stark have a distinct head per level; midi-json reuses one head across both
// levels, so it is a single slot (the drivers reach it through a level-named
// wrapper that is plumbing, not an override slot). What remains inline in a
// driver (units, workflow, help) is not a slot — editing a driver edits it
// directly.
export const SKILL_SLOT_NAMES = [
  "standard",
  "basic",

  "core-transforms",
  "core-library",
  "core-devices",
  "core-arrangement",
  "core-context-standard",
  "core-context-basic",

  "barbeat-standard",
  "barbeat-basic",
  "midi-json",
  "stark-standard",
  "stark-basic",
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
  standard: {
    title: "Full skills (standard)",
    description:
      "The full standard skills: Producer Pal's instructions to the AI, sent when it connects. Core guidance plus specialized guides (notation, transforms, devices…) pulled in via @include. Edit it to drop @includes you don't need, or rewrite freely.",
    builtIn: standardDriver,
  },
  basic: {
    title: "Full skills (small-model)",
    description:
      "The full skills for smaller or local models: a trimmed version of the standard skills. Same core guidance plus @include guides; edit or drop @includes as you like.",
    builtIn: basicDriver,
  },
  "core-transforms": {
    title: "Core: transforms",
    description:
      "The transforms and preTransforms guide — the DSL for editing notes and audio params on create-clip, update-clip, and duplicate.",
    builtIn: coreTransforms,
  },
  "core-library": {
    title: "Core: library search",
    description:
      "How to find samples, MIDI clips, and plugins with ppal-library.",
    builtIn: coreLibrary,
  },
  "core-devices": {
    title: "Core: devices & instruments",
    description:
      "Device paths, Simpler and Drum Rack building, specialized device controls, and VST/AU limits.",
    builtIn: coreDevices,
  },
  "core-arrangement": {
    title: "Core: arrangement",
    description:
      "Moving clips on the arrangement timeline and working with take lanes.",
    builtIn: coreArrangement,
  },
  "core-context-standard": {
    title: "Core: context & memory",
    description:
      "How the AI uses ppal-context: the project, global, and memory layers, when it may write each, and how it curates its own memories. Used with capable models.",
    builtIn: coreContextStandard,
  },
  "core-context-basic": {
    title: "Core: context (small-model)",
    description:
      "A trimmed context guide for smaller or local models (small-model mode): the project and global documents only — small-model mode has no memory.",
    builtIn: coreContextBasic,
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
  "stark-standard": {
    title: "stark notation (standard)",
    description:
      "How to read and write stark notation, the literal round-trippable note format. Used with capable models.",
    builtIn: starkStandard,
  },
  "stark-basic": {
    title: "stark notation (small-model)",
    description:
      "A trimmed stark notation guide for smaller or local models (small-model mode): the 16 named drum pads only.",
    builtIn: starkBasic,
  },
};

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
