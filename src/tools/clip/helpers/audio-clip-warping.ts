// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { audioClipSampleSeconds } from "#src/tools/clip/helpers/audio-clip-timing.ts";

/**
 * Set an audio clip's warp state.
 *
 * Shared by create-clip and update-clip so `warping: false` means the same
 * thing in both: a bare `set("warping", 0)` leaves the stale beat value in
 * `end_marker` to be reread as seconds, giving the same flag on the same clip
 * two different regions depending on which tool set it.
 *
 * A null/undefined request leaves the current state alone. On create that means
 * keeping Live's own choice, which follows the user's "Loop/Warp Short Samples"
 * setting — something the Live API cannot read.
 *
 * @param clip - The audio clip
 * @param warping - Requested warp state, or null to leave it as is
 */
export function applyAudioClipWarping(
  clip: LiveAPI,
  warping: boolean | null | undefined,
): void {
  if (warping === false) {
    unwarpAudioClip(clip);
  } else if (warping === true) {
    // Switching warp on converts the markers from seconds to beats, so the
    // region still spans the whole sample afterward
    clip.set("warping", 1);
  }
}

/**
 * Turn warping off and restate the end marker in seconds.
 *
 * Live reinterprets the marker properties as seconds without converting them,
 * so the end marker keeps whatever number the warped beat grid had put there.
 * Playback is unharmed — Live clamps at the file boundary — but the readable
 * region is wrong, and switching warp back on would convert that stale number
 * into beats and inflate the region.
 *
 * @param clip - The audio clip to unwarp
 */
function unwarpAudioClip(clip: LiveAPI): void {
  clip.set("warping", 0);

  const sampleSeconds = audioClipSampleSeconds(clip);

  if (sampleSeconds > 0) {
    clip.set("end_marker", sampleSeconds);
  }
}
