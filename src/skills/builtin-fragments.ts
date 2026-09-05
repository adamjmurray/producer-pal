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
// A fragment may also carry a `-write` SIBLING holding what only the writers can
// act on, so a read-only caller stops paying for it (ADR-0019). The base name
// keeps its meaning — that is what lets the drivers' `{notation}-{level}` ref
// stay put — so splitting one costs no rename. Each candidate opts in
// separately: bar|beat (both depths), stark (both depths), devices, and
// arrangement are split; midi-json is symmetric enough that splitting it would
// buy nothing, so its `-write` refs resolve to an empty body (below).
//
// Subjects that grew past a file or two get a fragments/ subfolder — transforms
// and devices so far. Filenames keep their full fragment name inside it
// (`transforms/transforms-core.ts`), stutter and all: the name is the include
// ref and the user's override slot, so shortening it to match the folder would
// hide the one thing a reader needs to match up.
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
import {
  arrangement,
  arrangementBasic,
  arrangementWrite,
} from "#src/skills/fragments/arrangement.ts";
import { codeTransforms } from "#src/skills/fragments/transforms/code-transforms.ts";
import {
  contextBasic,
  contextStandard,
} from "#src/skills/fragments/context.ts";
import {
  devices,
  devicesWrite,
} from "#src/skills/fragments/devices/devices.ts";
import {
  gettingHelp,
  gettingHelpBasic,
} from "#src/skills/fragments/getting-help.ts";
import { library } from "#src/skills/fragments/library.ts";
import { objectPaths } from "#src/skills/fragments/object-paths.ts";
import { specializedDevices } from "#src/skills/fragments/devices/specialized-devices.ts";
import { timeAndValues } from "#src/skills/fragments/time-and-values.ts";
import {
  transformsBasic,
  transformsCore,
  transformsEditing,
} from "#src/skills/fragments/transforms/transforms-core.ts";
import { transformsExpressions } from "#src/skills/fragments/transforms/transforms-expressions.ts";
import { transformsGenerative } from "#src/skills/fragments/transforms/transforms-generative.ts";
import { workingWithLive } from "#src/skills/fragments/working-with-live.ts";
import {
  barbeatBasic,
  barbeatBasicWrite,
} from "#src/skills/notation/barbeat-basic.ts";
import {
  barbeatStandard,
  barbeatStandardWrite,
} from "#src/skills/notation/barbeat-standard.ts";
import { midiJson } from "#src/skills/notation/midi-json.ts";
import {
  starkBasic,
  starkBasicWrite,
  starkStandard,
  starkStandardWrite,
} from "#src/skills/notation/stark.ts";

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
    "transforms-editing": transformsEditing,
    "transforms-expressions": transformsExpressions,
    "transforms-generative": transformsGenerative,
    "transforms-basic": transformsBasic,
    "code-transforms": enableCodeExec ? codeTransforms : "",
    library,
    devices,
    "devices-write": devicesWrite,
    "specialized-devices": specializedDevices,
    arrangement,
    "arrangement-write": arrangementWrite,
    "arrangement-basic": arrangementBasic,

    "object-paths": objectPaths,

    "working-with-live": workingWithLive,
    "context-standard": contextStandard,
    "context-basic": contextBasic,
    "getting-help": gettingHelp,
    "getting-help-basic": gettingHelpBasic,

    "barbeat-standard": barbeatStandard,
    "barbeat-standard-write": barbeatStandardWrite,
    "barbeat-basic": barbeatBasic,
    "barbeat-basic-write": barbeatBasicWrite,
    "stark-standard": starkStandard,
    "stark-standard-write": starkStandardWrite,
    "stark-basic": starkBasic,
    "stark-basic-write": starkBasicWrite,
    "midi-json": midiJson,

    // Present-but-empty, the code-transforms precedent: both drivers' `-write`
    // ref is notation-templated, and midi-json isn't split, so registering the
    // names keeps an unknown fragment a real error rather than a shrug. The
    // alias map above can't do this job — it folds the two DEPTH refs onto one
    // body, and there is no body here to fold onto.
    "midi-json-standard-write": "",
    "midi-json-basic-write": "",
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
