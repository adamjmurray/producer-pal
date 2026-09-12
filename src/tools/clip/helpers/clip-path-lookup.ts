// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Addressing clips by where they are instead of by id, so a caller that knows
// the location doesn't have to read the clip first just to learn its id.
//
// The location has to name one clip: a slot, or a song position on one
// arrangement lane. A bare track or lane holds many clips and is refused.

import { errorMessage } from "#src/shared/error-utils.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { arrangementClipAtPosition } from "#src/tools/shared/arrangement/helpers/arrangement-clip-at-position.ts";
import {
  requireClipSourcePath,
  type ClipSourcePath,
} from "#src/tools/shared/validation/helpers/clip-source-path.ts";
import { pathEntries } from "#src/tools/shared/validation/helpers/object-path-helpers.ts";
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
  const ids: Array<string | null> = [];

  for (const entry of pathEntries(paths, label)) {
    try {
      const source = requireClipSourcePath(
        parseObjectPath(entry, label),
        label,
      );
      const clip = clipAtSource(source, label);

      if (clip != null && clip.exists()) {
        ids.push(clip.id);
        continue;
      }

      console.warn(`no clip at ${label} "${entry}"`);
    } catch (error) {
      console.warn(errorMessage(error));
    }

    ids.push(null);
  }

  return ids;
}

// --- Helpers below main exports ---

/**
 * The clip at one location, whichever kind of location it is.
 * @param source - A parsed slot or arrangement position
 * @param label - Param name the path came from
 * @returns The clip, or null when nothing is there
 */
function clipAtSource(source: ClipSourcePath, label: string): LiveAPI | null {
  if (source.kind === "slot") {
    return LiveAPI.from(
      livePath.track(source.trackIndex).clipSlot(source.sceneIndex).clip(),
    );
  }

  return arrangementClipAtPosition(source, label);
}
