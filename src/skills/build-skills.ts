// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { DEFAULT_NOTATION, type Notation } from "#src/shared/notation.ts";
import { builtinFragments } from "#src/skills/builtin-fragments.ts";
import { resolveIncludes } from "#src/skills/include-resolver.ts";

/** Runtime context that selects which skills variant is assembled. */
export interface BuildSkillsOptions {
  /** The global notation setting (defaults to bar|beat). */
  notation?: Notation;
  /** Whether small-model mode is active (selects the basic driver). */
  smallModelMode?: boolean;
}

/**
 * Per-fragment user overrides (~/.producer-pal/skills/<name>.md), keyed by
 * include name. A present entry shadows that built-in fragment; an absent one
 * tracks the release default. Arbitrary names are allowed — a user may override
 * a driver, a notation head, or a fragment of their own that a fork includes.
 */
export type SkillOverrides = Record<string, string>;

/**
 * Assemble the Producer Pal Skills string for the active runtime context. Small-
 * model mode picks the driver root (`basic` vs `standard`); everything else —
 * the header, the notation head, the shared core, code transforms — is composed
 * by the `@include` directives inside those fragments. Each fragment resolves to
 * the user's override when present, else the release built-in.
 *
 * @param options - Runtime context ({@link BuildSkillsOptions}).
 * @param options.notation - The global notation setting (defaults to bar|beat).
 * @param options.smallModelMode - Whether small-model mode is active.
 * @param overrides - Per-fragment user overrides (empty by default).
 * @returns The skills string returned in the ppal-connect tool result.
 */
export function buildSkills(
  {
    notation = DEFAULT_NOTATION,
    smallModelMode = false,
  }: BuildSkillsOptions = {},
  overrides: SkillOverrides = {},
): string {
  const builtIns = builtinFragments();
  const root = smallModelMode ? "basic" : "standard";

  return resolveIncludes(root, {
    notation,
    lookup: (name) => overrides[name] ?? builtIns[name] ?? null,
  });
}
