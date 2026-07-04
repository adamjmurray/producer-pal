// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Resolves the `@include "./name.md"` directives that compose the Producer Pal
// Skills out of small fragments. A driver fragment (standard / basic) pulls in a
// notation head and the shared core body; the core body in turn pulls in
// optional pieces (code transforms). Every fragment resolves the same way — the
// user's ~/.producer-pal/skills override if present, else the release built-in —
// so the SAME include graph an author edits in the repo is the graph a user
// edits on disk. Resolution is pure: the caller injects `lookup`, which is where
// the override-vs-built-in and (Node-side) filesystem decisions live.
//
// Constraints, by design (see the skills-include discussion):
//   - No conditionals in the directive language. Optional content (code
//     transforms) is gated by whether its fragment EXISTS in the lookup, not by
//     a directive — a missing fragment resolves to "".
//   - No loops. A fragment that includes itself (directly or transitively) is a
//     cycle: it is dropped with a warning, never expanded.
//   - Paths stay within the skills dir. Refs starting with `/`, `.`, `..`, or
//     `~`, or containing `..`, are rejected here; the Node-side lookup is also
//     scoped to the skills dir, so traversal is impossible even if this missed.

import { type Notation } from "#src/shared/notation.ts";

/** Matches a single `@include "<ref>"` directive; ref is captured group 1. */
const INCLUDE_PATTERN = /@include\s+"([^\n"]*)"/g;

/** Backstop against pathological nesting even absent a true cycle. */
const MAX_INCLUDE_DEPTH = 16;

/** Injected context for {@link resolveIncludes}. */
export interface ResolveIncludesOptions {
  /** Active notation, interpolated into `{notation}` in include refs. */
  notation: Notation;
  /**
   * Resolve a fragment name to its body: the user override if present, else the
   * built-in, else null (treated as "" — the same silent absence the old
   * ENABLE_CODE_EXEC gate produced).
   */
  lookup: (name: string) => string | null;
  /** Optional sink for non-fatal warnings (cycles, rejected paths). */
  onWarn?: (message: string) => void;
}

/**
 * Assemble a fragment and everything it includes into one string. Walks the
 * include graph depth-first, expanding each `@include "./name.md"` to the
 * resolved body of `name`. Unknown fragments and rejected/cyclic refs expand to
 * "" so a partial graph still produces usable output.
 *
 * @param root - The entry fragment name (e.g. "standard" or "basic")
 * @param options - Injected notation, lookup, and warning sink
 * @returns The fully-expanded skills string
 */
export function resolveIncludes(
  root: string,
  options: ResolveIncludesOptions,
): string {
  return expandFragment(root, options, []);
}

// --- Helpers below main export ---

/**
 * Expand one fragment, recursing into its includes. `stack` is the current
 * resolution path (root → … → this fragment); a name already on it is a cycle.
 * Diamonds (the same fragment reached by two distinct paths) are fine — only a
 * name reappearing on its OWN path is refused.
 *
 * @param name - Fragment name to expand
 * @param options - Injected notation, lookup, and warning sink
 * @param stack - Fragment names on the current resolution path
 * @returns The expanded body ("" for missing, cyclic, or too-deep fragments)
 */
function expandFragment(
  name: string,
  options: ResolveIncludesOptions,
  stack: readonly string[],
): string {
  if (stack.length >= MAX_INCLUDE_DEPTH) {
    options.onWarn?.(
      `skills include depth exceeded (>${MAX_INCLUDE_DEPTH}) at "${name}"`,
    );

    return "";
  }

  if (stack.includes(name)) {
    options.onWarn?.(
      `skills include cycle refused: ${[...stack, name].join(" → ")}`,
    );

    return "";
  }

  const body = options.lookup(name);

  // Treat any non-string body as absent → "". Beyond the usual missing-fragment
  // null, this catches an inherited Object.prototype member surfacing through a
  // naive `map[name]` lookup — `@include "./constructor.md"` (or `__proto__`,
  // `toString`, …) with no such fragment would otherwise return a function and
  // crash on `.replaceAll` instead of resolving to nothing.
  if (typeof body !== "string") return "";

  const nextStack = [...stack, name];

  return body.replaceAll(INCLUDE_PATTERN, (_match, rawRef: string) => {
    const ref = normalizeIncludeRef(rawRef, options.notation);

    if (ref == null) {
      options.onWarn?.(`skills include rejected unsafe path: "${rawRef}"`);

      return "";
    }

    return expandFragment(ref, options, nextStack);
  });
}

/**
 * Turn a raw include ref into a fragment name, or null when it is unsafe.
 * Interpolates `{notation}`, drops a leading `./` and a trailing `.md`, and
 * rejects anything that could escape the skills dir.
 *
 * @param rawRef - The ref exactly as written in the directive
 * @param notation - Active notation for `{notation}` interpolation
 * @returns The bare fragment name, or null when the ref is rejected
 */
function normalizeIncludeRef(
  rawRef: string,
  notation: Notation,
): string | null {
  const interpolated = rawRef.replaceAll("{notation}", notation);
  const withoutPrefix = interpolated.startsWith("./")
    ? interpolated.slice(2)
    : interpolated;

  if (!isSafeIncludeRef(withoutPrefix)) return null;

  return withoutPrefix.endsWith(".md")
    ? withoutPrefix.slice(0, -3)
    : withoutPrefix;
}

/**
 * Whether a `./`-stripped ref is safe to resolve within the skills dir. Rejects
 * empty refs, absolute/home paths, hidden or parent-relative names, and any
 * traversal, backslash, or NUL — the "no `/ . .. ~` prefixes" rule.
 *
 * @param ref - The ref with any leading `./` already removed
 * @returns True when the ref stays inside the skills dir
 */
function isSafeIncludeRef(ref: string): boolean {
  if (ref === "") return false;
  if (/^[./~]/.test(ref)) return false;
  if (ref.includes("..")) return false;

  return !ref.includes("\\") && !ref.includes("\0");
}
