// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { errorMessage } from "#src/shared/error-message.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  clipOverwriteNote,
  copyClipToSlot,
} from "#src/tools/shared/clip/copy-clip-to-slot.ts";
import { createMissingScenes } from "#src/tools/shared/clip/create-missing-scenes.ts";
import { withScratchSlot } from "#src/tools/shared/clip/scratch-slot.ts";
import { objectPathForApi } from "#src/tools/shared/validation/object-path-for-api.ts";
import { type ArrangementLane } from "#src/tools/shared/validation/helpers/object-path-position.ts";
import {
  arrangementPath,
  arrangementPositionPath,
  slotPath,
} from "#src/tools/shared/validation/helpers/object-paths.ts";

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
   * Why the update didn't go as asked, when something landed anyway: a move
   * Live turned down, a param this clip has no use for, a leftover on a take
   * lane. Anything about a clip the call named belongs here (ADR-0042).
   */
  reason?: string;
  /**
   * True when another clip in the same call left this one gone (`path` is the
   * address it last had). A placement that failed destroys it just the same —
   * it clears the target range before the copy it never makes — so this says
   * what became of the clip, not whether the overwrite went to plan.
   */
  deleted?: true;
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

/** The clip a session create made, and what reaching its slot took. */
export interface SessionSlotCreate extends SlotWork {
  clip: LiveAPI;
}

/**
 * Create a clip in a session slot, creating the scenes up to it if needed. A
 * clip already there is replaced, the way duplicating or moving a clip into
 * the slot does, but never deleted first: the new clip is built in an empty
 * slot and copied over, so a create Live refuses (a bad sampleFile) leaves it.
 * @param trackIndex - Track index (0-based)
 * @param sceneIndex - Target scene index (0-based)
 * @param liveSet - LiveAPI liveSet object
 * @param create - Makes the clip in the empty slot it's given
 * @param sampleFile - The file an audio create loads, to name if Live refuses
 * @returns The new clip, the scenes created, and what it replaced
 */
export function createInSessionSlot(
  trackIndex: number,
  sceneIndex: number,
  liveSet: LiveAPI,
  create: (clipSlot: LiveAPI) => void,
  sampleFile?: string,
): SessionSlotCreate {
  const created = createMissingScenes(sceneIndex, liveSet);
  const destPath = slotPath(trackIndex, sceneIndex);
  const clipSlot = LiveAPI.from(
    livePath.track(trackIndex).clipSlot(sceneIndex),
  );

  if (!clipSlot.getProperty("has_clip")) {
    create(clipSlot);

    return {
      clip: requireCreatedSessionClip(clipSlot, destPath, sampleFile),
      created,
      overwrote: null,
    };
  }

  const clip = withScratchSlot(trackIndex, sceneIndex, (scratch) =>
    replaceFromScratch(scratch.slot, clipSlot, destPath, create, sampleFile),
  );

  return { clip, created, overwrote: clipOverwriteNote(destPath) };
}

/**
 * Build the clip in the scratch slot and copy it onto the occupied one. The
 * scratch slot is emptied afterwards whatever happened.
 * @param scratchSlot - An empty slot on the destination's track
 * @param destSlot - The occupied destination
 * @param destPath - The destination, as a path
 * @param create - Makes the clip in the slot it's given
 * @param sampleFile - The file an audio create loads, or undefined
 * @returns The new clip at the destination
 * @throws When no clip landed, saying the one there was not touched
 */
function replaceFromScratch(
  scratchSlot: LiveAPI,
  destSlot: LiveAPI,
  destPath: string,
  create: (clipSlot: LiveAPI) => void,
  sampleFile: string | undefined,
): LiveAPI {
  try {
    create(scratchSlot);
    requireCreatedSessionClip(scratchSlot, destPath, sampleFile);

    const copy = copyClipToSlot(scratchSlot, destSlot);

    if (copy == null) {
      throw new Error(`Live didn't copy the new clip onto ${destPath}`);
    }

    return copy;
  } catch (error) {
    throw new Error(
      `${errorMessage(error)}; the clip at ${destPath} was not touched`,
      { cause: error },
    );
  } finally {
    if (scratchSlot.getProperty("has_clip")) {
      scratchSlot.call("delete_clip");
    }
  }
}

/**
 * The clip Live just put in the slot.
 * @param clipSlot - The slot the clip was created in
 * @param position - Where the clip was asked for, as a path
 * @param sampleFile - The file an audio create loaded, or undefined
 * @returns The new clip
 * @throws When Live created no clip
 */
export function requireCreatedSessionClip(
  clipSlot: LiveAPI,
  position: string,
  sampleFile?: string,
): LiveAPI {
  return requireCreatedClip(clipSlot.child("clip"), position, sampleFile);
}

/**
 * The clip an arrangement create just made.
 * @param createResult - What `create_midi_clip`/`create_audio_clip` returned
 * @param trackIndex - The track it was asked for
 * @param takeLane - The take lane it was asked for, or null for the main lane
 * @param startBeats - Where it was asked to start, in Ableton beats
 * @param sampleFile - The file an audio create loaded, or undefined
 * @returns The new clip
 * @throws When Live created no clip
 */
export function requireCreatedArrangementClip(
  createResult: string,
  trackIndex: number,
  takeLane: number | null,
  startBeats: number | null,
  sampleFile?: string,
): LiveAPI {
  const lane: ArrangementLane =
    takeLane == null
      ? { kind: "track", trackIndex }
      : { kind: "take-lane", trackIndex, laneIndex: takeLane };
  const position =
    startBeats == null
      ? arrangementPath(trackIndex, takeLane)
      : arrangementPositionPath(lane, startBeats);

  return requireCreatedClip(LiveAPI.from(createResult), position, sampleFile);
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
 * The message names the position, and the file for an audio create — the
 * usual cause, which Live never states. Nothing else is guessed: callers
 * pre-flight the refusals that can be explained (clipCopyBlocker).
 * @param clip - What the create call produced
 * @param position - Where the clip was asked for, as a path
 * @param sampleFile - The file an audio create loaded, or undefined
 * @returns The new clip
 * @throws When Live created no clip
 */
export function requireCreatedClip(
  clip: LiveAPI,
  position: string,
  sampleFile?: string,
): LiveAPI {
  if (!clip.exists() || clip.type !== "Clip") {
    const from = sampleFile == null ? "" : ` from sampleFile "${sampleFile}"`;

    throw new Error(`Live created no clip at ${position}${from}`);
  }

  return clip;
}
