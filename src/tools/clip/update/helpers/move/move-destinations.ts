// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { paramNamesSomething } from "#src/tools/shared/helpers/param-presence.ts";
import { errorMessage } from "#src/shared/error-message.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  type ClipPath,
  pathEntries,
  pathNamesSomething,
  slotPath,
} from "#src/tools/shared/validation/helpers/object-paths.ts";
import { refuseDoubledSpelling } from "#src/tools/shared/validation/doubled-spelling.ts";
import {
  requireClipDestinationPath,
  type ClipDestinationPath,
} from "#src/tools/shared/validation/helpers/clip-destination-path.ts";
import { destinationPositionResolver } from "#src/tools/shared/arrangement/helpers/arrangement-destination-position.ts";
import { takeLaneIndexOfClip } from "#src/tools/shared/arrangement/helpers/take-lanes.ts";
import { parseObjectPath } from "#src/tools/shared/validation/object-path.ts";
import { parseSlotList } from "#src/tools/shared/validation/position-parsing.ts";
import { validateIdType } from "#src/tools/shared/validation/id-validation.ts";
import {
  namedEarlierReason,
  type NamedTarget,
} from "#src/tools/shared/validation/lists/named-targets.ts";
import {
  pairExact,
  pairValues,
} from "#src/tools/shared/validation/lists/list-pairing.ts";
import {
  objectPathForApi,
  targetLabel,
  targetLabelForId,
} from "#src/tools/shared/validation/object-path-for-api.ts";
import { refuseClipWork, type ClipReasons } from "../entries/clip-reasons.ts";
import { refuseTarget, type ClipTargets } from "../entries/clip-targets.ts";

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
  // Silent: resolveMoveDestinations already reported anything it dropped.
  return !paramNamesSomething(rawToPath) && pathNamesSomething(rawToSlot)
    ? "toSlot"
    : "toPath";
}

/** One destination entry, or why the call could make nothing of it. */
interface DestinationEntry extends ClipDestinationPath {
  /** Why this entry names nowhere to go, when it names nowhere. */
  refused?: string;
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
  /**
   * Why the entry at this clip's position named nowhere to go, per clip. The
   * clip's own entry in the result carries it.
   */
  refusals: Array<string | null>;
}

/**
 * Resolves where each clip in the batch moves, from toPath or the deprecated
 * toSlot. An entry update-clip can't do reports why, so the rest of the update
 * still runs and the clip's own entry says its move didn't.
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
 * @returns One lane, one position and one refusal per named clip
 */
