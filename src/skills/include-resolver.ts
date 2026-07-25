// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Resolves the `@include "./name.md"` directives that compose the Producer Pal
// Skills out of small fragments. A driver fragment (standard / basic) pulls in a
// notation head and the task-line fragments. Every fragment resolves the same
// way — the user's ~/.producer-pal/skills override if present, else the release
// built-in — so the SAME include graph an author edits in the repo is the graph
// a user edits on disk. Resolution is pure: the caller injects `lookup`, which
// is where the override-vs-built-in and (Node-side) filesystem decisions live.
//
// Constraints, by design (see the skills-include discussion):
//   - No conditionals in the directive language. A build-gated fragment
//     (code-transforms) resolves to an EMPTY body rather than being absent, so
//     absence stays a real error worth warning about.
//   - **Depth-1 only.** A driver includes fragments; a fragment includes
//     nothing. An include inside an included fragment is dropped with a warning.
//     This is not merely a convention we happen to follow: fragment bodies are
//     arbitrary user text, and if nesting were allowed a user override could
//     reintroduce it — then unchecking one box silently drops two fragments and
//     "this fragment costs 751 tokens" stops being true. Since the whole point
//     of the carve is token management, *a fragment's cost is its own length*
//     has to be an invariant. Forbidding it also deletes cycle detection, the
//     depth cap, and the diamond question — none can arise at depth 1.
//   - Paths stay within the skills dir. Refs starting with `/`, `.`, `..`, or
//     `~`, or containing `..`, are rejected here; the Node-side lookup is also
//     scoped to the skills dir, so traversal is impossible even if this missed.

import { type Notation } from "#src/shared/notation.ts";

/** Matches a single `@include "<ref>"` directive; ref is captured group 1. */
const INCLUDE_PATTERN = /@include\s+"([^\n"]*)"/g;

/** Runs of 3+ newlines left by a fragment that resolved to nothing. */
const BLANK_LINE_RUN = /\n{3,}/g;

/** Injected context for {@link resolveIncludes}. */
export interface ResolveIncludesOptions {
  /** Active notation, interpolated into `{notation}` in include refs. */
  notation: Notation;
  /**
   * Resolve a fragment name to its body: the user override if present, else the
   * built-in, else null (an unknown fragment — warned about, expands to "").
   */
  lookup: (name: string) => string | null;
  /** Optional sink for non-fatal warnings (unknown names, rejected paths). */
  onWarn?: (message: string) => void;
  /**
   * Optional sink called once per include that resolved to a known fragment,
   * in document order. This is how a caller learns WHICH fragments a document
   * actually composed — needed to check a fragment's declared prerequisites,
   * which the resolver itself has no opinion about.
   */
  onFragment?: (name: string) => void;
}

/**
 * Assemble a driver and the fragments it includes into one string. Each
 * `@include "./name.md"` in the driver expands to that fragment's body;
 * directives INSIDE a fragment are refused (depth-1). Unknown fragments and
 * rejected refs expand to "" with a warning, so a partial graph still produces
 * usable output.
 *
 * @param root - The entry fragment name (e.g. "standard" or "basic")
 * @param options - Injected notation, lookup, and warning sink
 * @returns The fully-expanded skills string
 */
export function resolveIncludes(
  root: string,
  options: ResolveIncludesOptions,
): string {
  const body = readFragment(root, options) ?? "";

  const expanded = body.replaceAll(
    INCLUDE_PATTERN,
    (_match, rawRef: string) => {
      const name = normalizeIncludeRef(rawRef, options.notation);

      if (name == null) {
        options.onWarn?.(`skills include rejected unsafe path: "${rawRef}"`);

        return "";
      }

      const included = readFragment(name, options);

      if (included == null) return "";

      options.onFragment?.(name);

      return stripNestedIncludes(included, name, options);
    },
  );

  // A fragment that resolved to nothing leaves the blank lines that framed its
  // include line stacked up. Collapse them so an emptied override (or a
  // release build's absent code-transforms) reads as a clean section break.
  return expanded.replaceAll(BLANK_LINE_RUN, "\n\n");
}

// --- Helpers below main export ---

/**
 * Look up one fragment's body, warning when the name resolves to nothing.
 * Silence here is what made the old rename hazard invisible: a driver override
 * naming a fragment that no longer exists produced a quietly shortened blob.
 *
 * @param name - Fragment name to read
 * @param options - Injected lookup and warning sink
 * @returns The fragment body, or null when the name is unknown
 */
function readFragment(
  name: string,
  options: ResolveIncludesOptions,
): string | null {
  const body = options.lookup(name);

  // Treat any non-string body as absent → "". Beyond the usual missing-fragment
  // null, this catches an inherited Object.prototype member surfacing through a
  // naive `map[name]` lookup — `@include "./constructor.md"` (or `__proto__`,
  // `toString`, …) with no such fragment would otherwise return a function and
  // crash on `.replaceAll` instead of resolving to nothing.
  if (typeof body !== "string") {
    options.onWarn?.(`skills include names an unknown fragment: "${name}"`);

    return null;
  }

  return body;
}

/**
 * Drop any `@include` directives inside an already-included fragment — the
 * depth-1 rule. Each one is warned about rather than expanded, so a user
 * override that nests gets told instead of silently changing what its parent
 * costs.
 *
 * @param body - The included fragment's body
 * @param name - That fragment's name, for the warning message
 * @param options - Injected warning sink
 * @returns The body with nested directives removed
 */
function stripNestedIncludes(
  body: string,
  name: string,
  options: ResolveIncludesOptions,
): string {
  return body.replaceAll(INCLUDE_PATTERN, (_match, rawRef: string) => {
    options.onWarn?.(
      `skills include nesting refused: "${name}" includes "${rawRef}" (fragments cannot include other fragments)`,
    );

    return "";
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
