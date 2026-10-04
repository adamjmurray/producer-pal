// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The facts about a clip that create-clip and update-clip put on its entry in
// the same words.

import { CLIP_IS_AUDIO, ignoredText } from "#src/shared/max/ignored-wording.ts";

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
  return ignoredText(
    sent,
    `the clip has ${hasMuted ? "only muted notes, which edits leave alone" : "no notes"}`,
  );
}

/**
 * What to say when a transform was sent for an audio clip, which has no notes.
 * @returns The note for the clip's entry
 */
export function transformsIgnoredAudioNote(): string {
  return ignoredText("transforms", CLIP_IS_AUDIO);
}

/**
 * @param count - How many muted notes
 * @returns "1 muted note" or "3 muted notes"
 */
function mutedNotes(count: number): string {
  return `${count} muted note${count === 1 ? "" : "s"}`;
}

/**
 * What to say when a transform moved notes onto muted notes' pitch and start,
 * which replaces them.
 * @param count - How many muted notes were replaced
 * @returns The note for the clip's entry, or null when none were
 */
export function mutedReplacedNote(count: number): string | null {
  return count > 0
    ? `replaced ${mutedNotes(count)} at the same pitch and start`
    : null;
}

/**
 * What to say when overlapping muted notes changed a note's length: Live cuts
 * whichever same-pitch note starts earlier at the next one's start.
 * @param count - How many notes were shortened
 * @param mutedWasShortened - True when the shortened notes are the muted ones
 * @returns The note for the clip's entry, or null when none were shortened
 */
export function mutedOverlapNote(
  count: number,
  mutedWasShortened: boolean,
): string | null {
  if (count <= 0) {
    return null;
  }

  return mutedWasShortened
    ? `${mutedNotes(count)} shortened by an overlapping note`
    : `${count} note${count === 1 ? "" : "s"} shortened by an overlapping muted note`;
}

/**
 * What to say when a native Live op acted on muted notes, which edits
 * otherwise leave alone.
 * @param op - What Live did to them
 * @param count - How many muted notes it acted on
 * @returns The note for the clip's entry, or null when there were none
 */
export function mutedNativeOpNote(
  op: "quantized" | "copied",
  count: number,
): string | null {
  return count > 0 ? `${op} ${mutedNotes(count)}` : null;
}

/**
 * What to say when a quantize on a clip with no visible notes moved nothing:
 * the muted notes were all it had to act on.
 * @returns The note for the clip's entry
 */
export function mutedOnlyQuantizeNote(): string {
  return "quantize moved nothing: the clip has only muted notes, and none moved";
}
