// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { basicDriver, standardDriver } from "#src/skills/drivers.ts";
import {
  arrangement,
  arrangementWrite,
} from "#src/skills/fragments/arrangement.ts";
import {
  contextBasic,
  contextStandard,
} from "#src/skills/fragments/context.ts";
import { devices, devicesWrite } from "#src/skills/fragments/devices.ts";
import {
  gettingHelp,
  gettingHelpBasic,
} from "#src/skills/fragments/getting-help.ts";
import { library } from "#src/skills/fragments/library.ts";
import { specializedDevices } from "#src/skills/fragments/specialized-devices.ts";
import { timeAndValues } from "#src/skills/fragments/time-and-values.ts";
import {
  transformsBasic,
  transformsCore,
  transformsEditing,
} from "#src/skills/fragments/transforms-core.ts";
import { transformsExpressions } from "#src/skills/fragments/transforms-expressions.ts";
import { transformsGenerative } from "#src/skills/fragments/transforms-generative.ts";
import { workingWithLive } from "#src/skills/fragments/working-with-live.ts";
import { barbeatBasic } from "#src/skills/notation/barbeat-basic.ts";
import {
  barbeatStandard,
  barbeatStandardWrite,
} from "#src/skills/notation/barbeat-standard.ts";
import { midiJson } from "#src/skills/notation/midi-json.ts";
import { starkBasic, starkStandard } from "#src/skills/notation/stark.ts";

// The fragments named in more than one place here — the slot list and the
// retired-name map.
const TRANSFORMS_CORE = "transforms-core";
const TRANSFORMS_EXPRESSIONS = "transforms-expressions";
const DEVICES = "devices";
const ARRANGEMENT = "arrangement";

// The user-facing override "slots" (~/.producer-pal skills overrides, ADR-0010).
// A slot name is a PUBLIC CONTRACT: it keys a user's override file to a built-in
// fragment, so renaming one orphans that user's override.
//
// Three tiers. The `standard`/`basic` DRIVERS are the roots (chosen by
// small-model mode): `standard` is now nothing but the include manifest, so
// forking it to drop a section costs a line rather than a document. The TASK
// fragments are the sections that manifest names, cut so each maps to the tools
// (or the audience) a job actually has — `getting-help` maps to no tool at all
// and is pure conversation, `time-and-values` is needed by everyone. The
// NOTATION heads are the note-format guides. Where a fragment exists at both
// depths (the context pair; bar|beat and stark) the depth is a `-standard` /
// `-basic` suffix, NOT a separate boundary. midi-json reuses one head across
// both depths, so it is a single slot (the drivers reach it through an alias,
// see builtin-fragments.ts). `transforms-basic` and `getting-help-basic` wear
// the suffix with no `-standard` twin, both because pairing them would retire a
// live slot name to buy symmetry: transforms' standard depth is spread across
// the other `transforms-*` fragments, and the other twin is plain
// `getting-help`.
//
// A second, independent suffix axis is DIRECTION: a fragment may spin the half
// only a writer can act on out into a `-write` sibling, gated on that subject's
// write tools, so a read-only caller stops paying for it (ADR-0019). The base
// name keeps meaning what it meant — the whole, minus what only a writer can use
// — which is why splitting one costs no rename and no retired slot.
// `barbeat-standard`, `devices`, and `arrangement` are split so far.
//
// `code-transforms` is deliberately absent: it only carries text in a build with
// code execution enabled, so there is nothing stable for a user to override. It
// is still a fragment, with a gate and a `requires` edge — both of those tables
// are keyed by fragment name for exactly this reason.
export const SKILL_SLOT_NAMES = [
  "standard",
  "basic",

  "time-and-values",
  TRANSFORMS_CORE,
  "transforms-editing",
  TRANSFORMS_EXPRESSIONS,
  "transforms-generative",
  "transforms-basic",
  "library",
  DEVICES,
  "devices-write",
  "specialized-devices",
  ARRANGEMENT,
  "arrangement-write",
  "working-with-live",
  "context-standard",
  "context-basic",
  "getting-help",
  "getting-help-basic",

  "barbeat-standard",
  "barbeat-standard-write",
  "barbeat-basic",
  "midi-json",
  "stark-standard",
  "stark-basic",
] as const;

