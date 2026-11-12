// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Live 13 return tracks have a clip slot per scene, holding envelope clips: no
// notes, no sample, only automation. Tools can read them. Every write tool
// refuses one through the checks here, so lifting the refusal for a tool means
// changing one call site.

import { liveVersionAtLeast } from "#src/tools/shared/helpers/live-api-values.ts";

/** Return-track clips exist from this Live version on. */
const RETURN_CLIPS_MIN_VERSION = "13.0";

/** Why a return-track clip path is refused on Live 12. */
export const RETURN_CLIPS_NEED_LIVE_13 = "return-track clips need Live 13";

/** Why no tool changes a return-track clip yet. */
export const RETURN_CLIPS_READ_ONLY = "return-track clips can't be changed yet";

/** Why a clip can't be created in a return track's slot, now or later. */
export const ENVELOPE_CLIPS_CANT_BE_CREATED =
  "envelope clips can't be created; make one in Live";

/**
 * Whether this Live has return-track clips. The version is read once a request.
 * @returns True on Live 13 and later
 */
export function returnClipsExist(): boolean {
  return liveVersionAtLeast(RETURN_CLIPS_MIN_VERSION);
}

/**
 * Refuses a return-track clip slot path on a Live that has none.
 * @throws Error saying return-track clips need Live 13
 */
export function requireReturnClips(): void {
  if (!returnClipsExist()) {
    throw new Error(RETURN_CLIPS_NEED_LIVE_13);
  }
}

/**
 * Why a write can't go to a return-track clip slot: Live 12 has no such slot,
 * and Live 13's clips are read-only for now.
 * @returns The reason
 */
export function returnSlotWriteRefusal(): string {
  return returnClipsExist()
    ? RETURN_CLIPS_READ_ONLY
    : RETURN_CLIPS_NEED_LIVE_13;
}

/**
 * Why a clip can't be created in a return track's slot: Live 12 has no such
 * slot, and on Live 13 the clips there are made in Live.
 * @returns The reason
 */
export function returnSlotCreateRefusal(): string {
  return returnClipsExist()
    ? ENVELOPE_CLIPS_CANT_BE_CREATED
    : RETURN_CLIPS_NEED_LIVE_13;
}

/**
 * Whether a clip sits in a return track's clip slot.
 * @param clip - Any clip
 * @returns True for a return-track clip
 */
export function isReturnTrackClip(clip: LiveAPI): boolean {
  return clip.returnClipSlotIndex != null;
}

/**
 * Why a write tool can't act on a clip, or null when it can. Every write tool
 * asks this of each clip it resolves, by path or by id, before writing.
 * @param clip - The clip the call named
 * @returns The reason, or null
 */
export function returnClipWriteRefusal(clip: LiveAPI): string | null {
  return isReturnTrackClip(clip) ? RETURN_CLIPS_READ_ONLY : null;
}
