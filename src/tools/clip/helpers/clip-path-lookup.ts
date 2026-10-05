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
import { emptySlotGroupReason } from "#src/tools/shared/clip/group-track-clips.ts";
import { arrangementClipAtPosition } from "#src/tools/shared/arrangement/helpers/arrangement-clip-at-position.ts";
import { type LaneView } from "#src/tools/shared/arrangement/helpers/arrangement-lane-view.ts";
import { requireClipSourcePath } from "#src/tools/shared/validation/helpers/clip-source-path.ts";
import {
  existingId,
  type IdLookup,
  nothingThere,
} from "#src/tools/shared/validation/helpers/id-per-path-lookup.ts";
import { parseObjectPath } from "#src/tools/shared/validation/object-path.ts";

/**
 * The id of the clip one location holds, or the reason it holds none.
 * @param entry - One clip path, a slot or an arrangement position
 * @param label - Param name the path came from, for the reason
 * @param lanes - The call's lanes, for a caller resolving several paths
 * @returns The clip's id, or why there isn't one
 */
export function clipIdAtPath(
  entry: string,
  label = "path",
  lanes?: LaneView,
): IdLookup {
  const { clip, slotTrackIndex } = clipAtPath(entry, label, lanes);
  const lookup = existingId(clip, { noun: "clip", label, entry });

  // A group track's slot is empty for good, which `no clip at` doesn't say.
  if (lookup.id == null && slotTrackIndex != null) {
    const groupReason = emptySlotGroupReason(slotTrackIndex);

    return groupReason == null ? lookup : nothingThere(groupReason);
  }

  return lookup;
}

// --- Helpers below main exports ---

/**
 * The clip at one location, whichever kind of location it is.
 * @param entry - One clip path, a slot or an arrangement position
 * @param label - Param name the path came from
 * @param lanes - The call's lanes, for a caller resolving several paths
 * @returns The clip, or null when nothing is there; for a slot, its track
 */
function clipAtPath(
  entry: string,
  label: string,
  lanes: LaneView | undefined,
): { clip: LiveAPI | null; slotTrackIndex?: number } {
  const source = requireClipSourcePath(parseObjectPath(entry, label), label);

  if (source.kind === "slot") {
    return {
      clip: LiveAPI.from(
        livePath.track(source.trackIndex).clipSlot(source.sceneIndex).clip(),
      ),
      slotTrackIndex: source.trackIndex,
    };
  }

  return { clip: arrangementClipAtPosition(source, label, lanes) };
}
