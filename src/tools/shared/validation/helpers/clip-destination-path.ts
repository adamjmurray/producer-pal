// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Where a clip lands. An arrangement address has two halves, the lane and the
// time, and a destination may name either or both: `t0[5|1]` is both, `t0`
// keeps the clip's position, and `[5|1]` keeps its lane. Sources take neither
// partial; see dev/Object-Paths.md, "Complete and partial".

import { paramNamesSomething } from "#src/tools/shared/utils.ts";
import { type ObjectPath } from "../object-path.ts";
import {
  parseObjectPathList,
  requireClipPath,
  type ClipPath,
} from "./object-path-helpers.ts";

/** One destination: the lane it named, the position it named, or both. */
export interface ClipDestinationPath {
  /** The lane, or null when the entry is a bare `[5|1]`. */
  lane: ClipPath | null;
  /** The song position from the coordinate, or null when it carried none. */
  position: string | null;
}

/**
 * Reads a destination path as its two halves.
 * @param path - Parsed path
 * @param label - Param name for error messages
 * @returns The lane and the position the path names
 */
export function requireClipDestinationPath(
  path: ObjectPath,
  label = "path",
): ClipDestinationPath {
  if (path.kind === "arrangement-position") {
    return { lane: path.lane, position: path.position };
  }

  return { lane: requireClipPath(path, label), position: null };
}

/**
 * Parses a comma-separated destination list.
 * @param input - Comma-separated paths (e.g. "t0[5|1],[9|1],t2")
 * @param label - Param name for error messages
 * @returns One entry per path, in order
 */
export function parseClipDestinationList(
  input: string | null | undefined,
  label = "path",
): ClipDestinationPath[] {
  return parseObjectPathList(input, label).map((path) =>
    requireClipDestinationPath(path, label),
  );
}

/**
 * Whether a path param carries a `[song position]`. A "[" is only ever the
 * start of one — anything else the parser reports itself.
 * @param value - Raw path param value
 * @returns True when some entry names a position
 */
export function pathCarriesPosition(value: string | null | undefined): boolean {
  return value?.includes("[") ?? false;
}

/**
 * Refuses a call that spells one position twice, once in a path coordinate and
 * once in arrangementStart. They name the same thing, so honoring either is the
 * silent wrong-target bug the grammar exists to prevent — and nothing has run,
 * so the model can retry with one of them dropped.
 * @param rawPath - The destination path param as the caller sent it
 * @param arrangementStart - The position param as the caller sent it
 * @param tool - Tool name, for the message
 * @param label - The destination param's name
 */
export function refuseDoubledPosition(
  rawPath: string | null | undefined,
  arrangementStart: string | null | undefined,
  tool: string,
  label: string,
): void {
  if (!pathCarriesPosition(rawPath) || !paramNamesSomething(arrangementStart)) {
    return;
  }

  throw new Error(
    `${tool} failed: ${label} "${rawPath?.trim()}" and arrangementStart both ` +
      `name a song position; use one`,
  );
}
