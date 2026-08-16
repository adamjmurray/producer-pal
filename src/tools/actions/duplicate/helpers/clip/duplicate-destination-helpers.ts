// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Where a clip duplicate goes. `toPath` names it — `t7` for that track's
// arrangement, `t7/s2` for a session slot — and the deprecated `toSlot` still
// works. Resolved before anything is created, so a bad destination fails
// instead of quietly landing the copy somewhere else.

import * as console from "#src/shared/max/v8-max-console.ts";
import {
  parseDestinationPathList,
  requireClipDestination,
} from "#src/tools/shared/validation/destination-path.ts";
import {
  parseSlotList,
  type SlotPosition,
} from "#src/tools/shared/validation/position-parsing.ts";

type ClipPath = ReturnType<typeof requireClipDestination>;

export interface ClipDestinations {
  destination: "session" | "arrangement";
  /** Session slots, in order. Empty for arrangement destinations. */
  slots: SlotPosition[];
  /** Arrangement tracks, in order. Empty means the source clip's own track. */
  trackIndices: number[];
}

/**
 * Resolves a clip duplicate's destination from its path params.
 * @param toPath - Destination path(s), comma-separated for multiple
 * @param toSlot - Deprecated session slot(s), trackIndex/sceneIndex format
 * @param hasArrangementParams - Whether arrangementStart or locator was given
 * @returns Where the copies go
 */
export function resolveClipDestinations(
  toPath: string | undefined,
  toSlot: string | undefined,
  hasArrangementParams: boolean,
): ClipDestinations {
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

  const paths = parseDestinationPathList(toPath).map((path) =>
    requireClipDestination(path),
  );

  if (hasArrangementParams) {
    return arrangementDestinations(paths);
  }

  if (paths.length === 0) {
    throw new Error(
      'duplicate failed: clip requires toPath ("t0/s1" for a session slot) or arrangementStart/locator (for the arrangement)',
    );
  }

  return sessionDestinations(paths);
}

/**
 * Warns when a destination param was sent for a type that has no destination.
 * @param type - Type of object being duplicated
 * @param toPath - Destination path(s)
 * @param toSlot - Deprecated session slot(s)
 */
export function warnUnusedDestination(
  type: string,
  toPath: string | undefined,
  toSlot: string | undefined,
): void {
  if (type === "clip") return;

  if (type !== "device" && toPath != null) {
    console.warn(
      `toPath ignored: only supported for clips and devices (type "${type}")`,
    );
  }

  if (toSlot != null) {
    console.warn(`toSlot ignored: only supported for clips (type "${type}")`);
  }
}

// --- Helpers below main exports ---

/**
 * Resolves the deprecated toSlot param, which only ever named session slots.
 * @param toSlot - Session slot(s), trackIndex/sceneIndex format
 * @param hasArrangementParams - Whether arrangementStart or locator was given
 * @returns Session destinations
 */
function legacySlotDestinations(
  toSlot: string,
  hasArrangementParams: boolean,
): ClipDestinations {
  if (hasArrangementParams) {
    throw new Error(
      'duplicate failed: toSlot is for session destinations; use toPath (e.g. "t2") to duplicate to another track\'s arrangement',
    );
  }

  const slots = parseSlotList(toSlot);

  if (slots.length === 0) {
    throw new Error("duplicate failed: toSlot is required for session clips");
  }

  return { destination: "session", slots, trackIndices: [] };
}

/**
 * Reads arrangement destination tracks off the parsed paths.
 * @param paths - Parsed clip destination paths
 * @returns Arrangement destinations
 */
function arrangementDestinations(paths: ClipPath[]): ClipDestinations {
  const trackIndices: number[] = [];

  for (const path of paths) {
    if (path.kind === "slot") {
      throw new Error(
        `duplicate failed: toPath "t${path.trackIndex}/s${path.sceneIndex}" is a session slot, but ` +
          `arrangementStart/locator asks for the arrangement; use "t${path.trackIndex}" for that track's arrangement`,
      );
    }

    trackIndices.push(path.trackIndex);
  }

  return { destination: "arrangement", slots: [], trackIndices };
}

/**
 * Reads session slots off the parsed paths.
 * @param paths - Parsed clip destination paths
 * @returns Session destinations
 */
function sessionDestinations(paths: ClipPath[]): ClipDestinations {
  const slots: SlotPosition[] = [];

  for (const path of paths) {
    // A bare track names two places at once, and guessing between them is how a
    // copy ends up on top of the source.
    if (path.kind === "track") {
      throw new Error(
        `duplicate failed: toPath "t${path.trackIndex}" names a track but not a spot on it; add ` +
          `arrangementStart or locator for track ${path.trackIndex}'s arrangement, or use ` +
          `"t${path.trackIndex}/s<scene>" for a session slot`,
      );
    }

    slots.push({ trackIndex: path.trackIndex, sceneIndex: path.sceneIndex });
  }

  return { destination: "session", slots, trackIndices: [] };
}
