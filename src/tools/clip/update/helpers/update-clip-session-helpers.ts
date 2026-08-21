// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { namedParam, paramNamesSomething } from "#src/tools/shared/utils.ts";
import { errorMessage } from "#src/shared/error-utils.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  buildClipResultObject,
  type ClipResult,
  type NoteUpdateResult,
} from "#src/tools/clip/helpers/clip-result-helpers.ts";
import {
  clipCopyBlocker,
  copyClipToSlot,
} from "#src/tools/shared/copy-clip-to-slot.ts";
import {
  namedHiddenPath,
  pathEntries,
  pathNamesSomething,
  slotPath,
} from "#src/tools/shared/validation/object-path-helpers.ts";
import {
  formatObjectPath,
  parseObjectPath,
} from "#src/tools/shared/validation/object-path.ts";
import { parseSlotList } from "#src/tools/shared/validation/position-parsing.ts";
import { validateIdTypes } from "#src/tools/shared/validation/id-validation.ts";
import { handleArrangementOperations } from "./update-clip-arrangement-helpers.ts";

interface SlotPosition {
  trackIndex: number;
  sceneIndex: number;
}

/**
 * The param the caller used to name a destination, so a warning names one they
 * can act on rather than always saying toPath.
 * @param rawToPath - Destination path(s) as received
 * @param rawToSlot - Deprecated destination slot(s) as received
 * @returns "toSlot" when only the deprecated param named something, else "toPath"
 */
export function moveDestinationParam(
  rawToPath: string | undefined,
  rawToSlot: string | undefined,
): "toPath" | "toSlot" {
  // Silent: resolveMoveDestinations already warned about anything it dropped.
  return !paramNamesSomething(rawToPath) && pathNamesSomething(rawToSlot)
    ? "toSlot"
    : "toPath";
}

/**
 * Resolves where each clip in the batch moves, from toPath or the deprecated
 * toSlot. Warns and returns nulls for anything update-clip can't do, so the
 * rest of the update still runs.
 *
 * Destinations pair 1:1 with the clips and never cycle, unlike name and color: two
 * clips can share a name, but the second one sent to a slot overwrites the
 * first — which is a move that reports success and loses a clip.
 * @param rawToPath - Destination path(s), comma-separated (e.g., "t2/s3")
 * @param rawToSlot - Deprecated destination slot(s) (trackIndex/sceneIndex)
 * @param clipCount - How many clips the call named, before any are dropped
 * @returns One destination per named clip, null where there is nothing to move to
 */
export function resolveMoveDestinations(
  rawToPath: string | undefined,
  rawToSlot: string | undefined,
  clipCount: number,
): Array<SlotPosition | null> {
  const none = Array.from({ length: clipCount }, () => null);
  // A blank param names nothing, so read it as omitted rather than as a
  // destination that failed to parse.
  const toPath = namedParam(rawToPath, "toPath");
  const toSlot = namedHiddenPath(rawToSlot, "toSlot");

  // Honoring one and dropping the other would move the clip somewhere the
  // caller didn't ask for, so move it nowhere and say so.
  if (toPath != null && toSlot != null) {
    console.warn(
      "toPath and toSlot both name a destination, so no clip was moved; use toPath alone (toSlot is deprecated)",
    );

    return none;
  }

  if (toPath == null && toSlot == null) return none;

  // A bad destination is one param out of many on a batch update, and the
  // tool's rule is warn-and-skip so the notes still land. Neither param can be
  // empty here: namedHiddenPath drops a toSlot that names nothing, and toPath
  // refuses one when it splits its entries.
  try {
    const destinations =
      toSlot != null
        ? parseSlotList(toSlot, "toSlot")
        : pathDestinations(toPath as string);

    return pairWithClips(destinations, clipCount, toSlot == null);
  } catch (error) {
    console.warn(`clip not moved: ${errorMessage(error)}`);
  }

  return none;
}