export function resolveMoveDestinations(
  rawToPath: string | undefined,
  rawToSlot: string | undefined,
  clipCount: number,
): MoveDestinations {
  const none = {
    destinations: Array.from({ length: clipCount }, () => null),
    positions: Array.from({ length: clipCount }, () => null),
    refusals: Array.from({ length: clipCount }, () => null),
  };
  // Refused, not warned: nothing has run yet, so the caller can just retry with
  // one spelling. Dropping both would move nothing while the rest of the update
  // succeeded, which reads as though the move landed.
  const { value: toPath, aliasValue: toSlot } = refuseDoubledSpelling({
    param: "toPath",
    value: rawToPath,
    alias: "toSlot",
    aliasValue: rawToSlot,
    noun: "a destination",
  });

  if (toPath == null && toSlot == null) {
    return none;
  }

  const entries = destinationEntries(toPath, toSlot);

  if (entries == null) {
    return none;
  }

  const labels = {
    param: toSlot == null ? "toPath" : "toSlot",
    noun: "destination",
    item: "clip",
    // Pairing alone doesn't mean a clip moved: a paired entry can still fail
    // to parse.
    shortfall: "have nowhere to go",
  };
  // A bare "[5|1]" keeps each clip's lane, so one covers every clip. A lane or
  // slot holds one clip, so those pair 1:1 (see dev/Object-Paths.md).
  const paired = namesNoLane(entries)
    ? pairValues(entries, clipCount, labels)
    : pairExact(entries, clipCount, labels);

  return {
    destinations: paired.map((entry) => entry?.lane ?? null),
    positions: paired.map((entry) => entry?.position ?? null),
    refusals: paired.map((entry) => entry?.refused ?? null),
  };
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
 * @param targets - The targets the call named and the ids they found
 * @param moves - One destination and one refusal per requested entry
 * @param reasons - What each clip has to say beyond its result, added to
 * @returns The clips to update, plus their destinations and call positions keyed by clip id
 */
export function resolveRequestedClips(
  targets: ClipTargets,
  moves: MoveDestinations,
  reasons: ClipReasons,
): RequestedClips {
  const clips: LiveAPI[] = [];
  const destinationById = new Map<string, ClipPath>();
  const requestedIndexById = new Map<string, number>();
  const claims: Array<[string, ClipPath]> = [];

  for (const [index, id] of targets.ids.entries()) {
    // A path that named no clip already holds its slot with the reason.
    if (id == null) {
      continue;
    }

    const clip = namedClip(id, targets, index);

    if (clip == null) {
      continue;
    }

    // An id and a path can name the same clip, as can a repeated id. Updating
    // it twice compounds every operation — duplicateLoop would double it again.
    const earlier = requestedIndexById.get(clip.id);

    if (earlier != null) {
      targets.unused.set(index, {
        id: clip.id,
        path: objectPathForApi(clip),
        reason: namedEarlierReason(targets.named[earlier] as NamedTarget),
      });

      continue;
    }

    clips.push(clip);
    requestedIndexById.set(clip.id, index);
    noteRefusedDestination(reasons, clip.id, moves.refusals[index]);

    const destination = moves.destinations[index];

    if (destination != null) {
      claims.push([clip.id, destination]);
    }
  }

  assignDestinations(claims, destinationById, reasons);

  dropDestinationsHoldingBatchClips(
    destinationById,
    new Set(requestedIndexById.keys()),
    reasons,
  );

  return { clips, destinationById, requestedIndexById };
}

/**
 * Sends a clip back to its own take lane when the call named a position but no
 * lane. A move with no destination lands on the track's MAIN lane, so a bare
 * `[5|1]` promoted a take-lane clip off a lane the caller never mentioned, and a
 * batch sharing one position piled every lane's clip onto the main one, where
 * each landing cleared the last. Main-lane clips need nothing: an unnamed
 * destination already means their own lane.
 * @param clips - The clips this call updates
 * @param destinationById - Destinations by clip id, added to
 * @param startBeatsFor - Where each clip is headed, or null when it stays put
 */
export function keepSourceLaneDestinations(
  clips: LiveAPI[],
  destinationById: Map<string, ClipPath>,
  startBeatsFor: (clip: LiveAPI) => number | null,
): void {
  for (const clip of clips) {
    if (destinationById.has(clip.id) || startBeatsFor(clip) == null) {
      continue;
    }

    const laneIndex = takeLaneIndexOfClip(clip);
    const trackIndex = clip.trackIndex;

    if (laneIndex == null || trackIndex == null) {
      continue;
    }

    destinationById.set(clip.id, { kind: "take-lane", trackIndex, laneIndex });
  }
}

// --- Helpers below main exports ---

/**
 * The clip one id names, or null with the target's slot holding the reason.
 * @param id - The id the call named
 * @param targets - The targets the call named
 * @param slot - The target's place in the call
 * @returns The clip, or null when the id names none
 */
function namedClip(
  id: string,
  targets: ClipTargets,
  slot: number,
): LiveAPI | null {
  try {
    return validateIdType(id, "clip");
  } catch (error) {
    refuseTarget(targets.unused, targets.named, slot, errorMessage(error));

    return null;
  }
}

/**
 * Carry a destination the call couldn't read onto the clip it was meant for.
 * @param reasons - What each clip has to say beyond its result, added to
 * @param clipId - The clip that is not moving
 * @param refused - Why its destination named nowhere, when it named nowhere
 */
function noteRefusedDestination(
  reasons: ClipReasons,
  clipId: string,
  refused: string | null | undefined,
): void {
  if (refused != null) {
    refuseClipWork(reasons, clipId, refused);
  }
}

/**
 * Whether the call named one destination that leaves the lane to the clip.
 * @param entries - The parsed destinations, in order
 * @returns True for a single bare `[5|1]`
 */
function namesNoLane(entries: Array<DestinationEntry | null>): boolean {
  return entries.length === 1 && entries[0]?.lane == null;
}

/**
 * Gives each clip the destination named at its position. When several clips
 * name one slot, the last wins and the others stay put: moving both would have
 * the later one overwrite the earlier, and the response claim both are there.
 *
 * Only slots are exclusive. An arrangement lane holds as many clips as fit on
 * it, so several clips can share one — and when they do land on top of each
 * other, the "moved to the same position" warning already says so.
 * @param claims - Each clip and the destination named for it, in call order
 * @param destinationById - Destinations by clip id, added to
 * @param reasons - What each clip has to say beyond its result, added to
 */
function assignDestinations(
  claims: Array<[string, ClipPath]>,
  destinationById: Map<string, ClipPath>,
  reasons: ClipReasons,
): void {
  const lastClaimant = new Map<string, string>();

  for (const [clipId, destination] of claims) {
    if (destination.kind === "slot") {
      lastClaimant.set(destinationSlot(destination), clipId);
    }
  }

  for (const [clipId, destination] of claims) {
    const slot =
      destination.kind === "slot" ? destinationSlot(destination) : null;
    const winner = slot == null ? clipId : (lastClaimant.get(slot) as string);

    if (winner === clipId) {
      destinationById.set(clipId, destination);
    } else {
      refuseClipWork(
        reasons,
        clipId,
        `not moved: clip ${targetLabelForId(winner)} moves to ${slot} later in this call`,
      );
    }
  }
}

/**
 * @param destination - A slot destination
 * @returns The slot, as a path
 */
function destinationSlot(
  destination: Extract<ClipPath, { kind: "slot" }>,
): string {
  return slotPath(destination.trackIndex, destination.sceneIndex);
}

/**
 * Drops a slot destination that holds another clip this call updates. The move
 * would overwrite that clip, and the batch would then work on a clip that no
 * longer exists and report it as updated — the loss the 1:1 pairing exists to
 * prevent.
 *
 * Slots only. An arrangement move can overwrite a batch clip too, but not
 * from here: this runs while the destinations are being paired to the clips,
 * and all it is handed is the destinations. Knowing what an arrangement move
 * would clear takes the position it lands at, the clip's own length, and the
 * track it ends up on. That case is handled in update-clip-move-order.ts,
 * which runs the operations in an order that clears nobody's way and refuses
 * the ones with no such order.
 * @param destinationById - Destinations by clip id, pruned in place
 * @param batchIds - Ids of every clip this call updates
 * @param reasons - What each clip has to say beyond its result, added to
 */
function dropDestinationsHoldingBatchClips(
  destinationById: Map<string, ClipPath>,
  batchIds: Set<string>,
  reasons: ClipReasons,
): void {
  for (const [clipId, destination] of destinationById) {
    if (destination.kind !== "slot") {
      continue;
    }

    const { trackIndex, sceneIndex } = destination;
    const occupant = LiveAPI.from(
      livePath.track(trackIndex).clipSlot(sceneIndex).clip(),
    );

    // A clip's own slot is the no-op the move already handles.
    if (!occupant.exists() || occupant.id === clipId) {
      continue;
    }

    if (!batchIds.has(occupant.id)) {
      continue;
    }

    refuseClipWork(
      reasons,
      clipId,
      `not moved: ${slotPath(trackIndex, sceneIndex)} holds clip ` +
        `${targetLabel(occupant)}, which this call also updates; move that clip out in its own call first`,
    );
    destinationById.delete(clipId);
  }
}

/**
 * Splits whichever param named the destinations into one entry each. A param
 * whose own syntax is broken names no clip in particular, so it warns; every
 * failure past the split belongs to its entry.
 * @param toPath - Destination path(s), or undefined
 * @param toSlot - Deprecated destination slot(s), or undefined
 * @returns One entry per destination written, or null when none could be read
 */
function destinationEntries(
  toPath: string | undefined,
  toSlot: string | undefined,
): Array<DestinationEntry | null> | null {
  try {
    return toSlot != null
      ? parseSlotList(toSlot, "toSlot").map((slot) => ({
          lane: { kind: "slot" as const, ...slot },
          position: null,
        }))
      : pathDestinations(toPath as string);
  } catch (error) {
    console.warn(`clip not moved: ${errorMessage(error)}`);

    return null;
  }
}

/**
 * Reads the destinations off a toPath, keeping the reason with each entry that
 * names something update-clip can't move a clip to.
 * @param toPath - Destination path(s), comma-separated
 * @returns One destination per entry, carrying a refusal where the entry names nowhere to go
 */
function pathDestinations(toPath: string): Array<DestinationEntry | null> {
  // pathEntries refuses a toPath that names nothing, so every entry here is real.
  const entries = pathEntries(toPath, "toPath");

  // Per entry, so a typo costs its own move and not the whole batch. An entry
  // that names the wrong kind of place already worked this way; one that
  // doesn't parse at all used to discard every destination beside it.
  const parsed = entries.map((entry): DestinationEntry => {
    try {
      return requireClipDestinationPath(
        parseObjectPath(entry, "toPath"),
        "toPath",
      );
    } catch (error) {
      return refusedDestination(error);
    }
  });
  const resolve = destinationPositionResolver(parsed, { paramName: "toPath" });

  if (resolve == null) {
    return parsed;
  }

  // A missing locator costs only this entry's move.
  return parsed.map((entry) => {
    try {
      return resolve(entry);
    } catch (error) {
      return refusedDestination(error);
    }
  });
}

/**
 * An entry that names nowhere to go, carrying why.
 * @param error - What reading the entry threw
 * @returns The entry, with no lane and no position
 */
function refusedDestination(error: unknown): DestinationEntry {
  return {
    lane: null,
    position: null,
    refused: `not moved: ${errorMessage(error)}`,
  };
}
