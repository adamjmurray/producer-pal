// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  buildClipResultObject,
  type ClipResult,
  type NoteUpdateResult,
} from "#src/tools/clip/helpers/clip-result-helpers.ts";
import { toLiveApiId } from "#src/tools/shared/utils.ts";
import { parseDestinationPathList } from "#src/tools/shared/validation/destination-path.ts";
import { parseSlotList } from "#src/tools/shared/validation/position-parsing.ts";
import { handleArrangementOperations } from "./update-clip-arrangement-helpers.ts";

interface SlotPosition {
  trackIndex: number;
  sceneIndex: number;
}

/**
 * Resolves the session slot a clip moves to, from toPath or the deprecated
 * toSlot. Warns and returns null for anything update-clip can't do, so the rest
 * of the update still runs.
 * @param toPath - Destination path (e.g., "t2/s3")
 * @param toSlot - Deprecated destination slot (trackIndex/sceneIndex)
 * @returns The destination slot, or null when there is nothing to move to
 */
export function resolveMoveDestination(
  toPath: string | undefined,
  toSlot: string | undefined,
): SlotPosition | null {
  // Honoring one and dropping the other would move the clip somewhere the
  // caller didn't ask for, so move it nowhere and say so.
  if (toPath != null && toSlot != null) {
    console.warn(
      "toPath and toSlot both name a destination, so the clip was not moved; use toPath alone (toSlot is deprecated)",
    );

    return null;
  }

  if (toSlot != null) {
    return firstDestination(parseSlotList(toSlot), "toSlot");
  }

  if (toPath == null) return null;

  const first = firstDestination(parseDestinationPathList(toPath), "toPath");

  if (first == null) return null;

  if (first.kind !== "slot") {
    console.warn(
      `toPath "${toPath}" is not a session slot, so the clip was not moved; update-clip moves a session clip to another slot ("t2/s3") — use ppal-duplicate to copy a clip to another track`,
    );

    return null;
  }

  return { trackIndex: first.trackIndex, sceneIndex: first.sceneIndex };
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
 * Takes the one destination update-clip can use, warning about any extras.
 * @param destinations - Parsed destinations, in order
 * @param label - Param name for the warning
 * @returns The first destination, or null when there are none
 */
function firstDestination<T>(destinations: T[], label: string): T | null {
  if (destinations.length === 0) return null;

  if (destinations.length > 1) {
    console.warn(`${label} only supports a single destination - using first`);
  }

  return destinations[0] as T;
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

  if (destClipSlot.getProperty("has_clip")) {
    console.warn(
      `overwriting existing clip at ${toSlot.trackIndex}/${toSlot.sceneIndex}`,
    );
  }

  const sourceClipSlot = LiveAPI.from(
    livePath.track(srcTrackIndex).clipSlot(srcSceneIndex),
  );

  sourceClipSlot.call("duplicate_clip_to", toLiveApiId(destClipSlot.id));
  sourceClipSlot.call("delete_clip");

  const newClip = LiveAPI.from(
    livePath.track(toSlot.trackIndex).clipSlot(toSlot.sceneIndex).clip(),
  );

  updatedClips.push(buildClipResultObject(newClip.id, noteResult, toSlot));
}
