// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Addressing clips by where they are instead of by id, so a caller that knows
// the location doesn't have to read the clip first just to learn its id.
//
// The location has to name one clip: a slot, or a song position on one
// arrangement lane. A bare track or lane holds many clips and is refused.

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { arrangementClipAtPosition } from "#src/tools/shared/arrangement/helpers/arrangement-clip-at-position.ts";
import { requireClipSourcePath } from "#src/tools/shared/validation/helpers/clip-source-path.ts";
import {
  existingId,
  type IdLookup,
  idPerPath,
} from "#src/tools/shared/validation/helpers/id-per-path-lookup.ts";
import { parseObjectPath } from "#src/tools/shared/validation/object-path.ts";

/**
 * Resolves clip path(s) to the ids of the clips sitting there.
 * A malformed entry or a location with no clip warns and contributes nothing,
 * matching how these tools skip an id that doesn't resolve — one bad entry
 * costs its own clip, not the whole batch. A hole in the list itself throws.
 * @param paths - Comma-separated clip locations (e.g. "t0/s1,t2[5|1]")
 * @param label - Param name the paths came from, for warnings
 * @returns The clip ids, in path order
 */
export function clipIdsAtPaths(paths: string, label = "path"): string[] {
  return clipIdPerPath(paths, label).filter((id) => id != null);
}

/**
 * The same lookup, keeping one entry per path with null where a path named no
 * clip. Callers that line paths up against another list — move destinations —
 * need the positions to hold even when an entry resolves to nothing.
 * @param paths - Comma-separated clip locations (e.g. "t0/s1,t2[5|1]")
 * @param label - Param name the paths came from, for warnings
 * @returns One clip id per path entry, in path order
 */
export function clipIdPerPath(
  paths: string,
  label = "path",
): Array<string | null> {
  return idPerPath(paths, label, (entry) => clipIdAtPath(entry, label));
}

/**
 * The id of the clip one location holds, or the reason it holds none.
 * @param entry - One clip path, a slot or an arrangement position
 * @param label - Param name the path came from, for the reason
 * @returns The clip's id, or why there isn't one
 */
export function clipIdAtPath(entry: string, label = "path"): IdLookup {
  return existingId(clipAtPath(entry, label), { noun: "clip", label, entry });
}

// --- Helpers below main exports ---

/**
 * The clip at one location, whichever kind of location it is.
 * @param entry - One clip path, a slot or an arrangement position
 * @param label - Param name the path came from
 * @returns The clip, or null when nothing is there
 */
function clipAtPath(entry: string, label: string): LiveAPI | null {
  const source = requireClipSourcePath(parseObjectPath(entry, label), label);

  if (source.kind === "slot") {
    return LiveAPI.from(
      livePath.track(source.trackIndex).clipSlot(source.sceneIndex).clip(),
    );
  }

  return arrangementClipAtPosition(source, label);
}
