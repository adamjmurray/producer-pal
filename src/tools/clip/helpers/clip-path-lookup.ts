// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Addressing clips by where they are instead of by id, so a caller that knows
// the location doesn't have to read the clip first just to learn its id.
//
// Session positions only: a slot holds one clip, while a track's arrangement
// holds many, so a bare track names no particular clip to act on.

import { errorMessage } from "#src/shared/error-utils.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  pathEntries,
  requireSessionSlot,
} from "#src/tools/shared/validation/object-path-helpers.ts";
import { parseObjectPath } from "#src/tools/shared/validation/object-path.ts";

/**
 * Resolves session position path(s) to the ids of the clips sitting there.
 * A malformed entry or an empty slot warns and contributes nothing, matching
 * how these tools skip an id that doesn't resolve — one bad entry costs its own
 * clip, not the whole batch.
 * @param paths - Comma-separated session positions (e.g. "t0/s1,t2/s3")
 * @param tool - Tool name, for warnings
 * @param label - Param name the paths came from, for warnings
 * @returns The clip ids, in path order
 */
export function clipIdsAtPaths(
  paths: string,
  tool: string,
  label = "path",
): string[] {
  const ids: string[] = [];

  for (const entry of pathEntries(paths, label)) {
    try {
      const slot = requireSessionSlot(parseObjectPath(entry, label), label);
      const clip = LiveAPI.from(
        livePath.track(slot.trackIndex).clipSlot(slot.sceneIndex).clip(),
      );

      if (clip.exists()) {
        ids.push(clip.id);
        continue;
      }

      console.warn(`${tool}: no clip at ${label} "${entry}"`);
    } catch (error) {
      console.warn(`${tool}: ${errorMessage(error)}`);
    }
  }

  return ids;
}
