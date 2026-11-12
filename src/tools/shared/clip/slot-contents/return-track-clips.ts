// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Live 13 return tracks have a clip slot per scene, holding envelope clips: no
// notes, no sample, only automation. They take the same session writes as other
// clips (name, color, region, launch, delete, copy) except anything that needs
// notes or a sample, and they only move or copy between return-track slots.

import { liveVersionAtLeast } from "#src/tools/shared/helpers/live-api-values.ts";

/** Return-track clips exist from this Live version on. */
const RETURN_CLIPS_MIN_VERSION = "13.0";

/** Why a return-track clip path is refused on Live 12. */
export const RETURN_CLIPS_NEED_LIVE_13 = "return-track clips need Live 13";

/** Why a clip can't be created in a return track's slot, now or later. */
export const ENVELOPE_CLIPS_CANT_BE_CREATED =
  "envelope clips can't be created; make one in Live";

/** Why an envelope clip can't go to any other place than a return-track slot. */
export const ENVELOPE_CLIP_ONLY_TO_RETURN_SLOT =
  "an envelope clip can only go to a return-track slot";

/** Why a clip that isn't an envelope clip can't go to a return-track slot. */
export const RETURN_SLOT_ONLY_TAKES_ENVELOPE_CLIPS =
  "a return-track slot only takes an envelope clip";

/** Why `envelopes` can't be written to an envelope clip yet. */
export const ENVELOPES_ON_RETURN_CLIPS_NOT_YET =
  "return-track clips can't take envelopes yet";

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
 * Whether a clip sits in a return track's clip slot, which makes it an
 * envelope clip: nothing else lives there.
 * @param clip - Any clip
 * @returns True for a return-track clip
 */
export function isReturnTrackClip(clip: LiveAPI): boolean {
  return clip.returnClipSlotIndex != null;
}

/**
 * Why a clip can't go to a return-track slot, or null when it can. A slot
 * there takes envelope clips only, and only on Live 13.
 * @param clip - The clip to copy or move
 * @returns The reason, or null
 */
export function returnSlotCopyBlocker(clip: LiveAPI): string | null {
  if (!returnClipsExist()) {
    return RETURN_CLIPS_NEED_LIVE_13;
  }

  return isReturnTrackClip(clip) ? null : RETURN_SLOT_ONLY_TAKES_ENVELOPE_CLIPS;
}