interface RequestedClips {
  clips: LiveAPI[];
  destinationById: Map<string, SlotPosition>;
}

/**
 * Resolves the requested ids to clips, drops repeats, and gives each clip the
 * destination named at its own position in the call.
 *
 * Pairing happens here, against what the caller asked for, because an id that
 * doesn't resolve has to take its own destination with it. Pairing the
 * survivors by position instead slides every later clip onto the wrong slot,
 * and a move overwrites whatever it lands on.
 * @param requestedIds - Ids in call order, null where a path named no clip
 * @param destinations - One destination per requested entry
 * @returns The clips to update, and their destinations keyed by clip id
 */
export function resolveRequestedClips(
  requestedIds: Array<string | null>,
  destinations: Array<SlotPosition | null>,
): RequestedClips {
  const clips: LiveAPI[] = [];
  const destinationById = new Map<string, SlotPosition>();
  const claimedBy = new Map<string, string>();
  const seen = new Set<string>();
  let repeats = 0;

  for (const [index, id] of requestedIds.entries()) {
    if (id == null) continue;

    // One id at a time so the "does not exist" warnings stay in one place and
    // the survivor keeps the position it was named at.
    const clip = validateIdTypes([id], "clip", "updateClip", {
      skipInvalid: true,
    })[0];

    if (clip == null) continue;

    // An id and a path can name the same clip, as can a repeated id. Updating
    // it twice compounds every operation — duplicateLoop would double it again.
    if (seen.has(clip.id)) {
      repeats++;
      continue;
    }

    seen.add(clip.id);
    clips.push(clip);
    claimDestination(clip.id, destinations[index], {
      destinationById,
      claimedBy,
    });
  }

  if (repeats > 0) {
    console.warn(
      `id/path named ${repeats} clip(s) more than once; each clip was updated once`,
    );
  }

  dropDestinationsHoldingBatchClips(destinationById, seen);

  return { clips, destinationById };
}

/**
 * Gives a clip the destination named at its position, unless an earlier clip in
 * the batch is already moving there. Two clips sent to one slot means the second
 * overwrites the first, and the response then claims both are in it.
 * @param clipId - The clip being given a destination
 * @param destination - Where the call named it to go, if anywhere
 * @param batch - Destinations by clip id, and the clip claiming each slot, both added to
 */
function claimDestination(
  clipId: string,
  destination: SlotPosition | null | undefined,
  batch: {
    destinationById: Map<string, SlotPosition>;
    claimedBy: Map<string, string>;
  },
): void {
  if (destination == null) return;

  const slot = slotPath(destination.trackIndex, destination.sceneIndex);
  const claimant = batch.claimedBy.get(slot);

  if (claimant != null) {
    console.warn(
      `clip ${clipId} was not moved: clip ${claimant} is already moving to ${slot}; name one slot per clip`,
    );

    return;
  }

  batch.claimedBy.set(slot, clipId);
  batch.destinationById.set(clipId, destination);
}

/**
 * Drops a destination that holds another clip this call updates. The move would
 * overwrite that clip, and the batch would then work on a clip that no longer
 * exists and report it as updated — the loss the 1:1 pairing exists to prevent.
 * @param destinationById - Destinations by clip id, pruned in place
 * @param batchIds - Ids of every clip this call updates
 */
function dropDestinationsHoldingBatchClips(
  destinationById: Map<string, SlotPosition>,
  batchIds: Set<string>,
): void {
  for (const [clipId, { trackIndex, sceneIndex }] of destinationById) {
    const occupant = LiveAPI.from(
      livePath.track(trackIndex).clipSlot(sceneIndex).clip(),
    );

    // A clip's own slot is the no-op the move already handles.
    if (!occupant.exists() || occupant.id === clipId) continue;

    if (!batchIds.has(occupant.id)) continue;

    console.warn(
      `clip ${clipId} was not moved: ${slotPath(trackIndex, sceneIndex)} holds clip ` +
        `${occupant.id}, which this call also updates; move that clip out in its own call first`,
    );
    destinationById.delete(clipId);
  }
}

