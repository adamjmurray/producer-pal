// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The release built-in skills fragments, keyed by include name. `resolveIncludes`
// walks these (with any ~/.producer-pal/skills override shadowing a name) from a
// driver root down to the leaves.
//
// The graph:
//   standard / basic ............ driver roots (chosen by small-model mode). Each
//                                 is the "# Producer Pal Skills" header followed
//                                 by the shared core body INLINED (coreStandard /
//                                 coreBasic), so the whole document is the fragment
//                                 a user copies to edit. The core body carries the
//                                 notation `@include` inside it, so the notation
//                                 guide can be positioned anywhere in the text.
//     {notation}-standard ....... a notation head (barbeat-standard, stark-…);
//     {notation}-basic            midi-json is level-invariant, so its two names
//                                 are thin wrappers that both include midi-json.
//     core-transforms ........... the standard core's task-oriented sections,
//     core-library                pulled in by coreStandard's include manifest so
//     core-devices                a driver override can suppress one by deleting
//     core-arrangement            its include line. core-transforms in turn
//                                 includes code-transforms, which only EXISTS
//                                 here when ENABLE_CODE_EXEC is set — a missing
//                                 fragment resolves to "", so no directive-level
//                                 branch. (The basic core stays fully inlined.)
//
// Header + core are plain text in the drivers, not glue in buildSkills; the
// notation and core-section fragment names are stable override slots (see
// skill-slots.ts). The core body itself is not a slot — what remains inline
// (units, workflow, memory, help) is edited by overriding the driver.

import { codeTransformsSkills } from "#src/skills/code-transforms.ts";
import { coreArrangement } from "#src/skills/core/core-arrangement.ts";
import { coreBasic } from "#src/skills/core/core-basic.ts";
import { coreDevices } from "#src/skills/core/core-devices.ts";
import { coreLibrary } from "#src/skills/core/core-library.ts";
import { coreStandard } from "#src/skills/core/core-standard.ts";
import { coreTransforms } from "#src/skills/core/core-transforms.ts";
import { barbeatBasic } from "#src/skills/notation/barbeat-basic.ts";
import { barbeatStandard } from "#src/skills/notation/barbeat-standard.ts";
import { midiJson } from "#src/skills/notation/midi-json.ts";
import { starkBasic, starkStandard } from "#src/skills/notation/stark.ts";

const HEADER = "# Producer Pal Skills";

/**
 * Standard-level driver: header + the standard core body inlined (which carries
 * the notation `@include` inside it). Exported so the editor registry
 * (skill-slots.ts) surfaces the SAME string as an overridable slot — the whole
 * document a user copies to fork is this text.
 */
export const standardDriver = `${HEADER}\n\n${coreStandard}`;

/** Small-model driver: header + the basic core body inlined (notation include within). */
export const basicDriver = `${HEADER}\n\n${coreBasic}`;

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
    "core-transforms": coreTransforms,
    "core-library": coreLibrary,
    "core-devices": coreDevices,
    "core-arrangement": coreArrangement,
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
