// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { errorMessage } from "#src/shared/error-utils.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  type ClipResult,
  keepClip,
  type NoteUpdateResult,
} from "#src/tools/clip/helpers/clip-result-helpers.ts";
import { copyClipToSlot } from "#src/tools/shared/clip/copy-clip-to-slot.ts";
import { recreateClipInSlot } from "#src/tools/shared/clip/recreate-clip.ts";
import { type ClipSlotPosition } from "#src/tools/shared/validation/position-parsing.ts";
import { slotPath } from "#src/tools/shared/validation/helpers/object-path-helpers.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";

/** What trying to build the replacement clip found. */
type RecreateAttempt =
  | { ok: true; clip: LiveAPI }
  | { ok: false; incomplete: boolean; error: unknown };

/** An empty clip slot found to stage a replacement clip in. */
interface ScratchSlot {
  slot: LiveAPI;
  path: string;
}

/**
 * Recreate the clip directly in a destination that's already empty — nothing
 * is at risk there, so there's no fallback to weigh.
 * @param clip - The arrangement clip being moved
 * @param destClipSlot - The empty destination
 * @param destPath - The destination, formatted for a warning
 * @param updatedClips - Array to collect results
 * @param noteResult - Note update result for result
 * @returns The new clip, or null when the move failed (already reported)
 */
export function recreateIntoEmptySlot(
  clip: LiveAPI,
  destClipSlot: LiveAPI,
  destPath: string,
  updatedClips: ClipResult[],
  noteResult: NoteUpdateResult | null,
): LiveAPI | null {
  const attempt = attemptRecreate(clip, destClipSlot);

  if (attempt.ok) return attempt.clip;

  reportMoveFailure(clip, attempt, destPath, "n/a", destPath);
  keepClip(clip, updatedClips, noteResult);

  return null;
}

/**
 * Recreate the clip onto an occupied destination without destroying the
 * occupant when the track has room to build the replacement first: create it
 * in an empty slot elsewhere on the same track, verify it landed whole, then
 * swap it onto the destination with the same atomic duplicate_clip_to
 * handleClipSlotMove already uses — Live overwrites in place there, no
 * pre-delete needed. Only when the track has nowhere to build in does this
 * fall back to deleting the occupant up front, which can lose it if the
 * create then fails.
 * @param clip - The arrangement clip being moved
 * @param toSlot - Destination slot position
 * @param destClipSlot - The occupied destination
 * @param destPath - The destination, formatted for a warning
 * @param updatedClips - Array to collect results
 * @param noteResult - Note update result for result
 * @returns The new clip, or null when the move failed (already reported)
 */