export type SkillSlotName = (typeof SKILL_SLOT_NAMES)[number];

/**
 * Slot names the task-line re-carve retired, mapped to what replaced them. A
 * user's `~/.producer-pal/skills/core-devices.md` still parses and still gets
 * read — it is simply never referenced again, so their customization stops
 * applying with nothing to notice. buildSkills warns on these for the same
 * reason the resolver warns on an unknown include: a rename must not be silent.
 * Retire an entry only once nobody can still be carrying that file.
 */
export const RETIRED_SKILL_SLOTS: Record<string, readonly SkillSlotName[]> = {
  "core-transforms": [
    TRANSFORMS_CORE,
    "transforms-editing",
    TRANSFORMS_EXPRESSIONS,
    "transforms-generative",
  ],
  "core-library": ["library"],
  "core-devices": [DEVICES, "devices-write", "specialized-devices"],
  "core-arrangement": [ARRANGEMENT, "arrangement-write"],
  "core-context-standard": ["context-standard"],
  "core-context-basic": ["context-basic"],

  // Never editor slots — they were the level-named wrappers the drivers used to
  // include, so a hand-written override file could key to one and work. The
  // alias now folds those refs onto `midi-json` before any lookup, which makes
  // such a file inert: exactly the silent break this map exists to announce.
  "midi-json-standard": ["midi-json"],
  "midi-json-basic": ["midi-json"],
};

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
  /**
   * True for the two DRIVER roots, which have no per-slot on/off switch. They
   * are the document being assembled rather than a section of it, so switching
   * one off would resolve the root to "" and empty the whole blob — a one-click
   * blanking with nothing else on screen to explain it. Trimming what a driver
   * composes is what overriding it (deleting `@include` lines) is for.
   */
  alwaysOn?: boolean;
}

