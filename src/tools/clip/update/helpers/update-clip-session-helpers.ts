// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { namedParam, paramNamesSomething } from "#src/tools/shared/utils.ts";
import { errorMessage } from "#src/shared/error-utils.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  type ClipResult,
  type NoteUpdateResult,
} from "#src/tools/clip/helpers/clip-result-helpers.ts";
import {
  type ClipPath,
  namedHiddenPath,
  pathEntries,
  pathNamesSomething,
  slotPath,
} from "#src/tools/shared/validation/helpers/object-path-helpers.ts";
import {
  requireClipDestinationPath,
  type ClipDestinationPath,
} from "#src/tools/shared/validation/helpers/clip-destination-path.ts";
import { resolveDestinationPositions } from "#src/tools/shared/arrangement/helpers/arrangement-destination-position.ts";
import {
  formatObjectPath,
  parseObjectPath,
} from "#src/tools/shared/validation/object-path.ts";
import { parseSlotList } from "#src/tools/shared/validation/position-parsing.ts";
import {
  type ArrangementTrack,
  takeLaneFromPath,
} from "#src/tools/shared/arrangement/helpers/take-lane-helpers.ts";
import { validateIdTypes } from "#src/tools/shared/validation/id-validation.ts";
import { handleArrangementOperations } from "./arrangement/update-clip-arrangement-helpers.ts";
import { type MoveGroup } from "./arrangement/update-clip-move-groups.ts";
import {
  pairExact,
  pairValues,
} from "#src/tools/shared/validation/lists/list-pairing.ts";
import {
  handleArrangementToSlotMove,
  handleClipSlotMove,
} from "./update-clip-slot-move-helpers.ts";
import {
  targetLabel,
  targetLabelForId,
} from "#src/tools/shared/validation/object-path-for-api.ts";

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

/** Where the clips in one call move: the lane, the position, or both. */
export interface MoveDestinations {
  /** The lane per named clip, null where there is nothing to move to. */
  destinations: Array<ClipPath | null>;
  /**
   * The song position a `[...]` in toPath named, per clip, null where the entry
   * carried none — that clip keeps the start it has.
   */
  positions: Array<string | null>;
}

/**
 * Resolves where each clip in the batch moves, from toPath or the deprecated
 * toSlot. Warns and returns nulls for anything update-clip can't do, so the
 * rest of the update still runs.
 *
 * An entry may name a lane (`t2`), a position (`[5|1]`), or both — the halves
 * are split apart here, so a bare coordinate keeps its turn in the list with no
 * lane to move to.
 *
 * Destinations pair 1:1 with the clips and never cycle, unlike name and color: two
 * clips can share a name, but the second one sent to a slot overwrites the
 * first — which is a move that reports success and loses a clip.
 * @param rawToPath - Destination path(s), comma-separated (e.g., "t2/s3", "t2[5|1]", "[5|1]")
 * @param rawToSlot - Deprecated destination slot(s) (trackIndex/sceneIndex)
 * @param clipCount - How many clips the call named, before any are dropped
 * @returns One lane and one position per named clip
 */
export function resolveMoveDestinations(
  rawToPath: string | undefined,
  rawToSlot: string | undefined,
  clipCount: number,
): MoveDestinations {
  const none = {
    destinations: Array.from({ length: clipCount }, () => null),
    positions: Array.from({ length: clipCount }, () => null),
  };
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
    const entries: Array<ClipDestinationPath | null> =
      toSlot != null
        ? parseSlotList(toSlot, "toSlot").map((slot) => ({
            lane: { kind: "slot" as const, ...slot },
            position: null,
          }))
        : pathDestinations(toPath as string);
    const labels = {
      param: toSlot == null ? "toPath" : "toSlot",
      noun: "destination",
      item: "clip",
      shortfall: "were not moved",
    };
    // A bare "[5|1]" doesn't fully determine a location — each clip keeps its
    // own lane — so one of them covers every clip, exactly as the
    // arrangementStart it replaces does. A lane or a slot still pairs 1:1:
    // those hold one clip each, and broadcasting would land every clip on the
    // last one. See dev/Object-Paths.md, "Which lists pair and which
    // broadcast".
    const paired = namesNoLane(entries)
      ? pairValues(entries, clipCount, labels)
      : pairExact(entries, clipCount, labels);

    return {
      destinations: paired.map((entry) => entry?.lane ?? null),
      positions: paired.map((entry) => entry?.position ?? null),
    };
  } catch (error) {
    console.warn(`clip not moved: ${errorMessage(error)}`);
  }

  return none;
}

