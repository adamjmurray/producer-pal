// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The clips a call names, and what each is to have done to it. N targets named,
// N entries back, in the order named: a target that names no clip keeps its
// slot as a skip, and the rest carry what their write needs.

import { errorMessage } from "#src/shared/error-message.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { clipIdAtPath } from "#src/tools/clip/helpers/clip-path-lookup.ts";
import { type LaneView } from "#src/tools/shared/arrangement/helpers/arrangement-lane-view.ts";
import { arrangementLaneOf } from "#src/tools/shared/arrangement/helpers/arrangement-write-effects.ts";
import { type LandedSpan } from "#src/tools/shared/arrangement/helpers/clip-remainders.ts";
import {
  takeLaneIndexOfClip,
  takeLaneLabel,
} from "#src/tools/shared/arrangement/helpers/take-lanes.ts";
import { clipCopyBlocker } from "#src/tools/shared/clip/copy-clip-to-slot.ts";
import { validateIdType } from "#src/tools/shared/validation/id-validation.ts";
import { resolvePathEntry } from "#src/tools/shared/validation/helpers/id-per-path-lookup.ts";
import {
  type ClipPath,
  arrangementPositionPath,
  slotPath,
} from "#src/tools/shared/validation/helpers/object-paths.ts";
import { type NamedTarget } from "#src/tools/shared/validation/lists/named-targets.ts";
import { parseObjectPath } from "#src/tools/shared/validation/object-path.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";
import {
  type Cover,
  type Target,
} from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import { beatsForClip } from "../arrangement/update-clip-arrangement-params.ts";
import {
  arrangementToSlotBlocker,
  destinationTrack,
} from "../slot-move/clip-slot-move.ts";
import { type ClipCall } from "./parse-clip-call.ts";

/** What one target of an update-clip call carries into its write. */
export interface ClipPayload {
  clip: LiveAPI;
  /** Where the clip moves, from toPath or toSlot */
  destination: ClipPath | null;
  /** The position it moves to, in beats */
  startBeats: number | null;
  /** The arrangement span it is resized to, in beats */
  lengthBeats: number | null;
  /** Why the destination the call named for it names nowhere to go */
  refusedMove: string | null;
  /** Where an arrangement clip sits now, when the call writes anywhere */
  span: LandedSpan | null;
}

/** What the call reads from Live to name its targets. */
export interface TargetReaders {
  /** The call's lanes, so paths on one lane read it once */
  lanes?: LaneView;
  /** Destination tracks already resolved, keyed by track index */
  destinationTracks: Map<number, LiveAPI>;
}

/**
 * Name the call's targets and resolve each now, before the first write. A path
 * that can't be parsed refuses the call; one that parses but finds no clip
 * skips only its own target.
 * @param call - The update-clip call
 * @param readers - What the call reads from Live
 * @returns The targets in the order named
 * @throws Error when a path can't be parsed
 */
export function clipTargets(
  call: ClipCall,
  readers: TargetReaders,
): Array<Target<ClipPayload>> {
  const found = call.named.map((target) => findClip(target, readers.lanes));
  const batchIds = new Set(
    found.flatMap((result) => ("clip" in result ? [result.clip.id] : [])),
  );

  return call.named.map((named, index): Target<ClipPayload> => {
    const result = found[index] as ReturnType<typeof findClip>;

    if ("skip" in result) {
      return { named, skip: result.skip };
    }

    const payload = payloadFor(call, result.clip, index, batchIds);

    return {
      named,
      key: result.clip.id,
      covers: coversOf(payload, readers.destinationTracks),
      data: payload,
    };
  });
}

// --- Helpers below main export ---

/**
 * The clip one target names.
 * @param target - The target, as the caller wrote it
 * @param lanes - The call's lanes
 * @returns The clip, or why it names none
 * @throws Error when a path can't be parsed
 */
