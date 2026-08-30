// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Where a clip duplicate goes. `toPath` names it — `t7` for that track's
// arrangement, `t7/s2` for a clip slot — and the deprecated `toSlot` still
// works. Resolved before anything is created, so a bad destination fails
// instead of quietly landing the copy somewhere else.

import { namedParam } from "#src/tools/shared/utils.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  takeLaneFromPath,
  withNewLaneOrdinals,
  type ArrangementTrack,
} from "#src/tools/shared/arrangement/helpers/take-lane-helpers.ts";
import {
  namedHiddenPath,
  parseObjectPathList,
  requireClipPath,
} from "#src/tools/shared/validation/object-path-helpers.ts";
import { formatObjectPath } from "#src/tools/shared/validation/object-path.ts";
import {
  parseSlotList,
  type ClipSlotPosition,
} from "#src/tools/shared/validation/position-parsing.ts";

type ClipPath = ReturnType<typeof requireClipPath>;

export interface ClipDestinations {
  destination: "session" | "arrangement";
  /** Clip slots, in order. Empty for arrangement destinations. */
  slots: ClipSlotPosition[];
  /**
   * Arrangement destinations, in order, null where the path named something
   * this call can't use. Empty means the source's own track.
   */
  arrangementTargets: (ArrangementTrack | null)[];
}

/**
 * Resolves a clip duplicate's destination from its path params.
 * @param rawToPath - Destination path(s), comma-separated for multiple
 * @param rawToSlot - Deprecated clip slot(s), trackIndex/sceneIndex format
 * @param hasArrangementParams - Whether arrangementStart or locator was given
 * @returns Where the copies go
 */
export function resolveClipDestinations(
  rawToPath: string | undefined,
  rawToSlot: string | undefined,
  hasArrangementParams: boolean,
): ClipDestinations {
  // A blank param names nothing, so read it as omitted rather than as a
  // destination that failed to parse.
  const toPath = namedParam(rawToPath, "toPath");
  const toSlot = namedHiddenPath(rawToSlot, "toSlot");

  // Honoring one and dropping the other is exactly the silent-destination bug
  // toPath replaces, so refuse instead of picking.
  if (toPath != null && toSlot != null) {
    throw new Error(
      "duplicate failed: toPath and toSlot both name a destination; use toPath alone (toSlot is deprecated)",
    );
  }

  if (toSlot != null) {
    return legacySlotDestinations(toSlot, hasArrangementParams);
  }

  const paths = parseObjectPathList(toPath, "toPath").map((path) =>
    requireClipPath(path, "toPath"),
  );

  if (hasArrangementParams) {
    return arrangementDestinations(paths);
  }

  if (paths.length === 0) {
    throw new Error(
      'duplicate failed: clip requires toPath ("t0/s1" for a clip slot) or arrangementStart/locator (for the arrangement)',
    );
  }

  return clipSlotDestinations(paths);
}

/**
 * Warns for params a clip duplicate has no use for. A clip gets one copy per
 * destination, and only an arrangement copy has a length.
 * @param destinations - Where the copies go
 * @param count - Requested number of copies
 * @param arrangementLength - Requested arrangement length
 */
export function warnInapplicableClipParams(
  destinations: ClipDestinations,
  count: number,
  arrangementLength: string | undefined,
): void {
  if (count > 1) {
    console.warn(
      "count ignored for clips: one copy per destination — list more in toPath or arrangementStart",
    );
  }

  if (destinations.destination === "session" && arrangementLength != null) {
    console.warn(
      "arrangementLength ignored: it only applies to arrangement destinations",
    );
  }
}

/**
 * Warns for arrangement position params on a type that lands nowhere on the
 * timeline. A device or drum pad is copied inside its own chain, so these are
 * dropped — and every other inapplicable param on this tool warns.
 * @param type - Type of object being duplicated
 * @param arrangementStart - Bar|beat position
 * @param locator - Locator ID or name
 * @param arrangementLength - Requested arrangement length
 */
export function warnUnusedArrangementParams(
  type: string,
  arrangementStart: string | undefined,
  locator: string | undefined,
  arrangementLength: string | undefined,
): void {
  if (type !== "device" && type !== "drum-pad") return;

  const sent = [
    arrangementStart != null ? "arrangementStart" : null,
    locator != null ? "locator" : null,
    arrangementLength != null ? "arrangementLength" : null,
  ].filter((param) => param != null);

  if (sent.length === 0) return;

  console.warn(
    `${sent.join("/")} ignored: a ${type} has no arrangement position (type "${type}")`,
  );
}

/**
 * Warns when a destination param was sent for a type that has no destination.
 * @param type - Type of object being duplicated
 * @param rawToPath - Destination path(s)
 * @param rawToSlot - Deprecated clip slot(s)
 */