/** The overridable skills fragments, keyed by their stable slot name. */
export const SKILL_SLOTS: Record<SkillSlotName, SkillSlotDef> = {
  standard: {
    title: "Full skills (standard)",
    description:
      "The standard skills document: Producer Pal's instructions to the AI, sent when it connects. It's a list of @include lines, one per section below — delete a line to drop that section, or rewrite the document freely.",
    builtIn: standardDriver,
    alwaysOn: true,
  },

  basic: {
    title: "Full skills (small-model)",
    description:
      "The skills document for smaller or local models: a much shorter set of essentials, plus the notation and context guides via @include.",
    builtIn: basicDriver,
    alwaysOn: true,
  },

  "time-and-values": {
    title: "Time & note values",
    description:
      "Beats, note values, bar|beat positions, and clip lengths — the units every other section assumes. Needed by nearly every task.",
    builtIn: timeAndValues,
  },

  "transforms-core": {
    title: "Transforms: core",
    description:
      "Selecting notes and setting values on them — the transforms most requests need.",
    builtIn: transformsCore,
  },

  "transforms-editing": {
    title: "Transforms: editing an existing clip",
    description:
      "preTransforms and quantizeGrid, for deleting, clearing, moving, and quantizing notes already in a clip. Only update-clip takes them, so anything that can't update clips never gets this. Needs the core transforms guide.",
    builtIn: transformsEditing,
  },

  "transforms-expressions": {
    title: "Transforms: expressions & functions",
    description:
      "Transforms that read a note's current value and run it through a function: variables, math, swing and quantize. Needs the core transforms guide, which defines the syntax it builds on.",
    builtIn: transformsExpressions,
  },

  "transforms-generative": {
    title: "Transforms: generative",
    description:
      "Transforms that invent material: ratchet, repeat, split, merge, and the waveforms that modulate a value across a clip. Needs the core and expressions transforms guides.",
    builtIn: transformsGenerative,
  },

  "transforms-basic": {
    title: "Deleting notes (small-model)",
    description:
      "The whole transforms guide for smaller or local models (small-model mode): clearing and deleting notes already in a clip with update-clip's preTransforms.",
    builtIn: transformsBasic,
  },

  library: {
    title: "Library search",
    description:
      "How to find samples, MIDI clips, and plugins with ppal-library.",
    builtIn: library,
  },

  devices: {
    title: "Devices & instruments",
    description:
      "Device paths and what can't be reached inside a VST/AU plug-in — what every device task needs, whichever direction it goes.",
    builtIn: devices,
  },

  "devices-write": {
    title: "Devices: building instruments",
    description:
      "Loading samples into a Simpler and building a whole Drum Rack in one call. Only create-device and update-device can act on it, so a read-only caller never gets it. Needs the devices guide it sits under.",
    builtIn: devicesWrite,
  },

  "specialized-devices": {
    title: "Specialized device controls",
    description:
      "The extra controls specific native devices expose (Drift, Wavetable, Simpler, Compressor, EQ Eight, Hybrid Reverb…). Only needed when working with those devices, and needs the devices guide it sits under.",
    builtIn: specializedDevices,
  },

  arrangement: {
    title: "Arrangement",
    description:
      "What an arrangement position means: the song meter it resolves against, versus the clip meter a clip's own start and length use.",
    builtIn: arrangement,
  },

  "arrangement-write": {
    title: "Arrangement: placing clips",
    description:
      "Moving and splitting clips on the arrangement timeline, and stacking take lanes. Only create-clip, update-clip, and duplicate can act on it, so a read-only caller never gets it. Needs the arrangement guide it sits under.",
    builtIn: arrangementWrite,
  },

  "working-with-live": {
    title: "Working with Ableton Live",
    description:
      "Session vs. Arrangement habits, playback behavior, and general music-making guidance.",
    builtIn: workingWithLive,
  },

  "context-standard": {
    title: "Context & memory",
    description:
      "How the AI uses ppal-context: the project, global, and memory layers, when it may write each, and how it curates its own memories. Used with capable models.",
    builtIn: contextStandard,
  },

  "context-basic": {
    title: "Context (small-model)",
    description:
      "A trimmed context guide for smaller or local models (small-model mode): the project and global documents only — small-model mode has no memory.",
    builtIn: contextBasic,
  },

  "getting-help": {
    title: "Getting help & limits",
    description:
      "What to tell you when a request is outside Producer Pal's reach — audio limits, Live features it can't drive, and where to read more.",
    builtIn: gettingHelp,
  },

  "getting-help-basic": {
    title: "Audio limits (small-model)",
    description:
      "What to tell you when you ask for something audio can't do, in small-model mode. Like the section above, it's only for a conversation with you — a subagent never gets it.",
    builtIn: gettingHelpBasic,
  },

  "barbeat-standard": {
    title: "bar|beat notation (standard)",
    description:
      "How to read bar|beat notation, the default note format: positions, meter, and the note syntax read-clip returns. Used with capable models. The syntax for writing notes is the separate section below.",
    builtIn: barbeatStandard,
  },

  "barbeat-standard-write": {
    title: "bar|beat notation: writing notes (standard)",
    description:
      "The bar|beat syntax only used to CREATE notes — repeat patterns, pattern brackets, bar copying, v0 deletes, and the examples. Never appears in a clip you read back, so it's dropped for anything that can't write clips. Needs the bar|beat notation guide it builds on.",
    builtIn: barbeatStandardWrite,
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

/**
 * Whether a slot may be switched off (see {@link SkillSlotDef.alwaysOn}). The
 * editor hides the toggle for the drivers and the route refuses to store a
 * disable for them, so the two surfaces read one answer.
 *
 * @param name - The slot to check
 * @returns True for every slot except the driver roots
 */
export function isDisableableSkillSlot(name: SkillSlotName): boolean {
  return SKILL_SLOTS[name].alwaysOn !== true;
}
