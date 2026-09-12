// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The release built-in fragments, keyed by include name. `resolveIncludes`
// expands a driver root's includes against these (with any ~/.producer-pal/skills
// override shadowing a name).
//
// A fragment is DECLARED ONCE, in SKILL_SLOTS — that registry read as
// name → body is most of the map below, and skill-slots.ts is where the shape
// of the carve (drivers, task fragments, the depth and `-write` suffixes) is
// written down. The rest is `nonSlotFragments`: the fragments with no override
// slot, named one by one.

import { codeTransforms } from "#src/skills/fragments/transforms/code-transforms.ts";
import { SKILL_SLOTS } from "#src/skills/skill-slots.ts";

// Include names that resolve to another fragment's body. midi-json has one head
// for both depths; aliasing keeps the drivers' uniform `{notation}-{level}` ref
// working without a wrapper fragment (which depth-1 forbids), and it makes a
// user's single `midi-json.md` override apply at both depths.
const FRAGMENT_ALIASES: Record<string, string> = {
  "midi-json-standard": "midi-json",
  "midi-json-basic": "midi-json",
};

/**
 * Build the release built-in fragment map: every slot's built-in body, then the
 * non-slot fragments.
 *
 * @param enableCodeExec - Whether the experimental code-transform tool is on
 *   (defaults to the `ENABLE_CODE_EXEC` env, matching the debug build). When
 *   off, `code-transforms` is present but empty.
 * @returns Fragment name → built-in body
 */
export function builtinFragments(
  enableCodeExec: boolean = process.env.ENABLE_CODE_EXEC === "true",
): Record<string, string> {
  const fragments: Record<string, string> = {};

  for (const [name, slot] of Object.entries(SKILL_SLOTS)) {
    fragments[name] = slot.builtIn;
  }

  return { ...fragments, ...nonSlotFragments(enableCodeExec) };
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

/**
 * The built-in fragments with no override slot — nothing about them is stable
 * enough for a user to customize. Each is PRESENT rather than absent: the
 * resolver warns about an unknown fragment (that is how a stale driver override
 * gets caught), so every name a driver can reach has to resolve.
 *
 * `code-transforms` only carries text in a code-execution build. The two
 * midi-json `-write` names are empty because midi-json is symmetric enough not
 * to be split, while both drivers' `-write` ref is notation-templated; the alias
 * map can't do this job — it folds two DEPTH refs onto one body, and there is no
 * body here to fold onto.
 *
 * @param enableCodeExec - Whether the experimental code-transform tool is on
 * @returns Fragment name → built-in body
 */
function nonSlotFragments(enableCodeExec: boolean): Record<string, string> {
  return {
    "code-transforms": enableCodeExec ? codeTransforms : "",
    "midi-json-standard-write": "",
    "midi-json-basic-write": "",
  };
}
