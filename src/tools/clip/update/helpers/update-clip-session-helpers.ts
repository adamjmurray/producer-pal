// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

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
  namedPath,
  parseObjectPathList,
} from "#src/tools/shared/validation/object-path-helpers.ts";
import { formatObjectPath } from "#src/tools/shared/validation/object-path.ts";
import { parseSlotList } from "#src/tools/shared/validation/position-parsing.ts";
import { handleArrangementOperations } from "./update-clip-arrangement-helpers.ts";

interface SlotPosition {
  trackIndex: number;
  sceneIndex: number;
}

/**
 * Resolves where each clip in the batch moves, from toPath or the deprecated
 * toSlot. Warns and returns nulls for anything update-clip can't do, so the
 * rest of the update still runs.
 *
 * Destinations pair 1:1 with ids and never cycle, unlike name and color: two
 * clips can share a name, but the second one sent to a slot overwrites the
 * first — which is a move that reports success and loses a clip.
 * @param rawToPath - Destination path(s), comma-separated (e.g., "t2/s3")
 * @param rawToSlot - Deprecated destination slot(s) (trackIndex/sceneIndex)
 * @param clipCount - How many clips the batch is updating
 * @returns One destination per clip, null where there is nothing to move to
 */
export function resolveMoveDestinations(
  rawToPath: string | undefined,
  rawToSlot: string | undefined,
  clipCount: number,
): Array<SlotPosition | null> {
  const none = Array.from({ length: clipCount }, () => null);
  // A blank param names nothing, so read it as omitted rather than as a
  // destination that failed to parse.
  const toPath = namedPath(rawToPath);
  const toSlot = namedHiddenPath(rawToSlot);

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
  // tool's rule is warn-and-skip so the notes still land.
  try {
    const destinations =
      toSlot != null
        ? requireDestinations(parseSlotList(toSlot), "toSlot")
        : pathDestinations(toPath as string);

    return pairWithClips(destinations, clipCount, toSlot == null);
  } catch (error) {
    console.warn(`clip not moved: ${errorMessage(error)}`);
  }

  return none;
}

interface HandlePositionOperationsArgs {
  clip: LiveAPI;
  isAudioClip: boolean;
  toSlot?: SlotPosition | null;
  arrangementStartBeats?: number | null;
  arrangementLengthBeats?: number | null;
  tracksWithMovedClips: Map<number, number>;
  context: Partial<ToolContext>;
  updatedClips: ClipResult[];
  noteResult: NoteUpdateResult | null;
  isNonSurvivor: boolean;
}

/**
 * Handle clip position operations: session slot move or arrangement operations
 * @param args - Operation arguments
 */
export function handlePositionOperations(
  args: HandlePositionOperationsArgs,
): void {
  const { clip, toSlot, arrangementStartBeats, arrangementLengthBeats } = args;
  const isArrangementClip =
    (clip.getProperty("is_arrangement_clip") as number) > 0;

  if (toSlot != null && !isArrangementClip) {
    if (arrangementStartBeats != null || arrangementLengthBeats != null) {
      console.warn("toPath ignored when arrangement parameters are specified");
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
      `toPath ignored for arrangement clip (id ${clip.id}): only session clips move to a slot`,
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
 * Reads the session slots off a toPath, warning about each entry that names
 * something update-clip can't move a clip to.
 * @param toPath - Destination path(s), comma-separated
 * @returns One destination per entry, null where the entry names no slot
 */
function pathDestinations(toPath: string): Array<SlotPosition | null> {
  const parsed = requireDestinations(
    parseObjectPathList(toPath, "toPath"),
    "toPath",
  );

  return parsed.map((entry) => {
    if (entry.kind === "slot") {
      return { trackIndex: entry.trackIndex, sceneIndex: entry.sceneIndex };
    }

    console.warn(
      `toPath "${formatObjectPath(entry)}" is not a session slot, so that clip was not moved; ` +
        'update-clip moves a session clip to another slot ("t2/s3") — use ppal-duplicate to copy a clip to another track',
    );

    return null;
  });
}

/**
 * Lines destinations up with the clips they apply to, warning when the counts
 * disagree — a caller that named the wrong number of slots gets told which
 * clips moved rather than watching copies land on top of each other.
 * @param destinations - Destinations, in order
 * @param clipCount - How many clips the batch is updating
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

/**
 * Refuses a destination param that was sent but names nothing.
 * @param destinations - Parsed destinations, in order
 * @param label - Param name for the error
 * @returns The destinations
 * @throws When the param was sent but names nothing
 */
function requireDestinations<T>(destinations: T[], label: string): T[] {
  // Only toSlot arrives empty (e.g. ","); parseObjectPathList throws before
  // toPath can. Throwing rather than warning lets the caller's catch report it
  // like any other destination that failed to parse.
  if (destinations.length === 0) {
    throw new Error(`${label} names no destination`);
  }

  return destinations;
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
      `destination slot ${toSlot.trackIndex}/${toSlot.sceneIndex} does not exist`,
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

  if (destClipSlot.getProperty("has_clip")) {
    console.warn(
      `overwriting existing clip at ${toSlot.trackIndex}/${toSlot.sceneIndex}`,
    );
  }

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
      `clip ${clip.id} was not moved: no clip landed at ${toSlot.trackIndex}/${toSlot.sceneIndex}, so the original was kept`,
    );
    updatedClips.push(buildClipResultObject(clip.id, noteResult));

    return;
  }

  sourceClipSlot.call("delete_clip");
  updatedClips.push(buildClipResultObject(newClip.id, noteResult, toSlot));
}
