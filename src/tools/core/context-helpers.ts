// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { requestNode } from "#src/live-api-adapter/node-request-v8-protocol.ts";
import { backupProjectContextOnEdit } from "#src/live-api-adapter/project-context-sync.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { detachWarningCapture } from "#src/shared/max/v8-warning-capture.ts";

export interface ContentResult {
  content: string;
}

/**
 * Handle read action for the project context blob.
 * @param context - The context object
 * @returns Content result with the project context
 */
export function handleReadProjectContext(
  context: Partial<ToolContext> = {},
): ContentResult {
  return { content: context.projectContext?.content ?? "" };
}

/**
 * Handle write action for the project context blob.
 * @param content - Project context content to write
 * @param context - The context object
 * @param force - Replace the document even when the write keeps none of it
 * @returns Content result with the updated project context
 */
export function handleWriteProjectContext(
  content: string | undefined,
  context: Partial<ToolContext> = {},
  force = false,
): ContentResult {
  // "" is a valid clear; only an omitted content param is rejected so an
  // accidental write can't silently wipe the context.
  if (content == null) {
    throw new Error("Content required for write action");
  }

  const existing = context.projectContext?.content ?? "";

  if (!force) {
    const warning = clobberWarning("project", existing, content);

    if (warning != null) {
      console.warn(warning);

      return { content: existing };
    }
  }

  const projectContext = context.projectContext;

  if (projectContext) {
    projectContext.content = content;
  }

  // Send update to Max patch via outlet
  outlet(0, "update_project_context", content);

  // That outlet updates the device UI silently (the patch routes it through
  // `prepend set`), so this write never re-enters V8's projectContext() setter
  // the way a device-UI or webui edit does — nothing else here would back it
  // up. Waiting for the next tool call's sync is not an option either: a sync
  // is not a write, so it can no longer overwrite a differing sidecar, and a
  // write that is the last tool call of a session would never reach disk at
  // all. Fire-and-forget, like the setter: the write is Node-side and must not
  // block the tool result, and requestNode never rejects so this can't throw.
  // Detached because a void-ed async call is a suspension point in its caller —
  // see v8-warning-capture.ts rule 3.
  detachWarningCapture(() => backupProjectContextOnEdit(content));

  return { content };
}

/**
 * Read the machine-global context (~/.producer-pal/context.md). V8 has no
 * filesystem access, so this round-trips to the Node side over the RPC bridge.
 *
 * @returns Content result with the current global context
 */
export async function handleReadGlobalContext(): Promise<ContentResult> {
  return await callNodeContentRoute("globalContext.read", {});
}

/**
 * Read one indexed memory entry (~/.producer-pal/memory/&lt;name&gt;.md) by name,
 * over the RPC bridge. Backs the `memory` scope's `read` action.
 *
 * @param name - The memory name/slug to read
 * @returns Content result with the entry body, or a not-found note
 */
export async function handleReadMemoryEntry(
  name: string,
): Promise<ContentResult> {
  return await callNodeContentRoute("memory.read", { name });
}

/**
 * Create or overwrite an indexed memory entry, then re-derive the index. The
 * Node side owns slug validation and index regeneration. Backs scope:memory
 * `write` (a name'd entry upsert). The wire route is still named
 * `memory.remember` — an internal identifier left for the terminology sweep, so
 * it doesn't reach the AI.
 *
 * @param args - The memory to store
 * @param args.name - Desired memory name (slugified Node-side)
 * @param args.description - One-line recall hook (required)
 * @param args.content - The memory body (the fact)
 * @returns Content result with the regenerated index
 */
export async function handleWriteMemoryEntry(args: {
  name?: string;
  description?: string;
  content?: string;
}): Promise<ContentResult> {
  if (!args.name) throw new Error("name required to write a memory entry");
  if (!args.content)
    throw new Error("content required to write a memory entry");

  if (!args.description?.trim()) {
    throw new Error("description required to write a memory entry");
  }

  return await callNodeContentRoute("memory.remember", {
    name: args.name,
    description: args.description,
    content: args.content,
  });
}

/**
 * Delete an indexed memory entry (if present), then re-derive the index. Backs
 * scope:memory `delete`. The wire route is still named `memory.forget` — an
 * internal identifier left for the terminology sweep.
 *
 * @param name - The memory name/slug to delete
 * @returns Content result with the regenerated index
 */
export async function handleDeleteMemoryEntry(
  name: string | undefined,
): Promise<ContentResult> {
  if (!name) throw new Error("name required to delete a memory entry");

  return await callNodeContentRoute("memory.forget", { name });
}

/**
 * Read the derived memory index (already injected on connect; this is an
 * explicit refresh). Backs scope:memory `read` with no `name`. The wire route
 * is still named `memory.list` — an internal identifier left for the
 * terminology sweep.
 *
 * @returns Content result with the current index
 */
export async function handleReadMemoryIndex(): Promise<ContentResult> {
  return await callNodeContentRoute("memory.list", {});
}

