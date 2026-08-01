// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { DEFAULT_NOTATION, type Notation } from "#src/shared/notation.ts";
import {
  builtinFragments,
  resolveFragmentAlias,
} from "#src/skills/builtin-fragments.ts";
import {
  audienceGatedFragments,
  gatedOutFragments,
  type SkillsAudience,
} from "#src/skills/fragment-tool-gates.ts";
import { fragmentRequires } from "#src/skills/fragment-requires.ts";
import { resolveIncludes } from "#src/skills/include-resolver.ts";
import { RETIRED_SKILL_SLOTS } from "#src/skills/skill-slots.ts";

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
  /**
   * Who this blob is for. A subagent worker additionally drops the
   * conversation-only fragments — guidance whose only purpose is to be said to a
   * person. Omit for the user-facing default.
   */
  audience?: SkillsAudience;
}

/**
 * The user's per-fragment customization (~/.producer-pal/skills/<name>.md) —
 * both axes of it, since one store read produces both.
 */
export interface SkillOverrides {
  /**
   * Override bodies keyed by include name. A present entry shadows that built-in
   * fragment; an absent one tracks the release default. Arbitrary names are
   * allowed — a user may override a driver, a notation head, or a fragment of
   * their own that a fork includes.
   */
  fragments?: Record<string, string>;
  /**
   * Fragment names the user switched OFF. A disabled fragment resolves to an
   * empty body with NO fallback to the built-in — which is what makes the switch
   * distinguishable from an empty override body (that one means "track the
   * built-in"). The include line stays valid; only the text goes.
   */
  disabled?: readonly string[];
}

/** An assembled blob plus what the runtime context dropped from it. */
export interface AssembledSkills {
  /** The skills string returned in the ppal-connect tool result. */
  skills: string;
  /**
   * Fragments this document referenced that the TOOLSET or AUDIENCE emptied, in
   * include order. The user's own off switches are excluded — those they can
   * already see in the editor; these are the ones nothing on screen explains.
   */
  dropped: string[];
}

/**
 * Assemble the Producer Pal Skills string for the active runtime context. Small-
 * model mode picks the driver root (`basic` vs `standard`); everything else —
 * the notation head and the task-line fragments — is composed by the `@include`
 * directives in that driver. Each fragment resolves to the user's override when
 * present, else the release built-in.
 *
 * A fragment whose tools are all disabled, whose audience isn't listening, or
 * that the user switched off resolves to an EMPTY body rather than being
 * skipped, matching how a release
 * build handles `code-transforms`: the driver's include line stays valid, so an
 * unknown fragment keeps meaning a stale reference worth warning about.
 * Suppression is applied AFTER the override lookup — a customized `library.md`
 * is just as dead as the built-in when the library tool is off.
 *
 * @param options - Runtime context ({@link BuildSkillsOptions}).
 * @param options.notation - The global notation setting (defaults to bar|beat).
 * @param options.smallModelMode - Whether small-model mode is active.
 * @param options.tools - The tools available to this caller (omit for no gating).
 * @param options.audience - Who the blob is for (omit for the user-facing chat).
 * @param overrides - Per-fragment user overrides (empty by default).
 * @param onWarn - Sink for non-fatal assembly warnings (unknown fragments,
 *   refused nesting, unsafe refs, overrides keyed to a retired slot name).
 *   Omitted by default; callers that can surface the problem (the Skills
 *   preview, the live inject) pass one so a broken user override doesn't
 *   degrade the blob silently.
 * @returns The skills string returned in the ppal-connect tool result.
 */
export function buildSkills(
  options: BuildSkillsOptions = {},
  overrides: SkillOverrides = {},
  onWarn?: (message: string) => void,
): string {
  return assembleSkills(options, overrides, onWarn).skills;
}

