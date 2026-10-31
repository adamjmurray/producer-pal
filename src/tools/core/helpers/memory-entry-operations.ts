// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { targetEntries } from "#src/tools/shared/helpers/target-entries.ts";
import {
  callNodeContentRoute,
  type ContentResult,
} from "./project-context-operations.ts";

/** Longest name a write takes; the name becomes a filename. */
const MAX_WRITE_NAME_LENGTH = 200;

/** One name's answer when a call names several memory entries. */
export interface MemoryNameEntry {
  name: string;
  content?: string;
  ok?: false;
  detail?: string;
}

/**
 * The names a call's `name` param lists, split like every other target list
 * (`\,` is a comma inside a name).
 *
 * @param name - The `name` param as sent
 * @returns One trimmed name per entry; empty when none was sent
 * @throws Error when the list has an empty entry
 */
export function memoryNames(name: string | undefined): string[] {
  return targetEntries(name, "name");
}

/**
 * Read the memory entries a call names, in one round trip. One name answers
 * with its entry; several answer with one entry per name, in the order named.
 * A lone name that isn't there throws, since a list holds its place and a lone
 * target has none to hold.
 *
 * @param names - The names, in the order named (at least one)
 * @returns The entry, or the entries
 * @throws Error when a lone name can't be read
 */
export async function handleReadMemoryEntries(
  names: string[],
): Promise<MemoryNameEntry | MemoryNameEntry[]> {
  return loneUnwrapped(await callEntriesRoute("memory.readMany", names));
}

/**
 * Delete the memory entries a call names, in one round trip. One name answers
 * with its entry; several answer with one entry per name. A name given again
 * later is deleted once, by its last mention. A lone name that isn't there is
 * satisfied (`nothing to delete`), not an error; a lone failure throws.
 *
 * @param names - The names, in the order named (at least one)
 * @returns The entry, or the entries
 * @throws Error when a lone name couldn't be deleted
 */
export async function handleDeleteMemoryEntries(
  names: string[],
): Promise<MemoryNameEntry | MemoryNameEntry[]> {
  return loneUnwrapped(await callEntriesRoute("memory.forgetMany", names));
}

/**
 * Create or overwrite an indexed memory entry, then re-derive the index. The
 * Node side owns slug validation and index regeneration. Backs scope:memory
 * `write` (a name'd entry upsert). The route is still named `memory.remember`.
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
  if (!args.name) {
    throw new Error("name required to write a memory entry");
  }

  if (args.name.length > MAX_WRITE_NAME_LENGTH) {
    throw new Error(
      `name is ${args.name.length} characters; a memory name is at most ${MAX_WRITE_NAME_LENGTH}`,
    );
  }

  if (!args.content) {
    throw new Error("content required to write a memory entry");
  }

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
 * Read the derived memory index (already injected on connect; this is an
 * explicit refresh). Backs scope:memory `read` with no `name`. The route is
 * still named `memory.list`.
 *
 * @returns Content result with the current index
 */
export async function handleReadMemoryIndex(): Promise<ContentResult> {
  return await callNodeContentRoute("memory.list", {});
}

// --- Helpers below main exports ---

/**
 * Call a many-name Node route.
 * @param route - The route
 * @param names - The names to send
 * @returns One entry per name
 */
async function callEntriesRoute(
  route: string,
  names: string[],
): Promise<MemoryNameEntry[]> {
  const { entries } = await callNodeContentRoute<{
    entries: MemoryNameEntry[];
  }>(route, { names });

  return entries;
}

/**
 * A lone target returns its entry unwrapped, and throws its `detail` when it
 * failed.
 * @param entries - One entry per name
 * @returns The lone entry, or the list
 * @throws Error when the lone entry is a failure
 */
function loneUnwrapped(
  entries: MemoryNameEntry[],
): MemoryNameEntry | MemoryNameEntry[] {
  const [only] = entries;

  if (entries.length !== 1 || only == null) {
    return entries;
  }

  if (only.ok === false) {
    throw new Error(only.detail);
  }

  return only;
}
