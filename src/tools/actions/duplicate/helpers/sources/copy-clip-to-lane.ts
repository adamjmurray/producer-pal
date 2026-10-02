// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Re-creating one clip on a take lane, or on a track's main lane.

import { errorMessage } from "#src/shared/error-message.ts";
import { type LaneLedger } from "#src/tools/shared/arrangement/helpers/arrangement-lane-ledger.ts";
import { isSpanLoss } from "#src/tools/shared/clip/arrangement-span.ts";
import {
  canRecreateClip,
  PartialRecreateError,
  recreateClip,
  recreatedClipLosses,
} from "#src/tools/shared/clip/recreate-clip.ts";
import { type TargetSkip } from "#src/tools/shared/validation/lists/named-targets.ts";
import {
  copiedIds,
  copyClearing,
  copyReach,
  noteCleared,
  type CopyLane,
} from "../clip/overwrites/copy-overwrites.ts";
import { type CopyMeter, refusedCopy } from "../clip/copy-entries.ts";
import {
  type ClearedCopy,
  clearedCopy,
  getMinimalClipInfo,
  type MinimalClipInfo,
} from "../minimal-clip-info.ts";

/** Where one clip lands, and how the copy is labeled. */
export interface LaneDestination {
  lane: LiveAPI;
  /** The lane in the call's ledger, for saying what the copy cleared. */
  where: CopyLane;
  ledger: LaneLedger;
  /** The destination's path, so an entry can name where the copy would have
   * gone. */
  label: string;
  /** What to call this copy in a reason. */
  kind: "take-lane" | "promoted";
  meter: CopyMeter;
  name: string | undefined;
  color: string | undefined;
}

/**
 * Re-creates one clip on the lane, at the position it already had. The copy's
 * own entry says what it cleared, even when it was refused after clearing.
 * @param clip - The source clip
 * @param destination - The lane, its path, the song meter, and the copy's labels
 * @param losses - What re-creating cost, collected for the lane's own entry
 * @returns The copy, or why this clip got none
 */
export function copyClipToLane(
  clip: LiveAPI,
  destination: LaneDestination,
  losses: Set<string>,
): MinimalClipInfo | TargetSkip | ClearedCopy {
  const { label, meter } = destination;
  const startBeats = clip.getProperty("start_time") as number;

  if (!canRecreateClip(clip)) {
    // Addressed where the copy was headed, so an entry pastes back as a path.
    return refusedCopy(
      { beats: startBeats, label },
      meter,
      "a lane copy is re-created from the sample, and this audio clip has none",
    );
  }

  const spanBeats = (clip.getProperty("end_time") as number) - startBeats;
  const { made, cleared } = copyClearing(
    destination.ledger,
    destination.where,
    copyReach(startBeats, spanBeats),
    () => recreate(clip, destination, startBeats, losses),
    (entry) => copiedIds(entry),
  );

  if (cleared == null) {
    return made;
  }

  // A refused clip whose landing cleared clips changed the Set: no `ok: false`.
  if ("ok" in made) {
    return clearedCopy(made.path, `${made.detail}; ${cleared}`);
  }

  noteCleared(made, cleared);

  return made;
}

// --- Helpers below main exports ---

/**
 * Creates the copy, turning a failure into the entry that reports it.
 * @param clip - The source clip
 * @param destination - The lane, its path, the song meter, and the copy's labels
 * @param startBeats - Where the copy begins
 * @param losses - What re-creating cost, collected for the lane's own entry
 * @returns The copy, or why this clip got none
 */
function recreate(
  clip: LiveAPI,
  destination: LaneDestination,
  startBeats: number,
  losses: Set<string>,
): MinimalClipInfo | TargetSkip {
  const { lane, label, kind, meter, name, color } = destination;
  const clipLosses = recreatedClipLosses(clip);

  try {
    const copy = recreateClip(clip, lane, startBeats, name, color, clipLosses);
    // A changed length is this clip's own to report, not the lane's.
    const lengthChange = clipLosses.filter(isSpanLoss);

    for (const loss of clipLosses) {
      if (!isSpanLoss(loss)) {
        losses.add(loss);
      }
    }

    return getMinimalClipInfo(copy, lengthChange.join("; ") || undefined);
  } catch (error) {
    if (error instanceof PartialRecreateError) {
      return getMinimalClipInfo(
        error.partialClip,
        `the ${kind} copy is incomplete (${errorMessage(error)})`,
      );
    }

    return refusedCopy(
      { beats: startBeats, label },
      meter,
      `the ${kind} copy failed: ${errorMessage(error)}`,
    );
  }
}