/**
 * Assemble as {@link buildSkills} does, and also report which of the document's
 * fragments the toolset or audience emptied. Separate from `buildSkills` because
 * only a surface that EXPLAINS the blob needs the second half — the live inject
 * wants the string and nothing else.
 *
 * @param options - Runtime context ({@link BuildSkillsOptions}).
 * @param options.notation - The global notation setting (defaults to bar|beat).
 * @param options.smallModelMode - Whether small-model mode is active.
 * @param options.tools - The tools available to this caller (omit for no gating).
 * @param options.audience - Who the blob is for (omit for the user-facing chat).
 * @param overrides - Per-fragment user overrides (empty by default).
 * @param onWarn - Sink for non-fatal assembly warnings.
 * @returns The blob and the fragments gating dropped from it.
 */
export function assembleSkills(
  {
    notation = DEFAULT_NOTATION,
    smallModelMode = false,
    tools,
    audience,
  }: BuildSkillsOptions = {},
  overrides: SkillOverrides = {},
  onWarn?: (message: string) => void,
): AssembledSkills {
  const builtIns = builtinFragments();
  const root = smallModelMode ? "basic" : "standard";
  const fragments = overrides.fragments ?? {};
  // Reported separately from the other two: a user's own off switch is already
  // visible as an unchecked box, while these have nothing on screen to explain
  // them.
  const gated = new Set([
    ...gatedOutFragments(tools),
    ...audienceGatedFragments(audience),
  ]);
  // Tool gating, audience gating, and the user's per-slot off switches empty a
  // fragment in exactly the same way, so all three resolve through one set.
  const suppressed = new Set([...gated, ...(overrides.disabled ?? [])]);

  warnRetiredOverrides(overrides, onWarn);

  const included = new Set<string>();
  const dropped = new Set<string>();
  const skills = resolveIncludes(root, {
    notation,
    lookup: (name) => {
      const key = resolveFragmentAlias(name);

      if (suppressed.has(key)) return "";

      return fragments[key] ?? builtIns[key] ?? null;
    },
    onWarn,
    // Record the canonical slot name, not the ref as written, so an aliased
    // include (midi-json-standard) is checked as the slot a user edits. A
    // SUPPRESSED fragment contributed nothing, so it must not count as present
    // below: switching `transforms-core` off while `transforms-expressions`
    // stays on is precisely the vocabulary-without-grammar case that warning
    // exists for. Gating alone can never produce it — a dependent's gate is a
    // subset of its prerequisite's — so this only bites on a user's own switch.
    onFragment: (name, body) => {
      const key = resolveFragmentAlias(name);

      if (suppressed.has(key)) {
        // Only fragments that would otherwise have carried text. `code-transforms`
        // in a release build, and the `-write` placeholders a notation without an
        // authoring half registers, are empty either way — reporting them as
        // "left out" describes a loss the caller never took.
        if (gated.has(key) && (fragments[key] ?? builtIns[key])) {
          dropped.add(key);
        }

        return;
      }

      // Same reason, in the other direction: a fragment that resolved to nothing
      // neither needs its prerequisites nor satisfies anyone else's.
      if (body.trim() !== "") included.add(key);
    },
  });

  warnUnmetRequirements(included, onWarn);

  return { skills, dropped: [...dropped] };
}

// --- Helpers below main export ---

/**
 * Warn when a document includes a fragment without the fragments it declares it
 * needs ({@link FRAGMENT_REQUIRES}).
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
    const missing = fragmentRequires(name).filter(
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
 * override never appears in any include. A retired name that is merely switched
 * off is equally inert, so both axes are checked.
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
  const customized = new Set([
    ...Object.keys(overrides.fragments ?? {}),
    ...(overrides.disabled ?? []),
  ]);

  for (const name of customized) {
    if (!Object.hasOwn(RETIRED_SKILL_SLOTS, name)) continue;

    // hasOwn doesn't narrow an index signature; the key is present by the check.
    const replacedBy = RETIRED_SKILL_SLOTS[name] as readonly string[];

    onWarn?.(
      `skills override "${name}.md" is no longer used — that fragment is now ${replacedBy.join(", ")}`,
    );
  }
}
