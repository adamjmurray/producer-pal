// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { DEFAULT_NOTATION, type Notation } from "#src/shared/notation.ts";
import {
  builtinFragments,
  resolveFragmentAlias,
} from "#src/skills/builtin-fragments.ts";
import { gatedOutFragments } from "#src/skills/fragment-tool-gates.ts";
import { resolveIncludes } from "#src/skills/include-resolver.ts";
import {
  isSkillSlotName,
  RETIRED_SKILL_SLOTS,
  SKILL_SLOTS,
} from "#src/skills/skill-slots.ts";

/** Runtime context that selects which skills variant is assembled. */
export interface BuildSkillsOptions {
  /** The global notation setting (defaults to bar|beat). */
  notation?: Notation;
  /** Whether small-model mode is active (selects the basic driver). */
  smallModelMode?: boolean;
  /**
   * The tools this caller can actually call. Fragments teaching only disabled
   * tools are dropped (see fragment-tool-gates.ts). Omit when the toolset isn't
   * known — every fragment then ships, which is the safe direction.
   */
  tools?: readonly string[];
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
 * the notation head and the task-line fragments — is composed by the `@include`
 * directives in that driver. Each fragment resolves to the user's override when
 * present, else the release built-in.
 *
 * A fragment whose tools are all disabled resolves to an EMPTY body rather than
 * being skipped, matching how a release build handles `code-transforms`: the
 * driver's include line stays valid, so an unknown fragment keeps meaning a
 * stale reference worth warning about. Gating is applied AFTER the override
 * lookup — a customized `library.md` is just as dead as the built-in when the
 * library tool is off.
 *
 * @param options - Runtime context ({@link BuildSkillsOptions}).
 * @param options.notation - The global notation setting (defaults to bar|beat).
 * @param options.smallModelMode - Whether small-model mode is active.
 * @param options.tools - The tools available to this caller (omit for no gating).
 * @param overrides - Per-fragment user overrides (empty by default).
 * @param onWarn - Sink for non-fatal assembly warnings (unknown fragments,
 *   refused nesting, unsafe refs, overrides keyed to a retired slot name).
 *   Omitted by default; callers that can surface the problem (the Skills
 *   preview, the live inject) pass one so a broken user override doesn't
 *   degrade the blob silently.
 * @returns The skills string returned in the ppal-connect tool result.
 */
export function buildSkills(
  {
    notation = DEFAULT_NOTATION,
    smallModelMode = false,
    tools,
  }: BuildSkillsOptions = {},
  overrides: SkillOverrides = {},
  onWarn?: (message: string) => void,
): string {
  const builtIns = builtinFragments();
  const root = smallModelMode ? "basic" : "standard";
  const gatedOut = gatedOutFragments(tools);

  warnRetiredOverrides(overrides, onWarn);

  const included = new Set<string>();
  const skills = resolveIncludes(root, {
    notation,
    lookup: (name) => {
      const key = resolveFragmentAlias(name);

      if (gatedOut.has(key)) return "";

      return overrides[key] ?? builtIns[key] ?? null;
    },
    onWarn,
    // Record the canonical slot name, not the ref as written, so an aliased
    // include (midi-json-standard) is checked as the slot a user edits.
    onFragment: (name) => included.add(resolveFragmentAlias(name)),
  });

  warnUnmetRequirements(included, onWarn);

  return skills;
}

// --- Helpers below main export ---

/**
 * Warn when a document includes a fragment without the fragments it declares it
 * needs ({@link SkillSlotDef.requires}).
 *
 * Deleting one include line is the documented way to trim skills, and the
 * dependent cases used to fail in the worst way available: silently, and with
 * the *vocabulary* kept while the *grammar* went. Dropping transforms-core left
 * the model holding `swing()`, `ratchet()`, and the waveform catalog with no
 * `[selector:] param op expr` shape and nothing saying transforms attach to
 * create-clip — strictly worse than dropping all three tiers. Nothing else can
 * catch it: every include still resolved, so the resolver had nothing to
 * report.
 *
 * @param included - Canonical names of the fragments the document composed
 * @param onWarn - Warning sink (no-op when the caller passed none)
 */
function warnUnmetRequirements(
  included: ReadonlySet<string>,
  onWarn?: (message: string) => void,
): void {
  for (const name of included) {
    if (!isSkillSlotName(name)) continue;

    const missing = (SKILL_SLOTS[name].requires ?? []).filter(
      (required) => !included.has(required),
    );

    if (missing.length > 0) {
      const needed = missing.map(quoted).join(", ");

      onWarn?.(
        `skills fragment "${name}" needs ${needed}, which this document does not include — its guidance has no syntax to attach to`,
      );
    }
  }
}

/**
 * Wrap a fragment name in quotes for a warning message.
 *
 * @param name - Fragment name
 * @returns The name in double quotes
 */
function quoted(name: string): string {
  return `"${name}"`;
}

/**
 * Warn about override files keyed to a slot name the fragment re-carve retired.
 * Nothing references those names any more, so the override is inert — and inert
 * is exactly what a user cannot see. The resolver can't catch this: an orphaned
 * override never appears in any include.
 *
 * Override names are FILENAMES from ~/.producer-pal/skills, so `hasOwn` is
 * load-bearing rather than defensive: a file named `toString.md` would otherwise
 * find `Object.prototype.toString`, pass a `!= null` test, and throw on `.join`
 * — and this runs before assembly with no try/catch above it, so it would fail
 * the whole ppal-connect call. Same hazard the resolver's lookup guards.
 *
 * @param overrides - The user's per-fragment overrides
 * @param onWarn - Warning sink (no-op when the caller passed none)
 */
function warnRetiredOverrides(
  overrides: SkillOverrides,
  onWarn?: (message: string) => void,
): void {
  for (const name of Object.keys(overrides)) {
    if (!Object.hasOwn(RETIRED_SKILL_SLOTS, name)) continue;

    // hasOwn doesn't narrow an index signature; the key is present by the check.
    const replacedBy = RETIRED_SKILL_SLOTS[name] as readonly string[];

    onWarn?.(
      `skills override "${name}.md" is no longer used — that fragment is now ${replacedBy.join(", ")}`,
    );
  }
}
