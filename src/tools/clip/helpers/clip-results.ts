// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { errorMessage } from "#src/shared/error-message.ts";
import { joinDetails } from "#src/tools/shared/helpers/entry-details.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  clipOverwriteNote,
  copyClipToSlot,
} from "#src/tools/shared/clip/copy-clip-to-slot.ts";
import {
  createMissingScenes,
  withCreatedScenes,
} from "#src/tools/shared/clip/create-missing-scenes.ts";
import {
  type ScratchSlot,
  withScratchSlot,
} from "#src/tools/shared/clip/scratch-slot.ts";
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
  /** Notes the transforms changed; 0 when they changed none */
  transformed?: number;
  /** Notes the transforms removed (left out when 0) */
  deletedNotes?: number;
  /** Set only when the call changed the length itself (see duplicateLoop). */
  length?: string;
}

export interface ClipResult {
  id: string;
  noteCount?: number;
  /** Notes the transforms changed and left in the clip; 0 when none changed. */
  transformed?: number;
  /** Notes the transforms removed; not sent when 0. */
  deletedNotes?: number;
  /** Where the clip is, as a path. Pastes back into any path/toPath param. */
  path?: string;
  /** The start the clip ended up at, when Live kept a different one. */
  start?: string;
  /** The length the clip ended up at, when the call moved it off the arg. */
  length?: string;
  /** The time signature Live kept, when it isn't the one asked for. */
  timeSignature?: string;
  /** The audio values Live kept in place of the ones asked for. */
  gainDb?: number;
  pitchShift?: number;
  warpMode?: string;
  /** The span left on the arrangement, when the call cut it short. */
  arrangementLength?: string;
  /** The palette color Live settled on, when it isn't the one asked for. */
  color?: string;
  /** The scenes the destination had to make ("s8-s9"), when it made any. */
  created?: string;
  /**
   * How many of the `envelopes` lines landed, or why none could: an arrangement
   * clip has no envelopes of its own, and only the remote script reaches them.
   * A line that failed on its own says so in `detail`.
   */
  envelopes?: number | string;
  /**
   * Why the update didn't go as asked, when something landed anyway: a move
   * Live turned down, a param this clip has no use for, a leftover on a take
   * lane. Anything about a clip the call named belongs here.
   */
  detail?: string;
}

/**
 * Build clip result object with optional note stats. The caller passes the
 * path, read off a clip it already holds — resolving the id here would cost a
 * LiveAPI build per clip returned.
 * @param clipId - The clip ID
 * @param noteResult - Optional note update result with count and transformed/deletedNotes
 * @param path - Where the clip is, from objectPathForApi
 * @returns Result object with id, path, and optionally noteCount/transformed/deletedNotes/length
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

    if (noteResult.deletedNotes != null) {
      result.deletedNotes = noteResult.deletedNotes;
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
  /** What Live wouldn't clear away after the clip landed (a scratch clip or scene) */
  leftover?: string;
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

  try {
    return {
      ...fillSessionSlot(trackIndex, sceneIndex, create, sampleFile),
      created,
    };
  } catch (error) {
    // The scenes stay in the Set, so the failure has to name them.
    if (created == null) {
      throw error;
    }

    throw new Error(withCreatedScenes(errorMessage(error), created), {
      cause: error,
    });
  }
}

/**
 * Create a clip in a slot that exists, replacing the clip already there.
 * @param trackIndex - Track index (0-based)
 * @param sceneIndex - Target scene index (0-based)
 * @param create - Makes the clip in the empty slot it's given
 * @param sampleFile - The file an audio create loads, to name if Live refuses
 * @returns The new clip, and what it replaced
 * @throws When Live created no clip
 */
function fillSessionSlot(
  trackIndex: number,
  sceneIndex: number,
  create: (clipSlot: LiveAPI) => void,
  sampleFile: string | undefined,
): Omit<SessionSlotCreate, "created"> {
  const destPath = slotPath(trackIndex, sceneIndex);
  const clipSlot = LiveAPI.from(
    livePath.track(trackIndex).clipSlot(sceneIndex),
  );

  if (!clipSlot.getProperty("has_clip")) {
    create(clipSlot);

    return {
      clip: requireCreatedSessionClip(clipSlot, destPath, sampleFile),
      overwrote: null,
    };
  }

  // The copy can land and the scratch scene's removal still throw, which loses
  // the copy's return value: keep it where the throw can't reach.
  const done: { replaced?: Replaced } = {};
  let sceneLeftover: string | undefined;

  try {
    withScratchSlot(trackIndex, sceneIndex, (scratch) => {
      done.replaced = replaceFromScratch(
        scratch,
        clipSlot,
        destPath,
        create,
        sampleFile,
      );
    });
  } catch (error) {
    if (done.replaced == null) {
      throw error;
    }

    sceneLeftover = `couldn't remove the scratch scene: ${errorMessage(error)}`;
  }

  const { clip, leftover } = done.replaced as Replaced;
  const left = joinDetails([leftover, sceneLeftover]);

  return {
    clip,
    overwrote: clipOverwriteNote(destPath),
    ...(left == null ? {} : { leftover: left }),
  };
}

/** The clip a replace left at its destination, and any clean-up it couldn't do. */
interface Replaced {
  clip: LiveAPI;
  leftover?: string;
}

/**
 * Build the clip in the scratch slot and copy it onto the occupied one. The
 * scratch slot is emptied afterwards whatever happened.
 * @param scratch - An empty slot on the destination's track
 * @param destSlot - The occupied destination
 * @param destPath - The destination, as a path
 * @param create - Makes the clip in the slot it's given
 * @param sampleFile - The file an audio create loads, or undefined
 * @returns The new clip at the destination, and any scratch clip left behind
 * @throws When no clip landed, saying the one there was not touched
 */
function replaceFromScratch(
  scratch: ScratchSlot,
  destSlot: LiveAPI,
  destPath: string,
  create: (clipSlot: LiveAPI) => void,
  sampleFile: string | undefined,
): Replaced {
  let copy: LiveAPI | null = null;
  let failure: unknown;

  try {
    create(scratch.slot);
    requireCreatedSessionClip(scratch.slot, destPath, sampleFile);
    copy = copyClipToSlot(scratch.slot, destSlot);

    if (copy == null) {
      throw new Error(`Live didn't copy the new clip onto ${destPath}`);
    }
  } catch (error) {
    failure = error;
  }

  // Whatever happened: a throw here must not hide a copy that landed.
  const leftover = clearScratchClip(scratch);

  if (copy == null) {
    const also = leftover == null ? "" : `; ${leftover}`;

    throw new Error(
      `${errorMessage(failure)}; the clip at ${destPath} was not touched${also}`,
      { cause: failure },
    );
  }

  return leftover == null ? { clip: copy } : { clip: copy, leftover };
}

/**
 * Empty the scratch slot.
 * @param scratch - The scratch slot
 * @returns Why it couldn't be emptied, or undefined when it is
 */
function clearScratchClip(scratch: ScratchSlot): string | undefined {
  try {
    if (scratch.slot.getProperty("has_clip")) {
      scratch.slot.call("delete_clip");
    }

    return undefined;
  } catch (error) {
    return `couldn't clear the scratch clip at ${scratch.path}: ${errorMessage(error)}`;
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
