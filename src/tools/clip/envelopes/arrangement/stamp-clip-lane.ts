// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Writing a track's automation lane over an arrangement clip's span. Live only
// writes a lane when a session clip with envelopes is copied to the
// arrangement, and that copy replaces the clip under it. So the clip is parked
// out of the way, the scratch clip that holds the envelopes is copied over its
// span, and the clip is copied back from the parked one. Copying an
// arrangement clip writes nothing to the lane, so the lane keeps what the
// stamp wrote, and the parked copy restores everything the API can't read
// (MPE and the like).
//
// This runs after the lines are in the scratch clip, so a failure up to the
// parking changes nothing. After that the parked copy is the clip's only
// content: it is deleted only once the clip is back.

import { errorMessage } from "#src/shared/error-message.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { type ClipResult } from "#src/tools/clip/helpers/clip-results.ts";
import { clipFromDuplicateResult } from "#src/tools/shared/arrangement/helpers/arrangement-duplicate-result.ts";
import { appendDetail } from "#src/tools/shared/helpers/entry-details.ts";
import { toLiveApiId } from "#src/tools/shared/helpers/live-api-values.ts";
import { objectPathForApi } from "#src/tools/shared/validation/object-path-for-api.ts";
import { parkingSpot } from "./parking-spot.ts";

/** What to stamp, and where. */
export interface LaneStamp {
  /** The arrangement clip whose span the lane is written over */
  clipId: string;
  trackIndex: number;
  startBeats: number;
  endBeats: number;
  /** The scratch session clip that holds the envelopes */
  carrierId: string;
}

/**
 * Stamp the carrier's envelopes onto the lane over the clip, leaving the clip
 * as it was under a new id. The entry says what happened: the new id on
 * success, and on a failure what changed and where the clip is. Never throws.
 * @param entry - The clip's result entry, written to
 * @param stamp - What to stamp, and where
 * @param context - The call's context, which carries its lane view
 */
export function stampClipLane(
  entry: ClipResult,
  stamp: LaneStamp,
  context: Pick<ToolContext, "lanes">,
): void {
  const { trackIndex, startBeats, endBeats } = stamp;
  let parkedId: string;

  try {
    parkedId = copyOnto(
      trackIndex,
      stamp.clipId,
      parkingSpot(trackIndex, context),
    ).id;
  } catch (error) {
    notWritten(
      entry,
      `couldn't park the clip (${errorMessage(error)}); it and the lane are unchanged`,
    );

    return;
  }

  // The stamp replaces what is under it, so the view has to look again.
  context.lanes?.wrote(
    { kind: "track", trackIndex },
    { start: startBeats, end: endBeats },
  );

  try {
    copyOnto(trackIndex, stamp.carrierId, startBeats);
  } catch (error) {
    // A stamp that failed without touching the clip leaves nothing to restore.
    if (clipExists(stamp.clipId)) {
      notWritten(
        entry,
        `couldn't write the lane (${errorMessage(error)}); the clip is unchanged`,
        deleteParked(trackIndex, parkedId),
      );

      return;
    }
  }

  putBack(entry, stamp, parkedId);
}

// --- Helpers below main exports ---

/**
 * Copy the parked clip back over the stamp. Once it is back the parked copy is
 * deleted; if it can't be put back, the parked copy stays and the entry names
 * it, since it now holds the only copy of the clip.
 * @param entry - The clip's result entry, written to
 * @param stamp - What was stamped, and where
 * @param parkedId - The parked copy of the clip
 */
function putBack(entry: ClipResult, stamp: LaneStamp, parkedId: string): void {
  let restored: LiveAPI;

  try {
    restored = copyOnto(stamp.trackIndex, parkedId, stamp.startBeats);
  } catch (error) {
    // The parked copy is the clip now, so the entry names it.
    nameClip(entry, parkedId);

    appendDetail(
      entry,
      `couldn't put the clip back (${errorMessage(error)}); already changed: the lane was written and the clip was replaced by an empty clip carrying the automation; its copy is parked ${parkedAt(parkedId)} (id ${parkedId}), so move it back`,
    );

    return;
  }

  nameClip(entry, restored.id);

  const left = deleteParked(stamp.trackIndex, parkedId);

  if (left != null) {
    appendDetail(entry, left);
  }
}

/**
 * Point the entry at a clip.
 * @param entry - The clip's result entry, written to
 * @param id - The clip it now names
 */
function nameClip(entry: ClipResult, id: string): void {
  const path = pathOf(id);

  entry.id = id;

  if (path == null) {
    delete entry.path;
  } else {
    entry.path = path;
  }
}

/**
 * Copy a clip to the arrangement, over whatever sits at its span.
 * @param trackIndex - The track
 * @param sourceId - The clip to copy
 * @param at - Where the copy goes, in beats
 * @returns The copy
 * @throws Error when Live made no copy
 */
function copyOnto(trackIndex: number, sourceId: string, at: number): LiveAPI {
  // Arrangement edits leave a track object stale, so each copy starts fresh.
  const copy = clipFromDuplicateResult(
    LiveAPI.from(livePath.track(trackIndex)).call(
      "duplicate_clip_to_arrangement",
      toLiveApiId(sourceId),
      at,
    ),
  );

  if (!copy.exists()) {
    throw new Error("Live made no copy");
  }

  return copy;
}

/**
 * Delete the parked copy.
 * @param trackIndex - The track
 * @param parkedId - The parked copy
 * @returns What it left behind, or undefined when it is gone
 */
function deleteParked(
  trackIndex: number,
  parkedId: string,
): string | undefined {
  try {
    LiveAPI.from(livePath.track(trackIndex)).call(
      "delete_clip",
      toLiveApiId(parkedId),
    );

    return undefined;
  } catch (error) {
    return `left a copy of the clip parked ${parkedAt(parkedId)} (id ${parkedId}): ${errorMessage(error)}; delete it`;
  }
}

/**
 * @param entry - The clip's result entry, written to
 * @param why - Why nothing was written
 * @param more - What else the failure left, if anything
 */
function notWritten(entry: ClipResult, why: string, more?: string): void {
  entry.envelopes = 0;
  appendDetail(entry, `not written: ${why}`);

  if (more != null) {
    appendDetail(entry, more);
  }
}

/**
 * @param id - A clip
 * @returns Whether it is still in the Set, by a fresh look-up
 */
function clipExists(id: string): boolean {
  return LiveAPI.from(id).exists();
}

/**
 * @param id - A clip
 * @returns Where it sits, spelled as a path, by a fresh look-up
 */
function pathOf(id: string): string | undefined {
  return objectPathForApi(LiveAPI.from(id));
}

/**
 * @param id - The parked copy
 * @returns Where it sits, in words: its path, or that it is past the end
 */
function parkedAt(id: string): string {
  const path = pathOf(id);

  return path == null ? "past the end of the arrangement" : `at ${path}`;
}