function findClip(
  target: NamedTarget,
  lanes: LaneView | undefined,
): { clip: LiveAPI } | { skip: string } {
  let id = target.value;

  if (target.param === "path") {
    // A path that doesn't parse is a mistake in the call, so it refuses the
    // call; one that parses but names no clip skips only its own target.
    parseObjectPath(target.value, "path");

    const lookup = resolvePathEntry(target.value, (entry) =>
      clipIdAtPath(entry, "path", lanes),
    );

    if (lookup.id == null) {
      return { skip: lookup.reason };
    }

    id = lookup.id;
  }

  try {
    return { clip: validateIdType(id, "clip") };
  } catch (error) {
    return { skip: errorMessage(error) };
  }
}

/**
 * What one clip's write needs: where it goes, and what the call asks of its
 * span, paired against the target's place in the call.
 * @param call - The update-clip call
 * @param clip - The clip the target names
 * @param index - The target's place in the call
 * @param batchIds - Every clip the call names
 * @returns The target's payload
 */
function payloadFor(
  call: ClipCall,
  clip: LiveAPI,
  index: number,
  batchIds: ReadonlySet<string>,
): ClipPayload {
  const startBeats = beatsForClip(call.startBeats, index);
  const lengthBeats = beatsForClip(call.lengthBeats, index);
  let destination = call.moves.destinations[index] ?? null;
  let refusedMove = call.moves.refusals[index] ?? null;
  const occupant = slotOccupantInBatch(destination, clip, batchIds);

  // The move would overwrite a clip this call also updates, and the call would
  // then work on a clip that no longer exists.
  if (occupant != null && destination?.kind === "slot") {
    refusedMove =
      `not moved: ${slotPath(destination.trackIndex, destination.sceneIndex)} holds clip ` +
      `${targetLabel(occupant)}, which this call also updates; move that clip out in its own call first`;
    destination = null;
  }

  // A position with no lane means "same lane, other bar", so a take-lane clip is
  // aimed back at its own lane: a move with no destination lands on the MAIN
  // lane, and would promote it off a lane the caller never mentioned.
  if (destination == null && startBeats != null) {
    const laneIndex = takeLaneIndexOfClip(clip);
    const { trackIndex } = clip;

    if (laneIndex != null && trackIndex != null) {
      destination = { kind: "take-lane", trackIndex, laneIndex };
    }
  }

  const writes =
    destination != null || startBeats != null || lengthBeats != null;

  return {
    clip,
    destination,
    startBeats,
    lengthBeats,
    refusedMove,
    span: writes ? currentSpan(clip) : null,
  };
}

/**
 * The clip a slot destination holds, when this call also updates it.
 * @param destination - Where the clip is headed, if anywhere
 * @param clip - The clip being moved
 * @param batchIds - Every clip the call names
 * @returns The occupant, or null when the slot holds no clip of this call
 */
function slotOccupantInBatch(
  destination: ClipPath | null,
  clip: LiveAPI,
  batchIds: ReadonlySet<string>,
): LiveAPI | null {
  if (destination?.kind !== "slot") {
    return null;
  }

  const occupant = LiveAPI.from(
    livePath
      .track(destination.trackIndex)
      .clipSlot(destination.sceneIndex)
      .clip(),
  );

  // A clip's own slot is the no-op the move already handles.
  return occupant.exists() &&
    occupant.id !== clip.id &&
    batchIds.has(occupant.id)
    ? occupant
    : null;
}

/**
 * Where an arrangement clip sits, as a span written before the call began.
 * @param clip - The clip
 * @returns Its span, or null for a session clip or one with no readable span
 */
function currentSpan(clip: LiveAPI): LandedSpan | null {
  const { trackIndex } = clip;
  const start = clip.getProperty("start_time");
  const end = clip.getProperty("end_time");

  if (
    (clip.getProperty("is_arrangement_clip") as number) <= 0 ||
    trackIndex == null ||
    typeof start !== "number" ||
    typeof end !== "number"
  ) {
    return null;
  }

  return {
    lane: arrangementLaneOf({
      trackIndex,
      takeLane: takeLaneIndexOfClip(clip),
    }),
    start,
    end,
    order: -1,
  };
}

/**
 * What a clip's write goes over: the slot it moves into, or the stretch of
 * lane it lands on. Nothing for a move that would be turned down, since that
 * write goes over nothing.
 * @param payload - The target's payload
 * @param destinationTracks - Destination tracks already resolved
 * @returns The ground it covers, or undefined when it writes none
 */