/**
 * Overwrite the machine-global context, echoing back what was persisted. Like
 * the project write, "" is a valid clear (matches the webui/REST editor, which
 * lets the user empty the file); only an omitted content param is rejected so
 * an accidental write can't silently wipe it.
 *
 * @param content - Global context content to write ("" clears it)
 * @param force - Replace the document even when the write keeps none of it
 * @returns Content result with the stored content
 */
export async function handleWriteGlobalContext(
  content: string | undefined,
  force = false,
): Promise<ContentResult> {
  if (content == null) {
    throw new Error("Content required for write action");
  }

  if (!force) {
    // The guard compares against the CURRENT document, which lives on the Node
    // side — one extra round-trip on the (rare) write path, and the freshest
    // possible baseline: the copy injected at connect may be stale.
    //
    // Read-then-write is check-then-act, so a webui PUT or a second MCP session
    // can land between the two RPCs and be overwritten. Accepted, not overlooked:
    // there is no transactional isolation across the V8→Node boundary to close
    // it with, and the only alternative — guarding against the stale connect-time
    // copy — trades a narrow race for a guard that is wrong whenever the document
    // changed during the session. A fresh baseline is the point.
    const existing = await handleReadGlobalContext();
    const warning = clobberWarning("global", existing.content, content);

    if (warning != null) {
      console.warn(warning);

      return existing;
    }
  }

  return await callNodeContentRoute("globalContext.write", { content });
}

/**
 * Guard the unrecoverable failure mode in the user-owned context layers: an
 * `action:write` REPLACES the whole document, so a model that sends only its new
 * fact destroys everything the user accumulated. (A memory entry is replaced the
 * same way, but it holds one fact under a name the model must reuse deliberately
 * — a far smaller blast radius, and not guarded here.) When the incoming content
 * keeps NONE of what's there, that is far likelier a mistake than an intent — so
 * the write is skipped and this warning is relayed to the model (ADR-0009
 * warn-and-skip), which can re-send with the content merged or pass `force`.
 *
 * Deliberately line containment, not a similarity score: cheap, explainable, and
 * with no ratio to tune — the verdict is "did any existing line survive", not
 * "did enough of the document survive". There IS one threshold, the substantive-
 * line floor described below, but it only decides WHICH lines are allowed to
 * vouch; it never becomes a percentage anyone has to calibrate.
 *
 * Both sides are normalized first (list marker stripped, emphasis markers
 * dropped, internal whitespace collapsed, trailing punctuation dropped, case
 * folded) so a reformat OF A LINE — bulleted, re-indented, bolded, re-cased, a
 * period added — still counts as surviving. Headings are held out of that: a
 * heading is structure, so letting one vouch would pass a write that keeps
 * `# Project Context` and drops everything under it. The exception is a document
 * with no body TEXT to vouch for it — only headings, or headings over pure
 * structure like `# Song Ideas` + `---`. Holding them out there means no guard
 * at all, so the headings themselves become the needles.
 *
 * Tolerance stops there: the needle is a whole existing line and the haystack is
 * one incoming line, so restructuring that SPLITS a line across several (or
 * merges several into one) trips the guard even though every fact survived. That
 * is the conservative direction, and the designed recovery — the model gets the
 * warning and re-sends a merged write. One surviving line is enough to read as
 * an edit rather than a replacement.
 *
 * Only SUBSTANTIVE lines can vouch for a write, measured in ALPHANUMERIC
 * characters so punctuation can't pad a line over the floor. Without that, a
 * `---` rule, a code fence, a `| --- | --- |` table separator, or any short line
 * that happens to appear in the new content would satisfy the guard for free,
 * leaving a document containing one effectively unguarded. Content-bearing lines
 * still count — `| Genre | deep house |` is 14 alphanumerics, and if it survives
 * into the new content that really is surviving content.
 *
 * The floor picks WHICH line vouches; it does not decide whether a document is
 * worth guarding. Applied unconditionally it would measure a document by its
 * LONGEST LINE, which is the wrong measure. A twelve-line roster of short
 * entries — `- 124` / `- A min` / `- kick: t0` / `- drop: b33`, nothing over 7
 * alphanumerics — is a lot of accumulated context, and it would have had zero
 * protection while a single sentence of prose is fully covered. Shorthand is a
 * note style, not a signal that there is little to lose. So there is one rule:
 * test against the strongest lines the document HAS. When none clear the floor,
 * any line carrying letters or digits may vouch instead.
 *
 * That fallback tier really is the weaker guard, and specifically so: short
 * needles match by coincidence, so a write that discards the roster above but
 * happens to say "in A minor" satisfies the `- A min` needle and passes. It
 * catches the blatant clobber and misses the accidental one. Strictly more than
 * no guard at all, and it never loosens a document that has a substantive line
 * to test.
 *
 * Inert in the three cases where nothing can be lost: an empty existing
 * document, a blank incoming write (the documented explicit clear, which the
 * webui's "empty the file" path also uses), and a document of pure structure
 * (`---`, a bare fence) with no letters or digits anywhere.
 *
 * @param scope - The layer being written (project | global), for the message
 * @param existing - The document as it stands
 * @param incoming - The content the model wants to write
 * @returns The warning to relay, or null when the write may proceed
 */
