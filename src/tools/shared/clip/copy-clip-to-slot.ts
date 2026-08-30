// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { toLiveApiId } from "../utils.ts";

/**
 * Copies a session clip into another slot, reporting the copy only when Live
 * actually made one. `duplicate_clip_to` returns success and copies nothing
 * when it declines, so the destination's clip id is read before and after:
 * still empty, or still the same clip, means nothing was copied. Callers that
 * delete the source afterwards depend on this — a path lookup alone would find
 * the clip already sitting in an occupied slot and call it the copy.
 * @param sourceClipSlot - Clip slot holding the clip to copy
 * @param destClipSlot - Clip slot to copy into
 * @returns The new clip, or null when Live made no copy
 */
export function copyClipToSlot(
  sourceClipSlot: LiveAPI,
  destClipSlot: LiveAPI,
): LiveAPI | null {
  const idBefore = clipIdInSlot(destClipSlot);

  sourceClipSlot.call("duplicate_clip_to", toLiveApiId(destClipSlot.id));

  const newClip = destClipSlot.child("clip");

  if (!newClip.exists() || newClip.id === idBefore) return null;

  return newClip;
}

/**
 * Says why a track won't take a copy of a clip, for a warning the caller words
 * itself. Live declines these copies without reporting anything, so checking
 * first is the only way to name the reason.
 * @param clipIsMidi - Whether the clip being copied is MIDI
 * @param trackIndex - Destination track index
 * @param track - The destination track, when the caller already has it
 * @returns The reason, or null when the track takes the copy
 */
export function clipCopyBlocker(
  clipIsMidi: boolean,
  trackIndex: number,
  track: LiveAPI = LiveAPI.from(livePath.track(trackIndex)),
): string | null {
  const trackIsMidi = (track.getProperty("has_midi_input") as number) > 0;

  if (clipIsMidi !== trackIsMidi) {
    return `track ${trackIndex} is ${trackIsMidi ? "MIDI" : "audio"}`;
  }

  // A frozen track still reports has_midi_input, so the type check passes and
  // the copy is refused anyway.
  if (track.getProperty("is_frozen")) {
    return `track ${trackIndex} is frozen`;
  }

  return null;
}

/**
 * Reads the id of the clip a slot already holds.
 * @param clipSlot - Clip slot to read
 * @returns The clip's id, or null when the slot is empty
 */
function clipIdInSlot(clipSlot: LiveAPI): string | null {
  if (!clipSlot.getProperty("has_clip")) return null;

  return clipSlot.child("clip").id;
}
