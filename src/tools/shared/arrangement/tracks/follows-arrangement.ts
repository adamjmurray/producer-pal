// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  type EntryWithDetail,
  appendDetail,
} from "#src/tools/shared/helpers/entry-details.ts";

/**
 * Why a read leaves out `automation` for a track that plays from Session. A
 * parameter's `automation_state` reads 0 there even where a lane exists.
 */
export const AUTOMATION_UNKNOWN_FROM_SESSION =
  "arrangement automation unknown while the track plays from Session";

/**
 * Whether the track follows the arrangement, so its parameters' automation
 * state can be read. A regular track does when no session clip plays and it
 * wasn't stopped in Session (`playing_slot_index` is -1). Return and main
 * tracks have no clip slots, so they always do.
 * @param track - A track
 * @returns False when the track plays from Session
 */
export function followsArrangement(track: LiveAPI): boolean {
  if (track.category !== "regular") {
    return true;
  }

  return track.getProperty("playing_slot_index") === -1;
}

/**
 * Whether the track holding a device or parameter follows the arrangement.
 * An object whose path names no track is treated as following it.
 * @param object - A device, chain or parameter
 * @returns False when its track plays from Session
 */
export function owningTrackFollowsArrangement(object: LiveAPI): boolean {
  const { category, trackIndex } = object;

  if (category !== "regular" || trackIndex == null) {
    return true;
  }

  return followsArrangement(LiveAPI.from(livePath.track(trackIndex)));
}

/**
 * Say on an entry that its automation is unknown, unless it already says so —
 * a device read can hit this from its params and from its chains.
 * @param entry - The entry the unknown automation belongs to
 */
export function noteAutomationUnknown(entry: EntryWithDetail): void {
  if (!(entry.detail ?? "").includes(AUTOMATION_UNKNOWN_FROM_SESSION)) {
    appendDetail(entry, AUTOMATION_UNKNOWN_FROM_SESSION);
  }
}
