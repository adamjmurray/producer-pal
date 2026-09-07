// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { objectPathForApi } from "#src/tools/shared/validation/object-path-for-api.ts";
import { slotPath } from "#src/tools/shared/validation/helpers/object-path-helpers.ts";

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
  /**
   * Only when another clip in the same call was set to land on this one: true
   * when this clip is gone (`path` is its address from before the call), false
   * when it is still there. A placement that failed can destroy it anyway — it
   * clears the target range before the copy it never makes — so this reports
   * what became of the clip, not whether the overwrite went to plan.
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

  if (path != null) result.path = path;

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

/**
 * Prepare a session clip slot, auto-creating scenes if needed
 * @param trackIndex - Track index (0-based)
 * @param sceneIndex - Target scene index (0-based)
 * @param liveSet - LiveAPI liveSet object
 * @param maxAutoCreatedScenes - Maximum number of scenes allowed
 * @returns The clip slot ready for clip creation
 */
export function prepareSessionClipSlot(
  trackIndex: number,
  sceneIndex: number,
  liveSet: LiveAPI,
  maxAutoCreatedScenes: number,
): LiveAPI {
  if (sceneIndex >= maxAutoCreatedScenes) {
    throw new Error(
      `scene "s${sceneIndex}" is out of range: scenes auto-create only through "s${maxAutoCreatedScenes - 1}"`,
    );
  }

  const currentSceneCount = liveSet.getChildIds("scenes").length;

  if (sceneIndex >= currentSceneCount) {
    const scenesToCreate = sceneIndex - currentSceneCount + 1;

    for (let j = 0; j < scenesToCreate; j++) {
      liveSet.call("create_scene", -1);
    }
  }

  const clipSlot = LiveAPI.from(
    livePath.track(trackIndex).clipSlot(sceneIndex),
  );

  if (clipSlot.getProperty("has_clip")) {
    throw new Error(
      `a clip already exists at ${slotPath(trackIndex, sceneIndex)}`,
    );
  }

  return clipSlot;
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