export function clobberWarning(
  scope: string,
  existing: string,
  incoming: string,
): string | null {
  if (incoming.trim() === "") return null;

  const nonBlank = existing
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  const body = nonBlank.filter((line) => !line.startsWith("#"));
  const bodyWithText = textBearing(body);
  // Headings can't vouch while there is body content under them, or a write
  // that kept `# Project Context` and dropped everything below would pass. What
  // counts as "under them" is body TEXT, not body lines: a body of pure
  // structure vouches for nothing either way, so holding the headings out there
  // left `# Song Ideas\n---` unguarded on the strength of its `---`. In both
  // cases — headings only, or headings over structure — the headings are what's
  // at stake, so they become the needles.
  const hasBodyText = bodyWithText.length > 0;
  const lines = hasBodyText ? body : nonBlank;

  if (lines.length === 0) return null;

  // Compared line-by-line rather than against the whole blob, so a match can't
  // straddle two lines of the incoming content.
  const incomingLines = incoming.split("\n").map(normalizeForContainment);
  const withText = hasBodyText ? bodyWithText : textBearing(nonBlank);
  const substantive = withText.filter(
    (line) => alphanumericCount(line) >= MIN_SURVIVING_CHARS,
  );
  // Test against the strongest lines the document HAS. Applied unconditionally
  // the floor would measure a document by its longest line and leave a whole
  // roster of short entries unguarded — see the JSDoc above.
  const checkable = substantive.length > 0 ? substantive : withText;

  if (checkable.length === 0) return null;

  if (checkable.some((line) => incomingLines.some((l) => l.includes(line)))) {
    return null;
  }

  return (
    `scope:${scope} write SKIPPED — nothing was written. Your content kept ` +
    `none of the existing document (${lines.length} line(s) would be lost, ` +
    `starting with "${lines[0]}"). The result above is the document as it ` +
    `stands: re-send the write with that content plus your addition. If the ` +
    `user really asked to replace the whole thing, pass force:true — ask them ` +
    `first if you haven't.`
  );
}

/**
 * Shortest line that may vouch for a write (alphanumeric chars, after
 * normalization). Long enough that structural boilerplate — `---`, `| --- |`,
 * a fence, a one-word list item — can't stand in for the user's content.
 */
const MIN_SURVIVING_CHARS = 8;

/**
 * The lines that can vouch for a write, normalized for containment: the ones
 * carrying at least one letter or digit. Pure structure — a `---` rule, a bare
 * fence, a table separator — vouches for nothing, so it drops out here.
 *
 * @param lines - Trimmed, non-blank lines of the existing document
 * @returns The normalized lines that carry text
 */
function textBearing(lines: string[]): string[] {
  return lines
    .map(normalizeForContainment)
    .filter((line) => alphanumericCount(line) > 0);
}

/**
 * Count the letters and digits in a line, ignoring punctuation, markup and
 * whitespace — the measure both guard tiers are expressed in.
 *
 * @param line - A normalized line
 * @returns How many alphanumeric characters it carries
 */
function alphanumericCount(line: string): number {
  return line.replaceAll(/[^\p{L}\p{N}]/gu, "").length;
}

/**
 * Reduce a line to what containment should ignore differences in: leading list
 * marker or blockquote, inline emphasis markers, indentation and repeated
 * spaces, trailing punctuation, letter case. The needle is normalized the same
 * way as the haystack lines, so re-bulleting a prose line, bolding it, or adding
 * a period still reads as the same content.
 *
 * Order matters twice: the list marker goes before the emphasis strip (or `* x`
 * loses its bullet's trailing space and stops matching the marker), and the
 * emphasis strip goes before the trailing-punctuation strip (or `**done.**`
 * keeps a period that plain `done.` drops).
 *
 * Dropping markers and case only ever makes two lines MORE alike, and neither
 * touches the alphanumeric count the two guard tiers are measured in, so this
 * can't tighten the guard — only stop it firing on a pure restyle.
 *
 * @param line - One raw line of either document
 * @returns The line reduced to its comparable text
 */
function normalizeForContainment(line: string): string {
  return line
    .trim()
    .replace(/^(?:[-*+>]|\d+[.)])\s+/, "")
    .replaceAll(/[*_`]/g, "")
    .replaceAll(/\s+/g, " ")
    .replace(/[.,;:!?]+$/, "")
    .toLowerCase()
    .trim();
}

/**
 * Invoke a Node-side global-context/memory route and unwrap the response,
 * throwing on failure so the MCP error path renders a clean message instead of
 * leaking the RPC envelope shape to the LLM. Shared by the pinned-context and
 * indexed-memory routes (both return a `{ content }` payload).
 *
 * @param route - Route name registered on the Node side
 * @param args - Arguments to pass to the route
 * @returns The route's success payload
 */
async function callNodeContentRoute(
  route: string,
  args: object,
): Promise<ContentResult> {
  const response = await requestNode<ContentResult>(route, args);

  if (!response.success || !response.result) {
    throw new Error(`${route} failed: ${response.error ?? "unknown error"}`);
  }

  return response.result;
}
