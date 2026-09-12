// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// One pass over a path param, for every kind of object a path can name. An
// entry that names nothing warns and leaves a null in its place, so a caller
// pairing paths against another list keeps its positions.

import { errorMessage } from "#src/shared/error-message.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { pathEntries } from "#src/tools/shared/validation/helpers/object-paths.ts";

/**
 * What a path was meant to find ("clip"), the param it came from, and the
 * path as written.
 */
export interface PathTarget {
  noun: string;
  label: string;
  entry: string;
}

/**
 * Resolves each entry of a path param to an id, one slot per entry.
 * A resolver that throws costs its own entry and not the batch, the same as an
 * id that doesn't resolve. A hole in the list itself throws, before anything
 * runs.
 * @param paths - Comma-separated paths
 * @param label - Param name the paths came from, for warnings
 * @param resolve - Gives the id an entry names, or null having said why not
 * @returns One id per path entry, in order, null where an entry named none
 */
export function idPerPath(
  paths: string,
  label: string,
  resolve: (entry: string) => string | null,
): Array<string | null> {
  const ids: Array<string | null> = [];

  for (const entry of pathEntries(paths, label)) {
    try {
      ids.push(resolve(entry));
    } catch (error) {
      console.warn(errorMessage(error));
      ids.push(null);
    }
  }

  return ids;
}

/**
 * The id of what a path found, or null and a word naming what's missing. The
 * warning names what was looked for, so the model learns more than that the
 * path was empty.
 * @param object - What the path resolved to, or null when it named no place
 * @param target - What was looked for, and where the path came from
 * @returns The id, or null when nothing is there
 */
export function existingId(
  object: LiveAPI | null,
  target: PathTarget,
): string | null {
  if (object?.exists()) {
    return object.id;
  }

  console.warn(`no ${target.noun} at ${target.label} "${target.entry}"`);

  return null;
}
