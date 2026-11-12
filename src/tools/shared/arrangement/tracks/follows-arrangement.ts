// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { liveVersionAtLeast } from "#src/tools/shared/helpers/live-api-values.ts";
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
 * state can be read. A track with clip slots does when no session clip plays and
 * it wasn't stopped in Session (`playing_slot_index` is -1): every regular
 * track, and on Live 13 every return track. The main track, and a return track
 * on Live 12, always do; Live 12's answer for a return track isn't known, so it
 * isn't asked.
 * @param track - A track
 * @returns False when the track plays from Session
 */
export function followsArrangement(track: LiveAPI): boolean {
  if (!hasClipSlots(track)) {
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
  const { category, trackIndex, returnTrackIndex } = object;

  if (category === "regular" && trackIndex != null) {
    return followsArrangement(LiveAPI.from(livePath.track(trackIndex)));
  }

  if (category === "return" && returnTrackIndex != null && returnHasSlots()) {
    return followsArrangement(
      LiveAPI.from(livePath.returnTrack(returnTrackIndex)),
    );
  }

  return true;
}

/**
 * @param track - A track
 * @returns Whether it can play a session clip, so `playing_slot_index` says
 */
function hasClipSlots(track: LiveAPI): boolean {
  return (
    track.category === "regular" ||
    (track.category === "return" && returnHasSlots())
  );
}

/** @returns True on Live 13, where return tracks have clip slots */
function returnHasSlots(): boolean {
  return liveVersionAtLeast("13.0");
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