interface HandlePositionOperationsArgs {
  clip: LiveAPI;
  isAudioClip: boolean;
  toSlot?: SlotPosition | null;
  destinationParam: "toPath" | "toSlot";
  arrangementStartBeats?: number | null;
  arrangementLengthBeats?: number | null;
  tracksWithMovedClips: Map<number, number>;
  context: Partial<ToolContext>;
  updatedClips: ClipResult[];
  noteResult: NoteUpdateResult | null;
  isNonSurvivor: boolean;
}

/**
 * Handle clip position operations: clip slot move or arrangement operations
 * @param args - Operation arguments
 */
export function handlePositionOperations(
  args: HandlePositionOperationsArgs,
): void {
  const { clip, toSlot, arrangementStartBeats, arrangementLengthBeats } = args;
  const { destinationParam } = args;
  const isArrangementClip =
    (clip.getProperty("is_arrangement_clip") as number) > 0;

  if (toSlot != null && !isArrangementClip) {
    if (arrangementStartBeats != null || arrangementLengthBeats != null) {
      console.warn(
        `${destinationParam} ignored when arrangement parameters are specified`,
      );
    } else {
      handleSessionSlotMove({
        clip,
        toSlot,
        updatedClips: args.updatedClips,
        noteResult: args.noteResult,
      });

      return;
    }
  } else if (toSlot != null && isArrangementClip) {
    console.warn(
      `${destinationParam} ignored for arrangement clip (id ${clip.id}): only session clips move to a slot`,
    );
  }

  handleArrangementOperations({
    clip,
    isAudioClip: args.isAudioClip,
    arrangementStartBeats,
    arrangementLengthBeats,
    tracksWithMovedClips: args.tracksWithMovedClips,
    context: args.context,
    updatedClips: args.updatedClips,
    noteResult: args.noteResult,
    isNonSurvivor: args.isNonSurvivor,
  });
}

/**
 * Reads the clip slots off a toPath, warning about each entry that names
 * something update-clip can't move a clip to.
 * @param toPath - Destination path(s), comma-separated
 * @returns One destination per entry, null where the entry names no slot
 */
function pathDestinations(toPath: string): Array<SlotPosition | null> {
  // pathEntries refuses a toPath that names nothing, so every entry here is real.
  const entries = pathEntries(toPath, "toPath");

  // Per entry, so a typo costs its own move and not the whole batch. An entry
  // that names the wrong kind of place already worked this way; one that
  // doesn't parse at all used to discard every destination beside it.
  return entries.map((entry) => {
    try {
      const parsed = parseObjectPath(entry, "toPath");

      if (parsed.kind === "slot") {
        return { trackIndex: parsed.trackIndex, sceneIndex: parsed.sceneIndex };
      }

      console.warn(
        `toPath "${formatObjectPath(parsed)}" is not a clip slot, so that clip was not moved; ` +
          'update-clip moves a session clip to another slot ("t2/s3") — use ppal-duplicate to copy a clip to another track',
      );
    } catch (error) {
      console.warn(`clip not moved: ${errorMessage(error)}`);
    }

    return null;
  });
}

/**
 * Lines destinations up with the clips they apply to, warning when the counts
 * disagree — a caller that named the wrong number of slots gets told which
 * clips moved rather than watching copies land on top of each other.
 * @param destinations - Destinations, in order
 * @param clipCount - How many clips the call named, before any are dropped
 * @param isPath - Whether the destinations came from toPath (for the warning)
 * @returns Exactly clipCount destinations, padded with null
 */
