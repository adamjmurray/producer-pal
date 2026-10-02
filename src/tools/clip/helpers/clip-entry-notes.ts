// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The facts about a clip that create-clip and update-clip put on its entry in
// the same words.

/**
 * What to say when notes sharing a pitch and start were collapsed into one.
 * @param count - How many notes were dropped
 * @returns The note for the clip's entry, or null when none were dropped
 */
export function droppedDuplicatesNote(count: number): string | null {
  return count > 0
    ? `dropped ${count} duplicate note${count === 1 ? "" : "s"} at the same pitch and start`
    : null;
}

/**
 * What to say when a transform was sent for a clip with no notes to change.
 * @param sent - The transform params that were sent, e.g. `["transforms"]`
 * @param hasMuted - Whether the clip has muted notes, which edits leave alone
 * @returns The note for the clip's entry
 */
export function transformsIgnoredNoNotesNote(
  sent: string[],
  hasMuted = false,
): string {
  return `${sent.join("/")} ignored: the clip has ${hasMuted ? "only muted notes, which edits leave alone" : "no notes"}`;
}

/**
 * What to say when a transform was sent for an audio clip, which has no notes.
 * @returns The note for the clip's entry
 */
export function transformsIgnoredAudioNote(): string {
  return "transforms ignored: the clip is audio";
}
