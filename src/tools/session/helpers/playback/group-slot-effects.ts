// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// What firing or stopping a group track's slot does to the tracks inside it,
// read before the call. Live fires every member's slot in that scene: a clip
// launches, and an empty slot with a stop button stops its track.

import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  isGroupTrack,
  tracksInside,
} from "#src/tools/shared/arrangement/tracks/tracks-inside-group.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";

/**
 * What firing a group track's slot does to the tracks inside it.
 * @param group - The group track
 * @param sceneIndex - The scene whose slots fire
 * @returns The detail, or undefined when no track inside is affected
 */
export function firedGroupSlotDetail(
  group: LiveAPI,
  sceneIndex: number,
): string | undefined {
  const launched: string[] = [];
  const stopped: string[] = [];

  for (const track of regularTracksInside(group)) {
    const slot = LiveAPI.from(
      livePath.track(track.trackIndex as number).clipSlot(sceneIndex),
    );

    if (slot.getProperty("has_clip")) {
      launched.push(targetLabel(slot.child("clip")));
    } else if (slot.getProperty("has_stop_button") && isActive(track)) {
      stopped.push(targetLabel(track));
    }
  }

  const parts = [
    launched.length > 0 ? `launched ${launched.join(", ")}` : null,
    stopped.length > 0
      ? `stopped ${stopped.join(", ")}, which ${stopped.length === 1 ? "has" : "have"} no clip in s${sceneIndex}`
      : null,
  ].filter((part) => part != null);

  return parts.length === 0 ? undefined : parts.join("; ");
}

/**
 * What stopping a group track's slot does to the tracks inside it.
 * @param group - The group track
 * @returns The detail, or undefined when none of its tracks is playing or
 *   queued
 */
export function stoppedGroupSlotDetail(group: LiveAPI): string | undefined {
  const active = regularTracksInside(group).filter(isActive).map(targetLabel);

  if (active.length === 0) {
    return undefined;
  }

  const noun = active.length === 1 ? "the track" : "the tracks";

  return `stopped ${noun} in this group track: ${active.join(", ")}`;
}

// The tracks inside a group that hold clips of their own: its sub-groups only
// pass the fire on, so their members are what it reaches.
function regularTracksInside(group: LiveAPI): LiveAPI[] {
  return tracksInside(group).filter((track) => !isGroupTrack(track));
}

// A track with a clip playing, or one queued to launch or stop.
function isActive(track: LiveAPI): boolean {
  return (
    (track.getProperty("playing_slot_index") as number) >= 0 ||
    (track.getProperty("fired_slot_index") as number) >= 0
  );
}
