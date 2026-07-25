// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { requestNode } from "#src/live-api-adapter/node-request-v8-protocol.ts";
import * as console from "#src/shared/v8-max-console.ts";

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
 * with no threshold to argue about. Both sides are normalized first (list marker
 * stripped, internal whitespace collapsed, trailing punctuation dropped) so a
 * reformat OF A LINE — bulleted, re-indented, a period added — still counts as
 * surviving; headings are ignored for the same reason. Tolerance stops there:
 * the needle is a whole existing line and the haystack is one incoming line, so
 * restructuring that SPLITS a line across several (or merges several into one)
 * trips the guard even though every fact survived. That is the conservative
 * direction, and the designed recovery — the model gets the warning and re-sends
 * a merged write. One surviving line is enough to read as an edit rather than a
 * replacement.
 *
 * Only SUBSTANTIVE lines can vouch for a write, measured in ALPHANUMERIC
 * characters so punctuation can't pad a line over the floor. Without that, a
 * `---` rule, a code fence, a `| --- | --- |` table separator, or any short line
 * that happens to appear in the new content would satisfy the guard for free,
 * leaving a document containing one effectively unguarded. Content-bearing lines
 * still count — `| Genre | deep house |` is 14 alphanumerics, and if it survives
 * into the new content that really is surviving content. A document with nothing
 * substantive in it has nothing distinctive to test, so the guard stays out of
 * the way there.
 *
 * Inert in the two cases where nothing can be lost: an empty existing document,
 * and a blank incoming write (the documented explicit clear, which the webui's
 * "empty the file" path also uses).
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

  const lines = existing
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));

  if (lines.length === 0) return null;

  // Compared line-by-line rather than against the whole blob, so a match can't
  // straddle two lines of the incoming content.
  const incomingLines = incoming.split("\n").map(normalizeForContainment);
  const checkable = lines
    .map(normalizeForContainment)
    .filter(
      (line) =>
        line.replaceAll(/[^\p{L}\p{N}]/gu, "").length >= MIN_SURVIVING_CHARS,
    );

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
 * Reduce a line to what containment should ignore differences in: leading list
 * marker or blockquote, indentation and repeated spaces, trailing punctuation.
 * The needle is normalized the same way as the haystack lines, so re-bulleting a
 * prose line or adding a period still reads as the same content.
 *
 * @param line - One raw line of either document
 * @returns The line reduced to its comparable text
 */
function normalizeForContainment(line: string): string {
  return line
    .trim()
    .replace(/^(?:[-*+>]|\d+[.)])\s+/, "")
    .replaceAll(/\s+/g, " ")
    .replace(/[.,;:!?]+$/, "")
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
