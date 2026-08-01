// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The release built-in skills fragments, keyed by include name. `resolveIncludes`
// expands a driver root's includes against these (with any ~/.producer-pal/skills
// override shadowing a name).
//
// The shape is two levels, and only two:
//   standard / basic .......... driver roots (chosen by small-model mode). See
//                               drivers.ts — `standard` is a bare include
//                               manifest, `basic` inlines its short body.
//   everything else ........... a leaf. Fragments are cut along TASK lines
//                               (subject / direction / audience), so a subagent
//                               worker or a user with a checkbox can take the
//                               ones a job actually needs. Depth is a variant,
//                               not a boundary: a fragment that exists at both
//                               depths (notation heads, context, transforms)
//                               carries the `-standard` / `-basic` suffix —
//                               except transforms, whose standard depth is three
//                               fragments, so only the basic one is suffixed.
//                               Small-model mode means FEWER fragments, not
//                               basic variants of all of them.
//
// A notation head may also carry a `-write` SIBLING holding the syntax only the
// clip writers can act on, so a read-only caller stops paying for the authoring
// guide (ADR-0019). The base name keeps its meaning — that is what lets the
// standard driver's `{notation}-standard` ref stay put — and each notation opts
// in separately. bar|beat is split; stark and midi-json are not, so their
// `-write` refs resolve to an empty body (below).
//
// Two entries are not quite leaves-as-written:
//   code-transforms ........... build-gated. It is always PRESENT here and empty
//                               when disabled, rather than absent: the resolver
//                               now warns about an unknown fragment (that is how
//                               a stale driver override gets caught), so absence
//                               must stay a real error.
//   midi-json ................. level-invariant, so the drivers' uniform
//                               `{notation}-{level}` ref is folded onto the one
//                               body by an ALIAS (below) rather than by a
//                               wrapper fragment that would need nesting.

import { basicDriver, standardDriver } from "#src/skills/drivers.ts";
import { arrangement } from "#src/skills/fragments/arrangement.ts";
import { codeTransforms } from "#src/skills/fragments/code-transforms.ts";
import {
  contextBasic,
  contextStandard,
} from "#src/skills/fragments/context.ts";
import { devices } from "#src/skills/fragments/devices.ts";
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

// Include names that resolve to another fragment's body. midi-json has one head
// for both depths; aliasing keeps the drivers' uniform `{notation}-{level}` ref
// working without a wrapper fragment (which depth-1 forbids), and it makes a
// user's single `midi-json.md` override apply at both depths.
const FRAGMENT_ALIASES: Record<string, string> = {
  "midi-json-standard": "midi-json",
  "midi-json-basic": "midi-json",
};

/**
 * Build the release built-in fragment map.
 *
 * @param enableCodeExec - Whether the experimental code-transform tool is on
 *   (defaults to the `ENABLE_CODE_EXEC` env, matching the debug build). When
 *   off, `code-transforms` is present but empty.
 * @returns Fragment name → built-in body
 */
export function builtinFragments(
  enableCodeExec: boolean = process.env.ENABLE_CODE_EXEC === "true",
): Record<string, string> {
  return {
    standard: standardDriver,
    basic: basicDriver,

    "time-and-values": timeAndValues,
    "transforms-core": transformsCore,
    "transforms-expressions": transformsExpressions,
    "transforms-generative": transformsGenerative,
    "transforms-basic": transformsBasic,
    "code-transforms": enableCodeExec ? codeTransforms : "",
    library,
    devices,
    "specialized-devices": specializedDevices,
    arrangement,
    "working-with-live": workingWithLive,
    "context-standard": contextStandard,
    "context-basic": contextBasic,
    "getting-help": gettingHelp,
    "getting-help-basic": gettingHelpBasic,

    "barbeat-standard": barbeatStandard,
    "barbeat-standard-write": barbeatStandardWrite,
    "barbeat-basic": barbeatBasic,
    "stark-standard": starkStandard,
    "stark-basic": starkBasic,
    "midi-json": midiJson,

    // Present-but-empty, the code-transforms precedent: the standard driver's
    // `-write` ref is notation-templated, and these two heads aren't split, so
    // their authoring content stays inline in the head above. Registering the
    // names keeps an unknown fragment a real error rather than a shrug.
    "stark-standard-write": "",
    "midi-json-standard-write": "",
  };
}

/**
 * Fold an include name onto the fragment that actually carries its body. Applied
 * before BOTH the override and built-in lookups, so an alias resolves to the
 * same slot a user edits.
 *
 * Names come from user text (an `@include` ref, an override filename), so the
 * `hasOwn` guard is load-bearing: a bare `FRAGMENT_ALIASES[name] ?? name` hands
 * back `Object.prototype.toString` for `@include "./toString.md"` — a function
 * from a string-typed function, which would then be stringified into the lookup
 * key and the warning text.
 *
 * @param name - The include name as written (post `{notation}` interpolation)
 * @returns The name to look up
 */
export function resolveFragmentAlias(name: string): string {
  // hasOwn doesn't narrow an index signature; the key is present by the check.
  return Object.hasOwn(FRAGMENT_ALIASES, name)
    ? (FRAGMENT_ALIASES[name] as string)
    : name;
}
