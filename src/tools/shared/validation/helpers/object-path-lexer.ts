// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Everything that reads a path's raw text before the grammar sees it: the
// pre-2.2.0 spellings we still honor, and splitting the `[...]` coordinate off
// the tail.

import * as console from "#src/shared/max/v8-max-console.ts";
import { type ObjectPath } from "../object-path.ts";

const LEGACY_TRACK = /^(\d+)$/;
const LEGACY_SLOT = /^(\d+)\/(\d+)$/;

/**
 * Reads a pre-2.2.0 slot or bare track index, warning to teach the spelling
 * that replaced it.
 * @param input - The trimmed path
 * @param label - Param name for error messages
 * @returns What the legacy value names, or null when it isn't one
 */
export function parseLegacyPath(
  input: string,
  label: string,
): ObjectPath | null {
  const slot = LEGACY_SLOT.exec(input);

  if (slot) {
    const trackIndex = Number(slot[1]);
    const sceneIndex = Number(slot[2]);

    console.warn(
      `${label} "${input}" is the old slot spelling; use "t${trackIndex}/s${sceneIndex}"`,
    );

    return { kind: "slot", trackIndex, sceneIndex };
  }

  const track = LEGACY_TRACK.exec(input);

  if (track) {
    const trackIndex = Number(track[1]);

    console.warn(
      `${label} "${input}" is a bare track index; use "t${trackIndex}"`,
    );

    return { kind: "track", trackIndex };
  }

  return null;
}

/** What a path looks like once its coordinate is off: `t0/l1` and `5|1`. */
export interface LexedPath {
  /** The path without its coordinate. Empty for a bare `[5|1]`. */
  body: string;
  /** The song position inside the brackets, or null when there was none. */
  position: string | null;
}

/**
 * Splits a comma-separated path list at bracket depth 0.
 *
 * A coordinate holds song positions, and both separators occur inside one: a
 * bar|beat takes `±n<fraction>` offsets (`1|1-n/4`) and a locator name is
 * user-typed. Splitting inside one would cut a name in half.
 * @param raw - The path param as the caller wrote it
 * @returns One entry per path, untrimmed
 */
export function splitPathEntries(raw: string): string[] {
  const entries: string[] = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i < raw.length; i++) {
    const char = raw[i];

    if (char === "[") depth++;
    else if (char === "]") depth = Math.max(0, depth - 1);
    else if (char === "," && depth === 0) {
      entries.push(raw.slice(start, i));
      start = i + 1;
    }
  }

  entries.push(raw.slice(start));

  return entries;
}

/**
 * Peels the `[...]` coordinate off the end of one path.
 *
 * The coordinate runs from the FIRST `[` to the last character, which must be
 * `]`. No path segment can contain a bracket, so the first one always opens the
 * coordinate — and taking everything to the end lets a locator name hold a
 * bracket of its own. It also leaves a body with no brackets in it, which is
 * why splitting that body on `/` needs no depth of its own.
 * @param input - One trimmed path entry
 * @param label - Param name for error messages
 * @returns The body and the position, if there was one
 */
export function splitCoord(input: string, label: string): LexedPath {
  const open = input.indexOf("[");

  if (open === -1) {
    if (input.endsWith("]")) {
      throw pathError(label, input, 'it closes a "[" it never opened');
    }

    return { body: input, position: null };
  }

  if (!input.endsWith("]")) {
    throw pathError(
      label,
      input,
      'its "[" is never closed; a song position goes at the end, like "t0[5|1]"',
    );
  }

  const position = input.slice(open + 1, -1).trim();

  if (position === "") {
    throw pathError(
      label,
      input,
      'its "[]" names no position; expected a bar|beat or "loc:<locator>"',
    );
  }

  return { body: input.slice(0, open).trim(), position };
}

/**
 * Builds the error every path problem is reported as, so one voice covers the
 * whole grammar. It lives here because everything else in the grammar imports
 * this file, and nothing here imports back.
 * @param label - Param name the path came from
 * @param input - The path as the caller wrote it
 * @param problem - What's wrong, and how to fix it
 * @returns The error to throw
 */
export function pathError(
  label: string,
  input: string,
  problem: string,
): Error {
  return new Error(`invalid ${label} "${input}" - ${problem}`);
}
