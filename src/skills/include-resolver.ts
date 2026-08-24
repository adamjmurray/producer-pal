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

/**
 * Matches a single `@include "<ref>"` directive (ref is group 1) plus the
 * newline run after it (group 2), so an expansion can take the blank line that
 * framed its include line with it.
 */
const INCLUDE_LINE_PATTERN = /@include\s+"([^\n"]*)"(\n*)/g;

/** A 3+ newline run at the join between an expansion and what followed it. */
const SEAM_BLANK_RUN = /\n{3,}$/;

/** An expansion's own leading newlines, which join what came before it. */
const LEADING_NEWLINES = /^\n+/;

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
   * in document order, with the body it resolved to. This is how a caller learns
   * WHICH fragments a document actually composed — needed to check a fragment's
   * declared prerequisites, which the resolver itself has no opinion about. The
   * body comes along because a fragment that resolved to nothing composed
   * nothing: a build-gated one, or a user's off switch.
   */
  onFragment?: (name: string, body: string) => void;
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

  return expandDirectives(body, (rawRef) => expandInclude(rawRef, options));
}

// --- Helpers below main export ---

/** Where an include line sits relative to the text already emitted before it. */
interface Seam {
  /** Nothing but a line break (or nothing at all) precedes the directive. */
  atLineStart: boolean;
  /** A blank line (or nothing at all) precedes the directive. */
  blankBefore: boolean;
}

/**
 * Replace every `@include` line in `text` with what `expand` returns for it,
 * tidying only the seams (see {@link joinExpansion}). Shared by the driver pass
 * and the depth-1 refusal pass, so refusing a nested include leaves the same
 * clean section break an expansion of nothing does.
 *
 * Each seam is read from what has been EMITTED so far, not from the original
 * text: a run of adjacent include lines that expanded to nothing has to look
 * like the blank line it collapsed to, or every one after the first re-adds a
 * separator for a line that is no longer there.
 *
 * @param text - The text to expand directives in
 * @param expand - What one directive's ref expands to ("" for nothing)
 * @returns The text with every directive replaced
 */
function expandDirectives(
  text: string,
  expand: (rawRef: string) => string,
): string {
  let out = "";
  let cursor = 0;

  for (const match of text.matchAll(INCLUDE_LINE_PATTERN)) {
    const [directive, rawRef = "", trailing = ""] = match;

    out += text.slice(cursor, match.index);
    cursor = match.index + directive.length;
    out += joinExpansion(expand(rawRef), trailing, {
      atLineStart: out === "" || out.endsWith("\n"),
      blankBefore: out === "" || out.endsWith("\n\n"),
    });
  }

  return out + text.slice(cursor);
}

/**
 * Expand one directive to the fragment body it names, or "" when the ref is
 * unsafe, the name unknown, or the fragment resolved to nothing.
 *
 * @param rawRef - The ref exactly as written in the directive
 * @param options - Injected notation, lookup, and sinks
 * @returns The fragment's body, with any nested directives stripped
 */
function expandInclude(
  rawRef: string,
  options: ResolveIncludesOptions,
): string {
  const name = normalizeIncludeRef(rawRef, options.notation);

  if (name == null) {
    options.onWarn?.(`skills include rejected unsafe path: "${rawRef}"`);

    return "";
  }

  const included = readFragment(name, options);

  if (included == null) return "";

  options.onFragment?.(name, included);

  return stripNestedIncludes(included, name, options);
}

/**
 * Put an expansion back where its include line was, tidying only the seams.
 *
 * An expansion of nothing takes the blank line that framed the directive with
 * it, so an emptied override (or a release build's absent code-transforms)
 * reads as a clean section break — but only when the text before the directive
 * has a blank line of its own to fall back on. Take the last separator and the
 * paragraphs on either side merge into one.
 *
 * Otherwise the expansion keeps its own text verbatim, apart from newlines at
 * the two seams. Collapsing blank runs across the whole document would rewrite
 * a 3+ newline run INSIDE a user's fragment, e.g. inside a fenced example.
 *
 * @param expansion - The fragment body, or "" when nothing resolved
 * @param trailing - The newline run that followed the include line
 * @param seam - Where the include line sat in the text emitted so far
 * @returns The text to substitute for the directive and its trailing newlines
 */
function joinExpansion(
  expansion: string,
  trailing: string,
  seam: Seam,
): string {
  if (expansion === "") {
    // A mid-line directive never owned a line, so there is no framing blank
    // line to take: eating one would pull the next paragraph up into whatever
    // else the line held (a list item, say).
    if (!seam.atLineStart) return trailing;

    return seam.blankBefore || trailing.length < 2 ? "" : "\n";
  }

  // Trim the expansion's own leading newlines against what sits in front of the
  // directive, so the two can't add up to a double blank line.
  const body = expansion.replace(
    LEADING_NEWLINES,
    seam.blankBefore ? "" : "\n",
  );

  if (trailing === "") return body;

  return (body + trailing).replace(SEAM_BLANK_RUN, "\n\n");
}

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
 * costs. Removed line and all, like any other expansion of nothing.
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
  return expandDirectives(body, (rawRef) => {
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
