// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { isGroupTrack } from "#src/tools/shared/arrangement/tracks/tracks-inside-group.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";

/**
 * How every tool says a group track has no clip to give: its slots only fire
 * the tracks inside it.
 * @param track - The group track
 * @returns The reason
 */
export function groupTrackHoldsNoClips(track: LiveAPI): string {
  return `track ${targetLabel(track)} is a group track; it holds no clips`;
}

/**
 * The reason a slot holds no clip, for a path that found nothing in it.
 * @param trackIndex - The slot's track
 * @returns The reason when the track is a group, else null
 */
export function emptySlotGroupReason(trackIndex: number): string | null {
  const track = LiveAPI.from(livePath.track(trackIndex));

  return isGroupTrack(track) ? groupTrackHoldsNoClips(track) : null;
}
