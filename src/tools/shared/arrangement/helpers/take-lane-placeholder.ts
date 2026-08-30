// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Emptying a take-lane clip in place, for the moves Live's API can't finish.
 *
 * A move is copy-then-delete, and there is no take-lane delete (see the notes
 * in take-lane-helpers.ts). Clearing the original where it stands is the
 * closest Live allows, and what's left is an obvious, muted marker to delete in
 * the UI.
 *
 * MIDI really does empty — the notes go. Audio can't: a clip's sample can't be
 * swapped, and writing a silent clip over it doesn't work either, because an
 * arrangement clip's extent can't be stretched from the LOM (see the API notes
 * in take-lane-helpers.ts). So an audio take is muted and marked instead.
 */

import * as console from "#src/shared/max/v8-max-console.ts";
import { removeAllClipNotes } from "#src/tools/shared/clip/clip-notes.ts";
import { arrangementPath } from "#src/tools/shared/validation/object-path-helpers.ts";
import { takeLaneIndexOfClip } from "./take-lane-helpers.ts";

/** Marks the leftover so it reads as debris, not content. */
const PLACEHOLDER_PREFIX = "(moved)";

/**
 * Clear a take-lane clip in place, leaving a muted placeholder, and warn that
 * it needs deleting by hand.
 * @param clip - The take-lane clip whose content is being given up
 */
export function emptyTakeLaneClip(clip: LiveAPI): void {
  const sourceId = clip.id;
  const isMidi = clip.getProperty("is_midi_clip") === 1;
  const placeholderName =
    `${PLACEHOLDER_PREFIX} ${clip.getProperty("name") as string}`.trim();
  const lanePath = arrangementPath(
    clip.trackIndex ?? 0,
    takeLaneIndexOfClip(clip),
  );

  if (isMidi) {
    removeAllClipNotes(clip);
  }

  clip.setAll({ name: placeholderName, muted: 1 });

  console.warn(
    `clip ${sourceId} was ${isMidi ? "emptied" : "muted"} instead of deleted: Live's API can't remove a clip from a take lane` +
      (isMidi ? "" : ", and an audio clip's sample can't be cleared") +
      `. A muted "${placeholderName}" was left on ${lanePath} — delete it in Live's UI`,
  );
}
