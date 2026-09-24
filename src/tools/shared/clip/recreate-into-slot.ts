// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { errorMessage } from "#src/shared/error-message.ts";
import { copyClipToSlot } from "#src/tools/shared/clip/copy-clip-to-slot.ts";
import { recreateClipInSlot } from "#src/tools/shared/clip/recreate-clip.ts";
import {
  type ScratchSlot,
  withScratchSlot,
} from "#src/tools/shared/clip/scratch-slot.ts";
import { type ClipSlotPosition } from "#src/tools/shared/validation/position-parsing.ts";
import { slotPath } from "#src/tools/shared/validation/helpers/object-paths.ts";

/**
 * What re-creating a clip into a slot came to. A failure's reason says what's
 * true afterward at the destination; the source is never touched here.
 */
export type SlotRecreate =
  | { ok: true; clip: LiveAPI; overwrote: boolean }
  | { ok: false; reason: string };

/** Name and color for the new clip. */
export interface RecreateLabels {
  name?: string;
  color?: string;
}

/** What trying to build the replacement clip found. */
type RecreateAttempt =
  | { ok: true; clip: LiveAPI }
  | { ok: false; incomplete: boolean; error: unknown };

/**
 * Re-create a clip (usually an arrangement clip, which Live can't copy into a
 * slot) in a session clip slot.
 *
 * An occupied destination is never deleted first: the clip is built in an
 * empty slot on the same track, then swapped onto the destination with
 * duplicate_clip_to, which overwrites in place.
 * @param sourceClip - The clip to copy
 * @param toSlot - Destination slot position
 * @param destClipSlot - The destination slot
 * @param labels - Name and color for the new clip
 * @param losses - What the re-create lost, added to
 * @returns The new clip, or why none landed
 */
export function recreateIntoSlot(
  sourceClip: LiveAPI,
  toSlot: ClipSlotPosition,
  destClipSlot: LiveAPI,
  labels: RecreateLabels,
  losses: string[],
): SlotRecreate {
  const destPath = slotPath(toSlot.trackIndex, toSlot.sceneIndex);
  const build = (slot: LiveAPI): RecreateAttempt =>
    attemptRecreate(sourceClip, slot, labels, losses);

  if (!destClipSlot.getProperty("has_clip")) {
    const attempt = build(destClipSlot);

    return attempt.ok
      ? { ok: true, clip: attempt.clip, overwrote: false }
      : failure(attempt, destPath, "n/a", destPath);
  }

  return withScratchSlot(toSlot.trackIndex, toSlot.sceneIndex, (scratch) =>
    recreateViaScratchSlot(build, scratch, destClipSlot, destPath),
  );
}

// --- Helpers below main exports ---

/**
 * Recreate the source clip in `slot`, telling apart two failure shapes: Live
 * refused the create outright (nothing landed), or the create succeeded and a
 * later step — add_new_notes, setAll, the color write — is what threw. The
 * new clip's child existing afterward is what tells them apart: a refusal
 * throws from inside recreateClipInSlot before any child exists.
 * @param sourceClip - The clip being copied
 * @param slot - The (empty) slot to create in
 * @param labels - Name and color for the new clip
 * @param losses - What the re-create lost, added to
 * @returns The new clip, or which way the attempt failed
 */
function attemptRecreate(
  sourceClip: LiveAPI,
  slot: LiveAPI,
  labels: RecreateLabels,
  losses: string[],
): RecreateAttempt {
  try {
    return {
      ok: true,
      clip: recreateClipInSlot(
        sourceClip,
        slot,
        labels.name,
        labels.color,
        losses,
      ),
    };
  } catch (error) {
    return { ok: false, incomplete: slot.child("clip").exists(), error };
  }
}

/**
 * Build the replacement in the scratch slot, then swap it onto the real
 * destination with duplicate_clip_to. The occupant is never touched by the
 * create — only the atomic copy can change it — so a failed create leaves it
 * exactly as it was.
 * @param build - Re-creates the source clip in a given empty slot
 * @param scratch - The empty slot to build the replacement in
 * @param destClipSlot - The occupied destination
 * @param destPath - The destination, formatted for the entry
 * @returns The new clip, or why none landed
 */
function recreateViaScratchSlot(
  build: (slot: LiveAPI) => RecreateAttempt,
  scratch: ScratchSlot,
  destClipSlot: LiveAPI,
  destPath: string,
): SlotRecreate {
  const attempt = build(scratch.slot);

  if (!attempt.ok) {
    // The scratch slot is one this function picked, not one the caller
    // named, so clean up any partial clip rather than leaving debris in a
    // slot nothing points at. Live already misbehaved once in this slot, so
    // don't assume the delete lands either — read back what's really there.
    let wasCleared = false;

    if (attempt.incomplete) {
      try {
        scratch.slot.call("delete_clip");
      } catch {
        // Reported below either way: wasCleared reads back the real outcome.
      }

      wasCleared = !scratch.slot.child("clip").exists();
    }

    return failure(attempt, scratch.path, "preserved", destPath, wasCleared);
  }

  const newClip = copyClipToSlot(scratch.slot, destClipSlot);

  scratch.slot.call("delete_clip");

  if (newClip == null) {
    return {
      ok: false,
      reason: `the copy onto ${destPath} did not land; the clip there is untouched.`,
    };
  }

  return { ok: true, clip: newClip, overwrote: true };
}

/**
 * Say why the recreate failed, naming exactly what's true afterward: whether
 * the destination's occupant survived or was never there; whether
 * the attempt left an incomplete clip behind; and whether that was cleaned up.
 * @param attempt - The failed attempt
 * @param attemptPath - Where the create was tried
 * @param occupant - Whether the destination had an occupant, which survives
 * @param destPath - The destination, formatted for the entry
 * @param wasCleared - Whether an incomplete clip left behind was already deleted
 * @returns The failed outcome
 */
function failure(
  attempt: { incomplete: boolean; error: unknown },
  attemptPath: string,
  occupant: "n/a" | "preserved",
  destPath: string,
  wasCleared = false,
): SlotRecreate {
  const outcome = attempt.incomplete
    ? `create at ${attemptPath} started but didn't finish (${errorMessage(attempt.error)}); ` +
      (wasCleared
        ? "the incomplete clip left there was deleted"
        : "an incomplete clip is there now")
    : `create failed at ${attemptPath} (${errorMessage(attempt.error)})`;

  const occupantNote =
    occupant === "preserved" ? ` The clip at ${destPath} was not touched.` : "";

  return { ok: false, reason: `${outcome}.${occupantNote}` };
}