interface RequestedClips {
  clips: LiveAPI[];
  destinationById: Map<string, ClipPath>;
  /** Each clip's position in the call, for the params paired against it. */
  requestedIndexById: Map<string, number>;
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
 * @returns The clips to update, plus their destinations and call positions keyed by clip id
 */
export function resolveRequestedClips(
  requestedIds: Array<string | null>,
  destinations: Array<ClipPath | null>,
): RequestedClips {
  const clips: LiveAPI[] = [];
  const destinationById = new Map<string, ClipPath>();
  const requestedIndexById = new Map<string, number>();
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
    requestedIndexById.set(clip.id, index);
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

  return { clips, destinationById, requestedIndexById };
}

/**
 * Gives a clip the destination named at its position, unless an earlier clip in
 * the batch is already moving there. Two clips sent to one slot means the second
 * overwrites the first, and the response then claims both are in it.
 *
 * Only slots are exclusive. An arrangement lane holds as many clips as fit on
 * it, so several clips can share one — and when they do land on top of each
 * other, the "moved to the same position" warning already says so.
 * @param clipId - The clip being given a destination
 * @param destination - Where the call named it to go, if anywhere
 * @param batch - Destinations by clip id, and the clip claiming each slot, both added to
 */
/**
 * Whether the call named one destination that leaves the lane to the clip.
 * @param entries - The parsed destinations, in order
 * @returns True for a single bare `[5|1]`
 */
function namesNoLane(entries: Array<ClipDestinationPath | null>): boolean {
  return entries.length === 1 && entries[0]?.lane == null;
}

function claimDestination(
  clipId: string,
  destination: ClipPath | null | undefined,
  batch: {
    destinationById: Map<string, ClipPath>;
    claimedBy: Map<string, string>;
  },
): void {
  if (destination == null) return;

  if (destination.kind !== "slot") {
    batch.destinationById.set(clipId, destination);

    return;
  }

  const slot = slotPath(destination.trackIndex, destination.sceneIndex);
  const claimant = batch.claimedBy.get(slot);

  if (claimant != null) {
    console.warn(
      `clip ${targetLabelForId(clipId)} was not moved: clip ${targetLabelForId(claimant)} is already moving to ${slot}; name one slot per clip`,
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
  destinationById: Map<string, ClipPath>,
  batchIds: Set<string>,
): void {
  for (const [clipId, destination] of destinationById) {
    // Arrangement lanes hold many clips, so nothing there is displaced by a
    // move landing on it — Live trims what overlaps instead of replacing it.
    if (destination.kind !== "slot") continue;

    const { trackIndex, sceneIndex } = destination;
    const occupant = LiveAPI.from(
      livePath.track(trackIndex).clipSlot(sceneIndex).clip(),
    );

    // A clip's own slot is the no-op the move already handles.
    if (!occupant.exists() || occupant.id === clipId) continue;

    if (!batchIds.has(occupant.id)) continue;

    console.warn(
      `clip ${targetLabelForId(clipId)} was not moved: ${slotPath(trackIndex, sceneIndex)} holds clip ` +
        `${targetLabel(occupant)}, which this call also updates; move that clip out in its own call first`,
    );
    destinationById.delete(clipId);
  }
}

interface HandlePositionOperationsArgs {
  clip: LiveAPI;
  isAudioClip: boolean;
  destination?: ClipPath | null;
  destinationParam: "toPath" | "toSlot";
  arrangementStartBeats?: number | null;
  arrangementLengthBeats?: number | null;
  movedClipGroups: Map<string, MoveGroup>;
  context: Partial<ToolContext>;
  updatedClips: ClipResult[];
  noteResult: NoteUpdateResult | null;
  isNonSurvivor: boolean;
}

/**
 * Handle clip position operations: a move to a clip slot, or the arrangement
 * operations — which now cover a move to another track or take lane.
 * @param args - Operation arguments
 */
export function handlePositionOperations(
  args: HandlePositionOperationsArgs,
): void {
  const { clip, destination, arrangementStartBeats, arrangementLengthBeats } =
    args;
  const { destinationParam } = args;

  if (destination?.kind === "slot") {
    // A slot is off the arrangement timeline, so the two ask for different
    // places at once. Arrangement destinations are the opposite: they combine
    // with arrangementStart, which says where on the destination lane to land.
    if (arrangementStartBeats != null || arrangementLengthBeats != null) {
      console.warn(
        `${destinationParam} ignored when arrangement parameters are specified`,
      );
    } else {
      const move =
        (clip.getProperty("is_arrangement_clip") as number) > 0
          ? handleArrangementToSlotMove
          : handleClipSlotMove;

      move({
        clip,
        toSlot: {
          trackIndex: destination.trackIndex,
          sceneIndex: destination.sceneIndex,
        },
        updatedClips: args.updatedClips,
        noteResult: args.noteResult,
      });

      return;
    }
  }

  handleArrangementOperations({
    clip,
    isAudioClip: args.isAudioClip,
    arrangementStartBeats,
    arrangementLengthBeats,
    destination: arrangementDestination(clip, destination, destinationParam),
    movedClipGroups: args.movedClipGroups,
    context: args.context,
    updatedClips: args.updatedClips,
    noteResult: args.noteResult,
    isNonSurvivor: args.isNonSurvivor,
  });
}

/**
 * Reads the destinations off a toPath, warning about each entry that names
 * something update-clip can't move a clip to.
 * @param toPath - Destination path(s), comma-separated
 * @returns One destination per entry, null where the entry names nowhere to go
 */
function pathDestinations(toPath: string): Array<ClipDestinationPath | null> {
  // pathEntries refuses a toPath that names nothing, so every entry here is real.
  const entries = pathEntries(toPath, "toPath");

  // Per entry, so a typo costs its own move and not the whole batch. An entry
  // that names the wrong kind of place already worked this way; one that
  // doesn't parse at all used to discard every destination beside it.
  const parsed = entries.map((entry) => {
    try {
      return requireClipDestinationPath(
        parseObjectPath(entry, "toPath"),
        "toPath",
      );
    } catch (error) {
      console.warn(`clip not moved: ${errorMessage(error)}`);
    }

    return null;
  });

  return resolveDestinationPositions(parsed, {
    toolName: "updateClip",
    paramName: "toPath",
  });
}

/**
 * Reads a destination as an arrangement lane, or null when it isn't one.
 *
 * A session clip can't move onto a lane: the arrangement move is copy-then-
 * delete through `duplicate_clip_to_arrangement`, which takes an arrangement
 * source only. Warn and leave the clip in its slot.
 * @param clip - The clip being moved
 * @param destination - Where the call named it to go, if anywhere
 * @param destinationParam - The param the caller used, for the warning
 * @returns The destination track and lane, or null
 */
function arrangementDestination(
  clip: LiveAPI,
  destination: ClipPath | null | undefined,
  destinationParam: "toPath" | "toSlot",
): ArrangementTrack | null {
  if (destination == null || destination.kind === "slot") return null;

  if ((clip.getProperty("is_arrangement_clip") as number) <= 0) {
    console.warn(
      `${destinationParam} "${formatObjectPath(destination)}" names an arrangement lane, so session clip ` +
        `${targetLabel(clip)} was not moved; name a clip slot ("t2/s3") to move it, or use ppal-duplicate to copy it into the arrangement`,
    );

    return null;
  }

  return {
    trackIndex: destination.trackIndex,
    takeLane: takeLaneFromPath(destination),
  };
}
