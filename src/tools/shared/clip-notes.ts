// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Get the note count within the playable region of a clip.
 * @param clip - LiveAPI clip object
 * @returns Number of notes in the playable region
 */
export function getPlayableNoteCount(clip: LiveAPI): number {
  const lengthBeats = clip.getProperty("length") as number;
  const result = JSON.parse(
    clip.call("get_notes_extended", 0, 128, 0, lengthBeats) as string,
  );

  return result?.notes?.length ?? 0;
}
