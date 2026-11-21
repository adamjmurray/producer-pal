// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// The track a clip with envelopes sits on: a regular track's session slot, or
// (Live 13) a return track's. Both are addressed to the remote script the same
// way, `t3` or `rt1` beside the slot's scene index.

import { livePath } from "#src/shared/live-api-path-builders.ts";

/** A regular track, or a Live 13 return track. */
export interface EnvelopeTrack {
  kind: "regular" | "return";
  index: number;
}

/** A clip slot that holds a clip: its track and its scene index. */
export interface EnvelopeSlot {
  track: EnvelopeTrack;
  slot: number;
}

/**
 * Where a session clip sits, on a regular or a return track.
 * @param clip - Any clip
 * @returns Its track and slot, or null for a clip outside a session slot
 */
export function envelopeSlotOf(clip: LiveAPI): EnvelopeSlot | null {
  const { returnTrackIndex, returnClipSlotIndex } = clip;

  if (returnTrackIndex != null && returnClipSlotIndex != null) {
    return {
      track: { kind: "return", index: returnTrackIndex },
      slot: returnClipSlotIndex,
    };
  }

  const { trackIndex, clipSlotIndex } = clip;

  return trackIndex == null || clipSlotIndex == null
    ? null
    : { track: { kind: "regular", index: trackIndex }, slot: clipSlotIndex };
}

/**
 * @param track - A track
 * @returns How the remote script and object paths name it: t3 or rt1
 */
export function trackText(track: EnvelopeTrack): string {
  return `${track.kind === "return" ? "rt" : "t"}${String(track.index)}`;
}

/**
 * @param track - A track
 * @returns The track's Live object
 */
export function trackObject(track: EnvelopeTrack): LiveAPI {
  return LiveAPI.from(
    track.kind === "return"
      ? livePath.returnTrack(track.index)
      : livePath.track(track.index),
  );
}

/**
 * Whether a device or parameter sits on the track.
 * @param object - A device, chain or parameter
 * @param track - The track
 * @returns True when the object's path names that track
 */
export function isOnTrack(object: LiveAPI, track: EnvelopeTrack): boolean {
  const index =
    track.kind === "return" ? object.returnTrackIndex : object.trackIndex;

  return object.category === track.kind && index === track.index;
}
