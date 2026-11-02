// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// The facts about a clip that create-clip and update-clip put on its entry in
// the same words.

import { CLIP_IS_AUDIO, ignoredText } from "#src/shared/max/ignored-wording.ts";
import {
  type TransformCounts,
  type TransformOutcome,
} from "#src/notation/transform/transformed-count.ts";
import { plural } from "#src/tools/shared/validation/lists/plural.ts";

/**
 * What to say when notes sharing a pitch and start were collapsed into one.
 * @param count - How many notes were dropped
 * @returns The note for the clip's entry, or null when none were dropped
 */
export function droppedDuplicatesNote(count: number): string | null {
  return count > 0
    ? `dropped ${plural(count, "duplicate note")} at the same pitch and start`
    : null;
}

/**
 * @param count - How many notes
 * @returns "1 note" or "3 notes"
 */
function notesCount(count: number): string {
  return plural(count, "note");
}

/**
 * What to say when notes start outside the clip's region (before it or at its
 * end), where Live keeps them but never plays them.
 * @param count - How many notes lie outside the region
 * @returns The note for the clip's entry, or null when none do
 */
export function notesOutsideRegionNote(count: number): string | null {
  return count > 0
    ? `${notesCount(count)} ${count === 1 ? "is" : "are"} outside the region and won't play`
    : null;
}

/**
 * What to say when a write put notes outside the clip's region.
 * @param count - How many of the notes the call wrote lie outside the region
 * @returns The note for the clip's entry, or null when none do
 */
export function notesLandedOutsideNote(count: number): string | null {
  return count > 0
    ? `${notesCount(count)} landed outside the region and won't play`
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
 * What to say when transforms ran and changed nothing, so `transformed: 0`
 * isn't read as a failure. The two causes need different fixes: a selector that
 * matched nothing, or transforms that left what they matched as it was. Says
 * nothing when a statement failed or was skipped: that has its own detail.
 * @param outcome - What the transforms did, or undefined when none ran
 * @param counts - The counts reported for them
 * @returns The note for the clip's entry, or null when something changed
 */
export function transformsChangedNothingNote(
  outcome: TransformOutcome | undefined,
  counts: TransformCounts,
): string | null {
  if (
    outcome?.selected !== true ||
    outcome.failed ||
    counts.transformed !== 0 ||
    counts.deletedNotes
  ) {
    return null;
  }

  const matched = outcome.matched.size;

  if (matched === 0) {
    return "no notes matched the selector";
  }

  return matched === 1
    ? "the transforms didn't change the 1 matched note"
    : `the transforms changed none of the ${matched} matched notes`;
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
  return plural(count, "muted note");
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
    : `${notesCount(count)} shortened by an overlapping muted note`;
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
