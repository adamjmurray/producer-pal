// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Re-creating clips on a take lane, or on a track's main lane: one clip, and a
// whole destination of them. A failure keeps its place in the result.

import { errorMessage } from "#src/shared/error-message.ts";
import { type LaneLedger } from "#src/tools/shared/arrangement/helpers/arrangement-lane-ledger.ts";
import { resolveTakeLane } from "#src/tools/shared/arrangement/helpers/take-lanes.ts";
import { paramNamesSomething } from "#src/tools/shared/helpers/param-presence.ts";
import { isSpanLoss } from "#src/tools/shared/clip/arrangement-span.ts";
import {
  canRecreateClip,
  PartialRecreateError,
  recreateClip,
  recreatedClipLosses,
} from "#src/tools/shared/clip/recreate-clip.ts";
import { type TargetSkip } from "#src/tools/shared/validation/lists/named-targets.ts";
import {
  clearedBefore,
  copiedIds,
  copyClearing,
  copyReach,
  mainLaneOf,
  noteCleared,
  takeLaneOf,
  type CopyLane,
} from "../clip/overwrites/copy-overwrites.ts";
import {
  clearedWithoutCopy,
  type CopyMeter,
  refusedCopy,
} from "../clip/copy-entries.ts";
import {
  type ClearedCopy,
  clearedCopy,
  readCopyBack,
  skippedCopy,
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

/** What a lane copy leaves behind, said once on the lane's own entry. */
export const LANE_COPY_NOTE =
  "clips only: a take lane takes no devices, routing, mixer settings or session clips";

/** The same, for a promote onto a track's main lane. */
const MAIN_LANE_COPY_NOTE =
  "clips only: the main lane takes no devices, routing, mixer settings or session clips";

/** Where one destination's clips go, once the checks have passed. */
export interface LanePlace {
  trackIndex: number;
  /** The take lane's index, or null for the track's own main lane. */
  laneIndex: number | null;
  /** The destination track. Planning and copying are one synchronous call, so
   * this object lives no longer than the request that built it. */
  track: LiveAPI;
  /** `t2/l1` or `t2`: the cap check's key, and the path the entry reports. */
  label: string;
}

/** A destination, and what goes on it. */
export interface LaneTarget extends LanePlace {
  /** The source's clips, in order */
  sourceClips: LiveAPI[];
  name: string | undefined;
  color: string | undefined;
}

/**
 * Copies one source's clips onto the lane its plan named, creating the lane
 * (and any before it) on the way, or onto a track's main lane. A destination
 * where nothing landed and no lane was made is a skip; one that made a lane
 * keeps its entry, saying what didn't land.
 * @param entry - The destination as the caller wrote it
 * @param target - The plan for this destination
 * @param takeLaneName - Deprecated: name for a lane this call creates
 * @param meter - The song meter every position is spelled in
 * @param ledger - The call's arrangement lanes
 * @returns The destination's entry in the result
 */
export function runLaneCopy(
  entry: string,
  target: LaneTarget,
  takeLaneName: string | undefined,
  meter: CopyMeter,
  ledger: LaneLedger,
): object {
  const { trackIndex, laneIndex, label, sourceClips, name, color } = target;
  const onLane = laneIndex != null;
  const lanesBefore = onLane ? target.track.getChildCount("take_lanes") : 0;
  let lane: LiveAPI;

  try {
    lane = resolveCopyDestination(target, takeLaneName);
  } catch (error) {
    // Lanes can't be deleted: one made before the throw is a change to report.
    return target.track.getChildCount("take_lanes") > lanesBefore && onLane
      ? { path: label, created: true, clips: [], detail: lanePartial(error) }
      : skippedCopy(entry, errorMessage(error));
  }

  const created = onLane && laneIndex >= lanesBefore;
  const losses = new Set<string>();
  // A create truncates whatever it lands on, so a clip already at the position
  // is replaced, on a take lane as on the main one.
  const clips = sourceClips.map((clip) => {
    const startBeats = clip.getProperty("start_time") as number;

    try {
      return copyClipToLane(
        clip,
        {
          lane,
          where: onLane
            ? takeLaneOf(trackIndex, laneIndex, lane)
            : mainLaneOf(trackIndex, lane),
          ledger,
          label,
          kind: onLane ? "take-lane" : "promoted",
          meter,
          name,
          color,
        },
        losses,
      );
    } catch (error) {
      // One clip failing doesn't stop the rest; the lane is dropped from the
      // ledger, so what it cleared goes unsaid.
      const detail = `the ${onLane ? "take-lane" : "promoted"} copy failed: ${errorMessage(error)}`;
      const cleared = clearedBefore(error);

      // A copy that cleared clips before it threw changed the Set.
      return cleared == null
        ? refusedCopy({ beats: startBeats, label }, meter, detail)
        : clearedWithoutCopy(
            { beats: startBeats, label },
            meter,
            `${detail}; ${cleared}`,
          );
    }
  });

  const refused = clips.filter((clip) => "ok" in clip && clip.ok === false);
  const base = {
    id: lane.id,
    path: label,
    ...(created ? { created: true as const } : {}),
    // resolveTakeLane names a lane only when it made it, so that is the one
    // case the name is worth reporting.
    ...(created && paramNamesSomething(takeLaneName)
      ? { name: takeLaneName }
      : {}),
    clips,
  };

  if (refused.length < clips.length) {
    return {
      ...base,
      detail: [onLane ? LANE_COPY_NOTE : MAIN_LANE_COPY_NOTE, ...losses].join(
        "; ",
      ),
    };
  }

  // Every clip was refused. With no lane of the call's own there is nothing
  // to report on; with one, the lane exists and says none landed on it.
  const none = `no clip landed: ${[...new Set(refused.map((clip) => clip.detail))].join("; ")}`;

  return created ? { ...base, detail: none } : skippedCopy(entry, none);
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
  let copy: LiveAPI;

  try {
    copy = recreateClip(clip, lane, startBeats, name, color, clipLosses);
  } catch (error) {
    if (error instanceof PartialRecreateError) {
      return readCopyBack(
        error.partialClip,
        () => `the ${kind} copy is incomplete (${errorMessage(error)})`,
      );
    }

    return refusedCopy(
      { beats: startBeats, label },
      meter,
      `the ${kind} copy failed: ${errorMessage(error)}`,
    );
  }

  // A changed length is this clip's own to report, not the lane's.
  const lengthChange = clipLosses.filter(isSpanLoss);

  for (const loss of clipLosses) {
    if (!isSpanLoss(loss)) {
      losses.add(loss);
    }
  }

  // The clip exists, so a failure describing it is on its entry, not a refusal.
  return readCopyBack(copy, () => lengthChange.join("; ") || undefined);
}

/**
 * The object the clips are created on: the take lane, made if it isn't there
 * yet, or the track itself for its main lane. Both answer `create_midi_clip`
 * and `create_audio_clip`.
 * @param target - The plan for this destination
 * @param takeLaneName - Deprecated: name for a lane this call creates
 * @returns The destination
 */
function resolveCopyDestination(
  target: LaneTarget,
  takeLaneName: string | undefined,
): LiveAPI {
  const { track, laneIndex } = target;

  return laneIndex == null
    ? track
    : resolveTakeLane(track, laneIndex, takeLaneName).lane;
}

/**
 * What an entry says when a take lane was made but couldn't be set up.
 * @param error - What failed
 * @returns The detail
 */
function lanePartial(error: unknown): string {
  return `the take lane was made, but ${errorMessage(error)}; no clip was copied to it`;
}