function coversOf(
  payload: ClipPayload,
  destinationTracks: Map<number, LiveAPI>,
): Cover[] | undefined {
  const { clip, destination, startBeats, lengthBeats, span } = payload;

  if (destination?.kind === "slot") {
    // A slot beside an arrangement position or length is ignored: the clip
    // stays where it is, and only a length writes anything.
    return startBeats == null && lengthBeats == null
      ? slotCovers(
          clip,
          destination,
          (clip.getProperty("is_midi_clip") as number) > 0,
          destinationTracks,
        )
      : lengthCovers(payload, span);
  }

  return span == null ? undefined : laneCovers(payload, span);
}

/**
 * What a resize of a clip that stays on its own lane writes over.
 * @param payload - The target's payload
 * @param span - Where the clip sits now
 * @returns The ground it covers, or undefined when it writes none
 */
function lengthCovers(
  payload: ClipPayload,
  span: LandedSpan | null,
): Cover[] | undefined {
  return span == null || payload.lengthBeats == null
    ? undefined
    : laneCovers({ ...payload, destination: null }, span);
}

/**
 * The stretch of lane a clip lands on, unless the move would be turned down.
 * @param payload - The target's payload
 * @param span - Where the clip sits now
 * @returns The ground it covers, or undefined when it writes none
 */
function laneCovers(
  payload: ClipPayload,
  span: LandedSpan,
): Cover[] | undefined {
  const { clip, destination, startBeats, lengthBeats } = payload;
  const lane = destination?.kind === "slot" ? null : destination;
  const landing = {
    trackIndex: lane?.trackIndex ?? (clip.trackIndex as number),
    takeLane: lane?.kind === "take-lane" ? lane.laneIndex : null,
  };
  const moves = startBeats != null || lane != null;

  // A resize in place is refused on a take lane: there is nothing to write.
  if (!moves && takeLaneIndexOfClip(clip) != null) {
    return undefined;
  }

  const isMidi = (clip.getProperty("is_midi_clip") as number) > 0;

  if (lane != null && clipCopyBlocker(isMidi, landing.trackIndex) != null) {
    return undefined;
  }

  const from = startBeats ?? span.start;
  // update-clip never tiles on a take lane; on the main lane the clip lands at
  // the length it is resized to.
  const length =
    landing.takeLane != null || lengthBeats == null
      ? span.end - span.start
      : lengthBeats;

  return [
    {
      lane: takeLaneLabel(landing),
      from,
      to: from + length,
      as: arrangementPositionPath(arrangementLaneOf(landing), from),
    },
  ];
}

/**
 * The slot a clip's move fills, unless the move would be turned down or goes
 * nowhere.
 * @param clip - The clip being moved
 * @param destination - The slot it moves to
 * @param isMidi - Whether the clip is MIDI
 * @param destinationTracks - Destination tracks already resolved
 * @returns The slot as ground to cover, or undefined
 */
function slotCovers(
  clip: LiveAPI,
  destination: Extract<ClipPath, { kind: "slot" }>,
  isMidi: boolean,
  destinationTracks: Map<number, LiveAPI>,
): Cover[] | undefined {
  const isArrangementClip =
    (clip.getProperty("is_arrangement_clip") as number) > 0;
  const toSlot = {
    trackIndex: destination.trackIndex,
    sceneIndex: destination.sceneIndex,
  };

  // Its own slot is the no-op the move already handles.
  if (
    !isArrangementClip &&
    clip.trackIndex === toSlot.trackIndex &&
    clip.sceneIndex === toSlot.sceneIndex
  ) {
    return undefined;
  }

  const blocker = isArrangementClip
    ? arrangementToSlotBlocker(clip, toSlot)
    : clipCopyBlocker(
        isMidi,
        toSlot.trackIndex,
        destinationTrack(toSlot.trackIndex, destinationTracks),
      );

  return blocker == null
    ? [{ slot: slotPath(toSlot.trackIndex, toSlot.sceneIndex) }]
    : undefined;
}