export function warnUnusedDestination(
  type: string,
  rawToPath: string | undefined,
  rawToSlot: string | undefined,
): void {
  if (type === "clip") return;

  const toPath = namedParam(rawToPath, "toPath");
  const toSlot = namedHiddenPath(rawToSlot, "toSlot");

  if (type !== "device" && type !== "drum-pad" && toPath != null) {
    console.warn(
      `toPath ignored: only supported for clips, devices, and drum pads (type "${type}")`,
    );
  }

  if (toSlot != null) {
    console.warn(`toSlot ignored: only supported for clips (type "${type}")`);
  }
}

// --- Helpers below main exports ---

/**
 * Resolves the deprecated toSlot param, which only ever named clip slots.
 * @param toSlot - Clip slot(s), trackIndex/sceneIndex format
 * @param hasArrangementParams - Whether arrangementStart or locator was given
 * @returns Clip slot destinations
 */
function legacySlotDestinations(
  toSlot: string,
  hasArrangementParams: boolean,
): ClipDestinations {
  // namedHiddenPath already dropped a toSlot that names nothing, so this always
  // gets at least one entry.
  const slots = parseSlotList(toSlot, "toSlot");

  // toSlot only ever named clip slots, so it can't be the arrangement
  // destination arrangementStart wants. Drop the weaker of the two rather than
  // failing the call, the way toPath does for the same conflict.
  if (hasArrangementParams) {
    console.warn(
      "duplicate: arrangementStart/locator ignored — toSlot names a clip slot; " +
        'use toPath (e.g. "t2") for that track\'s arrangement',
    );
  }

  return { destination: "session", slots, arrangementTargets: [] };
}

/**
 * Reads arrangement destination tracks off the parsed paths. A clip slot here
 * contradicts arrangementStart/locator; warn and drop the weaker of the two
 * rather than failing the call, the way every other tool handles a position
 * that doesn't apply.
 *
 * A dropped clip slot keeps its turn as a null, because name and color are
 * counted per requested destination: removing it slides every later name onto
 * the wrong copy, and a two-destination call collapsing to one stops the
 * comma-separated values from splitting at all — Live is then handed the whole
 * string, which fails the call after a copy has already landed.
 * @param paths - Parsed clip destination paths
 * @returns Arrangement destinations, or session ones when only slots were named
 */
function arrangementDestinations(paths: ClipPath[]): ClipDestinations {
  const slots: ClipSlotPosition[] = [];
  const targets = paths.map((path) => {
    if (path.kind !== "slot") {
      return { trackIndex: path.trackIndex, takeLane: takeLaneFromPath(path) };
    }

    slots.push({ trackIndex: path.trackIndex, sceneIndex: path.sceneIndex });

    return null;
  });

  // Number the lanes here, off the list the caller wrote: one entry may cover
  // every copy, and a repeat of one "l+" must reuse its lane, not append one
  // per copy. Both
  // arrangement returns below need it — leaving it off one path collapses two
  // "l+" into one lane.
  const arrangementTargets = withNewLaneOrdinals(targets);

  if (slots.length === 0) {
    return { destination: "arrangement", slots: [], arrangementTargets };
  }

  const named = slots
    .map((slot) => `t${slot.trackIndex}/s${slot.sceneIndex}`)
    .join(", ");

  // toPath names where the copy goes; arrangementStart only says where on a
  // track. With nothing but clip slots, the position has no track to apply
  // to, so toPath is the one that survives.
  if (arrangementTargets.every((target) => target == null)) {
    console.warn(
      `duplicate: arrangementStart/locator ignored — toPath "${named}" names a clip slot; ` +
        'use "t<track>" for that track\'s arrangement',
    );

    return { destination: "session", slots, arrangementTargets: [] };
  }

  console.warn(
    `duplicate: toPath "${named}" ignored — arrangementStart/locator makes this an arrangement duplicate`,
  );

  return { destination: "arrangement", slots: [], arrangementTargets };
}

/**
 * Reads clip slots off the parsed paths.
 * @param paths - Parsed clip destination paths
 * @returns Clip slot destinations
 */
function clipSlotDestinations(paths: ClipPath[]): ClipDestinations {
  const slots: ClipSlotPosition[] = [];

  for (const path of paths) {
    // A bare track names two places at once, and guessing between them is how a
    // copy ends up on top of the source. A take lane names the arrangement
    // outright, so it needs a position there rather than a scene.
    if (path.kind !== "slot") {
      throw new Error(
        `duplicate failed: toPath "${formatObjectPath(path)}" names a track but not a spot on it; add ` +
          `arrangementStart or locator for track ${path.trackIndex}'s arrangement, or use ` +
          `"t${path.trackIndex}/s<scene>" for a clip slot`,
      );
    }

    slots.push({ trackIndex: path.trackIndex, sceneIndex: path.sceneIndex });
  }

  return { destination: "session", slots, arrangementTargets: [] };
}
