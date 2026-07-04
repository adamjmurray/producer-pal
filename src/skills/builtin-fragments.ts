// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The release built-in skills fragments, keyed by include name. `resolveIncludes`
// walks these (with any ~/.producer-pal/skills override shadowing a name) from a
// driver root down to the leaves.
//
// The graph:
//   standard / basic ............ driver roots (chosen by small-model mode). Own
//                                 the "# Producer Pal Skills" header + the two
//                                 includes below, so the assembly order is
//                                 visible in the fragment a user copies to edit.
//     {notation}-standard ....... a notation head (barbeat-standard, stark-…);
//     {notation}-basic            midi-json is level-invariant, so its two names
//                                 are thin wrappers that both include midi-json.
//     core-standard / core-basic  the shared body. core-standard includes
//                                 code-transforms, which only EXISTS here when
//                                 ENABLE_CODE_EXEC is set — a missing fragment
//                                 resolves to "", so no directive-level branch.
//
// Header + notation-ordering are plain text/includes in the drivers, not glue in
// buildSkills; the seven notation/core fragment names remain the stable override
// slots (see skill-slots.ts).

import { codeTransformsSkills } from "#src/skills/code-transforms.ts";
import { coreBasic } from "#src/skills/core/core-basic.ts";
import { coreStandard } from "#src/skills/core/core-standard.ts";
import { barbeatBasic } from "#src/skills/notation/barbeat-basic.ts";
import { barbeatStandard } from "#src/skills/notation/barbeat-standard.ts";
import { midiJson } from "#src/skills/notation/midi-json.ts";
import { starkBasic, starkStandard } from "#src/skills/notation/stark.ts";

const HEADER = "# Producer Pal Skills";

/**
 * Standard-level driver: header + notation head + shared standard core. Exported
 * so the editor registry (skill-slots.ts) surfaces the SAME string as an
 * overridable slot — the include graph a user copies to fork is this text.
 */
export const standardDriver = `${HEADER}\n\n@include "./{notation}-standard.md"\n\n@include "./core-standard.md"`;

/** Small-model driver: header + notation head + shared basic core. */
export const basicDriver = `${HEADER}\n\n@include "./{notation}-basic.md"\n\n@include "./core-basic.md"`;

// midi-json has one head for both levels; these wrappers let the drivers use the
// uniform `{notation}-{level}` include name without duplicating the head.
const midiJsonWrapper = `@include "./midi-json.md"`;

/**
 * Build the release built-in fragment map. `code-transforms` is present only
 * when code execution is enabled, mirroring the old build-time gate — the
 * include for it resolves to "" when absent.
 *
 * @param enableCodeExec - Whether the experimental code-transform tool is on
 *   (defaults to the `ENABLE_CODE_EXEC` env, matching the debug build)
 * @returns Fragment name → built-in body
 */
export function builtinFragments(
  enableCodeExec: boolean = process.env.ENABLE_CODE_EXEC === "true",
): Record<string, string> {
  const fragments: Record<string, string> = {
    standard: standardDriver,
    basic: basicDriver,
    "core-standard": coreStandard,
    "core-basic": coreBasic,
    "barbeat-standard": barbeatStandard,
    "barbeat-basic": barbeatBasic,
    "stark-standard": starkStandard,
    "stark-basic": starkBasic,
    "midi-json": midiJson,
    "midi-json-standard": midiJsonWrapper,
    "midi-json-basic": midiJsonWrapper,
  };

  if (enableCodeExec) fragments["code-transforms"] = codeTransformsSkills;

  return fragments;
}