export function recreateIntoOccupiedSlot(
  clip: LiveAPI,
  toSlot: ClipSlotPosition,
  destClipSlot: LiveAPI,
  destPath: string,
  updatedClips: ClipResult[],
  noteResult: NoteUpdateResult | null,
): LiveAPI | null {
  const scratch = findScratchSlot(toSlot);

  if (scratch == null) {
    return recreateOverOccupant(
      clip,
      destClipSlot,
      destPath,
      updatedClips,
      noteResult,
    );
  }

  return recreateViaScratchSlot(
    clip,
    scratch,
    destClipSlot,
    destPath,
    updatedClips,
    noteResult,
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
 * @returns The new clip, or which way the attempt failed
 */
function attemptRecreate(sourceClip: LiveAPI, slot: LiveAPI): RecreateAttempt {
  try {
    return {
      ok: true,
      clip: recreateClipInSlot(sourceClip, slot, undefined, undefined),
    };
  } catch (error) {
    return { ok: false, incomplete: slot.child("clip").exists(), error };
  }
}

/**
 * An empty clip slot elsewhere on the destination's track, to stage the
 * replacement in before it overwrites the occupied destination. Searching
 * that track only — not the whole session — keeps the search bounded and
 * gets clip-type compatibility for free: a slot on the same track always
 * takes the same clip type the destination does. Arrangement->slot moves
 * often find one for free, too: a track driven from Arrangement usually has
 * Session scenes going unused.
 * @param toSlot - Destination slot position
 * @returns An empty ClipSlot, or null when the track has none to spare
 */
function findScratchSlot(toSlot: ClipSlotPosition): ScratchSlot | null {
  const destTrack = LiveAPI.from(livePath.track(toSlot.trackIndex));
  const sceneCount = destTrack.getChildCount("clip_slots");

  for (let sceneIndex = 0; sceneIndex < sceneCount; sceneIndex++) {
    if (sceneIndex === toSlot.sceneIndex) continue;

    const slot = LiveAPI.from(
      livePath.track(toSlot.trackIndex).clipSlot(sceneIndex),
    );

    if (!slot.getProperty("has_clip")) {
      return { slot, path: slotPath(toSlot.trackIndex, sceneIndex) };
    }
  }

  return null;
}

/**
 * Build the replacement in the scratch slot, then swap it onto the real
 * destination with duplicate_clip_to. The occupant is never touched by the
 * create — only the atomic copy can change it — so a failed create leaves it
 * exactly as it was.
 * @param clip - The arrangement clip being moved
 * @param scratch - The empty slot to build the replacement in
 * @param destClipSlot - The occupied destination
 * @param destPath - The destination, formatted for a warning
 * @param updatedClips - Array to collect results
 * @param noteResult - Note update result for result
 * @returns The new clip, or null when the move failed (already reported)
 */
function recreateViaScratchSlot(
  clip: LiveAPI,
  scratch: ScratchSlot,
  destClipSlot: LiveAPI,
  destPath: string,
  updatedClips: ClipResult[],
  noteResult: NoteUpdateResult | null,
): LiveAPI | null {
  const attempt = attemptRecreate(clip, scratch.slot);

  if (!attempt.ok) {
    reportMoveFailure(clip, attempt, scratch.path, "preserved", destPath);
    keepClip(clip, updatedClips, noteResult);

    return null;
  }

  const newClip = copyClipToSlot(scratch.slot, destClipSlot);

  scratch.slot.call("delete_clip");

  if (newClip == null) {
    console.warn(
      `clip ${targetLabel(clip)} was not moved: the copy onto ${destPath} did not land. The clip there and the source clip are both untouched.`,
    );
    keepClip(clip, updatedClips, noteResult);

    return null;
  }

  console.warn(
    `clip ${targetLabel(clip)} overwrote the existing clip at ${destPath}`,
  );

  return newClip;
}

/**
 * The original destroy-then-create path: delete the occupant, then try to
 * create in its place. Used only when the track has no empty slot to build
 * the replacement in first, so this is the one path where a failed create
 * loses the occupant.
 * @param clip - The arrangement clip being moved
 * @param destClipSlot - The occupied destination
 * @param destPath - The destination, formatted for a warning
 * @param updatedClips - Array to collect results
 * @param noteResult - Note update result for result
 * @returns The new clip, or null when the move failed (already reported)
 */
function recreateOverOccupant(
  clip: LiveAPI,
  destClipSlot: LiveAPI,
  destPath: string,
  updatedClips: ClipResult[],
  noteResult: NoteUpdateResult | null,
): LiveAPI | null {
  destClipSlot.call("delete_clip");

  const attempt = attemptRecreate(clip, destClipSlot);

  if (attempt.ok) {
    console.warn(
      `clip ${targetLabel(clip)} overwrote the existing clip at ${destPath}`,
    );

    return attempt.clip;
  }

  reportMoveFailure(clip, attempt, destPath, "lost", destPath);
  keepClip(clip, updatedClips, noteResult);

  return null;
}

/**
 * Warn about a failed recreate, naming exactly what's true afterward: whether
 * the destination's occupant survived, was lost, or was never touched, and
 * whether the attempt left an incomplete clip behind.
 * @param clip - The arrangement clip being moved
 * @param attempt - The failed attempt
 * @param attemptPath - Where the create was tried
 * @param occupant - Whether the destination's occupant is lost, preserved, or never had one
 * @param destPath - The destination, formatted for a warning
 */
function reportMoveFailure(
  clip: LiveAPI,
  attempt: { incomplete: boolean; error: unknown },
  attemptPath: string,
  occupant: "n/a" | "lost" | "preserved",
  destPath: string,
): void {
  const outcome = attempt.incomplete
    ? `create at ${attemptPath} started but didn't finish (${errorMessage(attempt.error)}); an incomplete clip is there now`
    : `create failed at ${attemptPath} (${errorMessage(attempt.error)})`;

  const occupantNote =
    occupant === "lost"
      ? ` The clip that was there before is gone and can't be recovered.`
      : occupant === "preserved"
        ? ` The clip at ${destPath} was not touched.`
        : "";

  console.warn(
    `clip ${targetLabel(clip)} was not moved: ${outcome}.${occupantNote} The source clip in the arrangement is untouched.`,
  );
}
