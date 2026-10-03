// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { paramNamesSomething } from "#src/tools/shared/helpers/param-presence.ts";
import { errorMessage } from "#src/shared/error-message.ts";
import {
  type ClipPath,
  pathEntries,
  pathNamesSomething,
} from "#src/tools/shared/validation/helpers/object-paths.ts";
import { refuseDoubledSpelling } from "#src/tools/shared/validation/doubled-spelling.ts";
import {
  requireClipDestinationPath,
  type ClipDestinationPath,
} from "#src/tools/shared/validation/helpers/clip-destination-path.ts";
import { destinationPositionResolver } from "#src/tools/shared/arrangement/helpers/arrangement-destination-position.ts";
import { parseObjectPath } from "#src/tools/shared/validation/object-path.ts";
import { parseSlotList } from "#src/tools/shared/validation/position-parsing.ts";
import {
  pairExact,
  pairValues,
} from "#src/tools/shared/validation/lists/list-pairing.ts";

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
 * @param spreadLane - Whether one track or take lane covers every clip, because
 *   arrangementStart gives each its own position
 * @returns One lane, one position and one refusal per named clip
 */
export function resolveMoveDestinations(
  rawToPath: string | undefined,
  rawToSlot: string | undefined,
  clipCount: number,
  spreadLane = false,
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

  const labels = {
    param: toSlot == null ? "toPath" : "toSlot",
    noun: "destination",
    item: "clip",
    // Pairing alone doesn't mean a clip moved: a paired entry can still name
    // nowhere to go.
    shortfall: "have nowhere to go",
  };
  // A bare "[5|1]" keeps each clip's lane, so one covers every clip. A lane or
  // slot holds one clip, so those pair 1:1 (see dev/specs/tool-behavior/object-paths/README.md).
  const paired =
    namesNoLane(entries) || spreadLane
      ? pairValues(entries, clipCount, labels)
      : pairExact(entries, clipCount, labels);

  return {
    destinations: paired.map((entry) => entry?.lane ?? null),
    positions: paired.map((entry) => entry?.position ?? null),
    refusals: paired.map((entry) => entry?.refused ?? null),
  };
}

// --- Helpers below main exports ---

/**
 * Whether the call named one destination that leaves the lane to the clip.
 * @param entries - The parsed destinations, in order
 * @returns True for a single bare `[5|1]`
 */
function namesNoLane(entries: Array<DestinationEntry | null>): boolean {
  return entries.length === 1 && entries[0]?.lane == null;
}

/**
 * Splits whichever param named the destinations into one entry each. A param
 * whose own syntax is broken names no clip in particular, so it throws; every
 * failure past the split belongs to its entry.
 * @param toPath - Destination path(s), or undefined
 * @param toSlot - Deprecated destination slot(s), or undefined
 * @returns One entry per destination written, or null when none could be read
 */
function destinationEntries(
  toPath: string | undefined,
  toSlot: string | undefined,
): Array<DestinationEntry | null> {
  // A param whose own syntax is broken is refused: nothing has run yet, and a
  // warning would let the rest of the update succeed as though the move landed.
  return toSlot != null
    ? parseSlotList(toSlot, "toSlot").map((slot) => ({
        lane: { kind: "slot" as const, ...slot },
        position: null,
      }))
    : pathDestinations(toPath as string);
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

  // An entry that won't parse was written wrong, so it refuses the call here,
  // before anything runs. One that parses but names no place a clip can occupy
  // (a scene, a device) skips only its own move.
  const parsed = entries.map((entry): DestinationEntry => {
    const path = parseObjectPath(entry, "toPath");

    try {
      return requireClipDestinationPath(path, "toPath");
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
