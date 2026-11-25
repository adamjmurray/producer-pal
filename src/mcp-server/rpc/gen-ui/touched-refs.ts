// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Works out which Live objects a finished tool call touched, from what the call
// already carries: the ids and paths in its arguments and in its result. No
// extra Live reads.

import { type LiveChange } from "#src/shared/gen-ui-types.ts";
import { type McpResponse } from "../../max-api-adapter.ts";

/** Tools whose ids and paths name only the clips they changed. */
const CLIP_SCOPED_TOOLS = new Set(["ppal-create-clip", "ppal-update-clip"]);

/** Arguments that name a target. */
const TARGET_ARGS = ["id", "clipId", "path", "toPath"];

// Compact output is a JS literal, not JSON, so fall back to scanning for keys.
const KEY_VALUE = /\b(id|path)\s*:\s*(?:"([^"]*)"|'([^']*)'|([^\s,}\]]+))/g;

/**
 * Name the Live objects a finished call touched.
 * @param tool - The tool that ran
 * @param args - Its arguments
 * @param response - Its result
 * @returns The ids and paths found. `all` is set when they can't be trusted to
 *   cover the change: a timeout, a tool that isn't scoped to clips (a deleted
 *   track shifts every path after it), or a call that named nothing.
 */
export function touchedRefs(
  tool: string,
  args: object,
  response: McpResponse,
): LiveChange {
  const ids = new Set<string>();
  const paths = new Set<string>();

  for (const key of TARGET_ARGS) {
    const value = (args as Record<string, unknown>)[key];

    if (typeof value === "string" || typeof value === "number") {
      addRef(key === "id" || key === "clipId" ? ids : paths, String(value));
    }
  }

  for (const item of response.content) {
    if (!item.text.startsWith("WARNING:")) {
      collect(item.text, ids, paths);
    }
  }

  const found = ids.size > 0 || paths.size > 0;

  return {
    tool,
    ids: [...ids],
    paths: [...paths],
    all: response.errorCode === "timeout" || !found || !isClipScoped(tool),
  };
}

/**
 * @param tool - A tool name
 * @returns True when its ids and paths name only clips it changed
 */
function isClipScoped(tool: string): boolean {
  return CLIP_SCOPED_TOOLS.has(tool);
}

/**
 * @param into - The id or path set
 * @param value - A value that may be a comma-separated list
 */
function addRef(into: Set<string>, value: string): void {
  for (const part of value.split(/(?<!\\),/)) {
    const ref = part.trim();

    if (ref !== "") {
      into.add(ref);
    }
  }
}

/**
 * @param text - One result text block
 * @param ids - Collects ids
 * @param paths - Collects paths
 */
function collect(text: string, ids: Set<string>, paths: Set<string>): void {
  try {
    walk(JSON.parse(text) as unknown, ids, paths);

    return;
  } catch {
    // Not JSON: scan the literal below.
  }

  for (const match of text.matchAll(KEY_VALUE)) {
    // One of the three alternatives always matched.
    const value = match[2] ?? match[3] ?? String(match[4]);

    addRef(match[1] === "id" ? ids : paths, value);
  }
}

/**
 * @param node - Any parsed JSON
 * @param ids - Collects `id` values
 * @param paths - Collects `path` values
 */
function walk(node: unknown, ids: Set<string>, paths: Set<string>): void {
  if (Array.isArray(node)) {
    for (const child of node) {
      walk(child, ids, paths);
    }

    return;
  }

  if (node == null || typeof node !== "object") {
    return;
  }

  for (const [key, value] of Object.entries(node)) {
    if (
      (key === "id" || key === "path") &&
      (typeof value === "string" || typeof value === "number")
    ) {
      addRef(key === "id" ? ids : paths, String(value));
    } else {
      walk(value, ids, paths);
    }
  }
}
