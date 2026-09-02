// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The signal a track carries, as a spreadable field.
 *
 * Only a regular track has a choice. A return or the main track is audio-only,
 * and its path (`rt0`, `mt`) already says which it is, so the field is left
 * off entirely: "audio" there would read as an invitation to put an audio clip
 * on it, which Live does not allow.
 * @param isMidiTrack - Whether the track takes MIDI input
 * @param category - Internal category: "regular", "return", or "master"
 * @returns `{ type }` for a regular track, `{}` for the others
 */
export function trackTypeField(
  isMidiTrack: boolean,
  category: string,
): { type?: string } {
  if (category !== "regular") return {};

  return { type: isMidiTrack ? "midi" : "audio" };
}