function pairWithClips(
  destinations: Array<SlotPosition | null>,
  clipCount: number,
  isPath: boolean,
): Array<SlotPosition | null> {
  const label = isPath ? "toPath" : "toSlot";

  if (destinations.length !== clipCount) {
    const extra = destinations.length > clipCount;

    console.warn(
      `${label} names ${destinations.length} destination(s) for ${clipCount} clip(s); ` +
        (extra
          ? "the extra destinations went unused"
          : "the clips past the last destination were not moved"),
    );
  }

  return Array.from(
    { length: clipCount },
    (_unused, i) => destinations[i] ?? null,
  );
}

interface HandleSessionSlotMoveArgs {
  clip: LiveAPI;
  toSlot: SlotPosition;
  updatedClips: ClipResult[];
  noteResult: NoteUpdateResult | null;
}

/**
 * Move a session clip to a different clip slot
 * @param args - Operation arguments
 * @param args.clip - The session clip to move
 * @param args.toSlot - Destination slot position
 * @param args.updatedClips - Array to collect results
 * @param args.noteResult - Note update result for result
 */
export function handleSessionSlotMove({
  clip,
  toSlot,
  updatedClips,
  noteResult,
}: HandleSessionSlotMoveArgs): void {
  const srcTrackIndex = clip.trackIndex;
  const srcSceneIndex = clip.sceneIndex;

  if (srcTrackIndex == null || srcSceneIndex == null) {
    console.warn(`could not determine slot position for clip ${clip.id}`);
    updatedClips.push(buildClipResultObject(clip.id, noteResult));

    return;
  }

  // Same slot — no-op
  if (
    srcTrackIndex === toSlot.trackIndex &&
    srcSceneIndex === toSlot.sceneIndex
  ) {
    updatedClips.push(buildClipResultObject(clip.id, noteResult, toSlot));

    return;
  }

  const destClipSlot = LiveAPI.from(
    livePath.track(toSlot.trackIndex).clipSlot(toSlot.sceneIndex),
  );

  if (!destClipSlot.exists()) {
    console.warn(
      `destination ${slotPath(toSlot.trackIndex, toSlot.sceneIndex)} does not exist`,
    );
    updatedClips.push(buildClipResultObject(clip.id, noteResult));

    return;
  }

  // Live's duplicate_clip_to no-ops on a track that won't take the clip instead
  // of failing, and the source is deleted right after — check first rather than
  // destroying the clip and reporting it moved.
  const clipIsMidi = (clip.getProperty("is_midi_clip") as number) > 0;
  const blocker = clipCopyBlocker(clipIsMidi, toSlot.trackIndex);

  if (blocker != null) {
    console.warn(
      `${clipIsMidi ? "MIDI" : "audio"} clip ${clip.id} was not moved: ${blocker}`,
    );
    updatedClips.push(buildClipResultObject(clip.id, noteResult));

    return;
  }

  // Read now, warn after the copy: when copyClipToSlot declines, the occupant
  // is still there and an up-front warning contradicts the one that follows.
  const destinationWasOccupied = Boolean(destClipSlot.getProperty("has_clip"));

  const sourceClipSlot = LiveAPI.from(
    livePath.track(srcTrackIndex).clipSlot(srcSceneIndex),
  );

  // Look before deleting. duplicate_clip_to reports nothing when it declines a
  // copy, so anything the checks above didn't catch would destroy the clip and
  // report a move. copyClipToSlot compares the destination's clip before and
  // after, so an occupied slot's original clip can't be mistaken for the copy.
  const newClip = copyClipToSlot(sourceClipSlot, destClipSlot);

  if (newClip == null) {
    console.warn(
      `clip ${clip.id} was not moved: no clip landed at ${slotPath(toSlot.trackIndex, toSlot.sceneIndex)}, so the original was kept`,
    );
    updatedClips.push(buildClipResultObject(clip.id, noteResult));

    return;
  }

  if (destinationWasOccupied) {
    console.warn(
      `overwrote the existing clip at ${slotPath(toSlot.trackIndex, toSlot.sceneIndex)}`,
    );
  }

  sourceClipSlot.call("delete_clip");
  updatedClips.push(buildClipResultObject(newClip.id, noteResult, toSlot));
}
