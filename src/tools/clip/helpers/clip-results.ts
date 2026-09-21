// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { clipOverwriteNote } from "#src/tools/shared/clip/copy-clip-to-slot.ts";
import { createMissingScenes } from "#src/tools/shared/clip/create-missing-scenes.ts";
import { objectPathForApi } from "#src/tools/shared/validation/object-path-for-api.ts";
import { slotPath } from "#src/tools/shared/validation/helpers/object-paths.ts";

export interface MidiNote {
  pitch: number;
  start_time: number;
  duration: number;
  velocity: number;
}

export interface NoteUpdateResult {
  noteCount: number;
  transformed?: number;
  /** Set only when the call changed the length itself (see duplicateLoop). */
  length?: string;
}

export interface ClipResult {
  id: string;
  noteCount?: number;
  transformed?: number;
  /** Where the clip is, as a path. Pastes back into any path/toPath param. */
  path?: string;
  /** The length the clip ended up at, when the call moved it off the arg. */
  length?: string;
  /** The span left on the arrangement, when the call cut it short. */
  arrangementLength?: string;
  /** The palette color Live settled on, when it isn't the one asked for. */
  color?: string;
  /** The scenes the destination had to make ("s8-s9"), when it made any. */
  created?: string;
  /**
   * How many of the `envelopes` lines landed, or why none could: an arrangement
   * clip has no envelopes of its own, and only the remote script reaches them.
   * A line that failed on its own says so in `reason`.
   */
  envelopes?: number | string;
  /**
   * Why the update didn't go as asked, when something landed anyway: a move
   * Live turned down, a param this clip has no use for, a leftover on a take
   * lane. Anything about a clip the call named belongs here (ADR-0042).
   */
  reason?: string;
  /**
   * Only when another clip in the same call landed on this one: true when this
   * clip is gone (`path` is the address it last had), false when it is still
   * there. A placement that failed destroys it just the same — it clears the
   * target range before the copy it never makes — so this says what became of
   * the clip, not whether the overwrite went to plan.
   */
  deleted?: boolean;
}

/**
 * Build clip result object with optional note stats. The caller passes the
 * path, read off a clip it already holds — resolving the id here would cost a
 * LiveAPI build per clip returned.
 * @param clipId - The clip ID
 * @param noteResult - Optional note update result with count and transformed
 * @param path - Where the clip is, from objectPathForApi
 * @returns Result object with id, path, and optionally noteCount/transformed/length
 */
export function buildClipResultObject(
  clipId: string,
  noteResult: NoteUpdateResult | null,
  path?: string,
): ClipResult {
  const result: ClipResult = { id: clipId };

  if (noteResult != null) {
    result.noteCount = noteResult.noteCount;

    if (noteResult.transformed != null) {
      result.transformed = noteResult.transformed;
    }

    if (noteResult.length != null) {
      result.length = noteResult.length;
    }
  }

  if (path != null) {
    result.path = path;
  }

  return result;
}

/**
 * Report a clip at its current position, for an update that didn't move it.
 * @param clip - The clip that stayed put
 * @param updatedClips - Array to collect results
 * @param noteResult - Note update result for result
 */
export function keepClip(
  clip: LiveAPI,
  updatedClips: ClipResult[],
  noteResult: NoteUpdateResult | null,
): void {
  updatedClips.push(
    buildClipResultObject(clip.id, noteResult, objectPathForApi(clip)),
  );
}

/** What reaching a session slot and clearing it for a new clip took. */
export interface SlotWork {
  /** The scenes this call created ("s8-s9"), or null when none were needed. */
  created: string | null;
  /** What the new clip replaced, or null when the slot was empty. */
  overwrote: string | null;
}

/** A slot ready for a clip, and what clearing it for one took. */
export interface PreparedClipSlot extends SlotWork {
  clipSlot: LiveAPI;
}

/**
 * Prepare a session clip slot, creating the scenes up to it if needed. A slot
 * that already holds a clip is emptied: writing into a slot replaces what is
 * there, the way duplicating or moving a clip into one does.
 * @param trackIndex - Track index (0-based)
 * @param sceneIndex - Target scene index (0-based)
 * @param liveSet - LiveAPI liveSet object
 * @returns The empty clip slot, the scenes created, and what it replaced
 */
export function prepareSessionClipSlot(
  trackIndex: number,
  sceneIndex: number,
  liveSet: LiveAPI,
): PreparedClipSlot {
  const created = createMissingScenes(sceneIndex, liveSet);
  const clipSlot = LiveAPI.from(
    livePath.track(trackIndex).clipSlot(sceneIndex),
  );

  if (!clipSlot.getProperty("has_clip")) {
    return { clipSlot, created, overwrote: null };
  }

  clipSlot.call("delete_clip");

  return {
    clipSlot,
    created,
    overwrote: clipOverwriteNote(slotPath(trackIndex, sceneIndex)),
  };
}

/**
 * The clip Live just put in the slot.
 * @param clipSlot - The slot the clip was created in
 * @param position - Where the clip was asked for, as a path
 * @returns The new clip
 * @throws When Live created no clip
 */
export function requireCreatedSessionClip(
  clipSlot: LiveAPI,
  position: string,
): LiveAPI {
  return requireCreatedClip(clipSlot.child("clip"), position);
}

/**
 * The clip a create call produced, or an error saying it made none.
 *
 * Live declines a create it can't do without raising. Sometimes nothing comes
 * back (id "0"); the arrangement create calls instead answer with another
 * object entirely, and id 1 is the Live Set. So existing is not enough: it has
 * to be a Clip. Left unchecked that ships as a successful create and poisons
 * every follow-up call that uses the id.
 *
 * The message names the position and nothing else. Callers pre-flight the
 * refusals that can be explained (clipCopyBlocker), so anything reaching here
 * is a refusal no guess would get right.
 * @param clip - What the create call produced
 * @param position - Where the clip was asked for, as a path
 * @returns The new clip
 * @throws When Live created no clip
 */
export function requireCreatedClip(clip: LiveAPI, position: string): LiveAPI {
  if (!clip.exists() || clip.type !== "Clip") {
    throw new Error(`Live created no clip at ${position}`);
  }

  return clip;
}
