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
    // Verified in Live: switching warp on converts every marker from seconds to
    // beats, so the region survives and no restatement is needed
    clip.set("warping", 1);
  }
}

/**
 * Turn warping off and restate the end marker in seconds.
 *
 * Verified in Live: switching warp off maps `start_marker`, `loop_start` and
 * `loop_end` through the warp grid into seconds, and forces `looping` off — but
 * leaves `end_marker` holding the beat number, which then reads as seconds.
 * Playback is unharmed (Live clamps at the file boundary) but the readable
 * region is wrong, and switching warp back on would map that stale number and
 * inflate the clip.
 *
 * Restating it as the sample duration resets the region to the whole file. That
 * loses a shorter region requested in the same call — see the known limitation
 * under "Audio Clip Warping" in dev/Coding-Standards.md.
 *
 * @param clip - The audio clip to unwarp
 */
function unwarpAudioClip(clip: LiveAPI): void {
  // Already unwarped: end_marker is seconds and Live's own conversion is a
  // no-op, so restating would blow an existing region out to the whole sample.
  if ((clip.getProperty("warping") as number) <= 0) return;

  clip.set("warping", 0);

  const sampleSeconds = audioClipSampleSeconds(clip);

  if (sampleSeconds > 0) {
    clip.set("end_marker", sampleSeconds);
  }
}
