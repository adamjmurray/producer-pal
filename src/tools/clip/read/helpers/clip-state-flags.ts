// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/** The state flags of a clip read; each is present only when true. */
export interface ClipStateFlags {
  playing?: boolean;
  triggered?: boolean;
  recording?: boolean;
  overdubbing?: boolean;
  muted?: boolean;
  /** Session clips only: the clip has automation. */
  envs?: boolean;
}

/**
 * Add boolean state properties (playing, triggered, recording, overdubbing,
 * muted, envs). Only includes properties that are true
 * @param result - Result object to add properties to
 * @param clip - LiveAPI clip object
 * @param isArrangementClip - Arrangement clips never get `envs`: their
 *   envelopes can't be read or written
 */
export function addBooleanStateProperties(
  result: ClipStateFlags,
  clip: LiveAPI,
  isArrangementClip: boolean,
): void {
  if ((clip.getProperty("is_playing") as number) > 0) {
    result.playing = true;
  }

  if ((clip.getProperty("is_triggered") as number) > 0) {
    result.triggered = true;
  }

  if ((clip.getProperty("is_recording") as number) > 0) {
    result.recording = true;
  }

  if ((clip.getProperty("is_overdubbing") as number) > 0) {
    result.overdubbing = true;
  }

  if ((clip.getProperty("muted") as number) > 0) {
    result.muted = true;
  }

  if (!isArrangementClip && (clip.getProperty("has_envelopes") as number) > 0) {
    result.envs = true;
  }
}
