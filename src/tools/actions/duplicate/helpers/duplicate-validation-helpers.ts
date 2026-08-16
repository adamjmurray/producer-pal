// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  barBeatToAbletonBeats,
  validateBarBeatPosition,
} from "#src/notation/barbeat/time/barbeat-time.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { resolveLocatorRefListToBeats } from "#src/tools/shared/locator/locator-helpers.ts";
import { parseArrangementStartList } from "#src/tools/shared/validation/position-parsing.ts";

/**
 * Resolves arrangement positions from bar|beat or locator(s). Supports
 * comma-separated bar|beat positions and comma-separated locator IDs/names for
 * multiple positions. Shared by clip and scene duplication so both honor the
 * schema's comma-separated promise (scenes previously threw on a list).
 * @param liveSet - The live_set LiveAPI object
 * @param arrangementStart - Bar|beat position(s), comma-separated for multiple
 * @param locator - Arrangement locator ID(s) or name(s), comma-separated
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @returns Array of positions in beats
 */
export function resolveArrangementPositions(
  liveSet: LiveAPI,
  arrangementStart: string | undefined,
  locator: string | undefined,
  timeSigNumerator: number,
  timeSigDenominator: number,
): number[] {
  if (locator != null) {
    return resolveLocatorRefListToBeats(liveSet, locator, "duplicate");
  }

  // A malformed list (e.g. "," or only whitespace) survives the earlier
  // trim-only checks but parses to zero positions; throw instead of silently
  // producing no duplicates.
  const positions = parseArrangementStartList(arrangementStart);

  if (positions.length === 0) {
    throw new Error(
      "duplicate failed: arrangementStart has no valid bar|beat positions",
    );
  }

  // Validate each standalone position first so a 0-indexed/zero-bar arrangement
  // start gets the 1-indexing steer, not a silent pre-origin beat.
  return positions.map((pos) => {
    validateBarBeatPosition(pos);

    return barBeatToAbletonBeats(pos, timeSigNumerator, timeSigDenominator);
  });
}

/**
 * Validates basic input parameters for duplication
 * @param type - Type of object to duplicate
 * @param id - ID of the object to duplicate
 * @param count - Number of duplicates to create
 */
export function validateBasicInputs(
  type: string,
  id: string,
  count: number,
): void {
  if (!type) {
    throw new Error("duplicate failed: type is required");
  }

  const validTypes = ["track", "scene", "clip", "device"];

  if (!validTypes.includes(type)) {
    throw new Error(
      `duplicate failed: type must be one of ${validTypes.join(", ")}`,
    );
  }

  if (!id) {
    throw new Error("duplicate failed: id is required");
  }

  if (count < 1) {
    throw new Error("duplicate failed: count must be at least 1");
  }
}

/**
 * Validates and configures route to source parameters
 * @param type - Type of object being duplicated
 * @param routeToSource - Whether to route to source track
 * @param withoutClips - Whether to exclude clips
 * @param withoutDevices - Whether to exclude devices
 * @returns Configured withoutClips and withoutDevices values
 */
export function validateAndConfigureRouteToSource(
  type: string,
  routeToSource: boolean | undefined,
  withoutClips: boolean | undefined,
  withoutDevices: boolean | undefined,
): { withoutClips: boolean | undefined; withoutDevices: boolean | undefined } {
  if (!routeToSource) {
    return { withoutClips, withoutDevices };
  }

  if (type !== "track") {
    throw new Error(
      "duplicate failed: routeToSource is only supported for type 'track'",
    );
  }

  // Emit warnings if user provided conflicting parameters
  if (withoutClips === false) {
    console.warn(
      "routeToSource requires withoutClips=true, ignoring user-provided withoutClips=false",
    );
  }

  if (withoutDevices === false) {
    console.warn(
      "routeToSource requires withoutDevices=true, ignoring user-provided withoutDevices=false",
    );
  }

  return { withoutClips: true, withoutDevices: true };
}

/**
 * Reports whether the call names an arrangement position.
 * @param arrangementStart - Bar|beat position(s)
 * @param locator - Locator ID(s) or name(s)
 * @returns True when either names a position
 */
export function hasArrangementPosition(
  arrangementStart: string | undefined,
  locator: string | undefined,
): boolean {
  return (
    (arrangementStart != null && arrangementStart.trim() !== "") ||
    locator != null
  );
}

/**
 * Infers the duplication destination for a track, scene, or device. Clips
 * resolve theirs from toPath (see duplicate-destination-helpers.ts).
 * @param type - Type of object being duplicated
 * @param arrangementStart - Bar|beat position
 * @param locator - Locator ID or name
 * @returns Inferred destination
 */
export function inferDestination(
  type: string,
  arrangementStart: string | undefined,
  locator: string | undefined,
): "session" | "arrangement" | undefined {
  if (hasArrangementPosition(arrangementStart, locator)) {
    return "arrangement";
  }

  if (type === "device") {
    return undefined;
  }

  // Tracks and scenes default to session (in-place duplication)
  return "session";
}

/**
 * Resolves and validates the tracks a clip is duplicated onto in the arrangement.
 * @param sourceClip - The clip being duplicated
 * @param trackIndices - Requested destination tracks, or empty for the source's own track
 * @returns The destination track indices
 */
export function resolveDestinationTrackIndices(
  sourceClip: LiveAPI,
  trackIndices: number[],
): number[] {
  if (trackIndices.length === 0) {
    const sourceTrackIndex = sourceClip.trackIndex;

    if (sourceTrackIndex == null) {
      throw new Error(
        `duplicate failed: no track index for clip id "${sourceClip.id}" (path=${sourceClip.path})`,
      );
    }

    return [sourceTrackIndex];
  }

  const clipIsMidi = sourceClip.getProperty("is_midi_clip") === 1;

  for (const trackIndex of trackIndices) {
    const track = LiveAPI.from(livePath.track(trackIndex));

    if (!track.exists()) {
      throw new Error(`duplicate failed: no track at toPath "t${trackIndex}"`);
    }

    // Live's duplicate_clip_to_arrangement no-ops on a type mismatch instead of
    // failing, so check first rather than reporting a copy that never happened.
    const trackIsMidi = (track.getProperty("has_midi_input") as number) > 0;

    if (clipIsMidi !== trackIsMidi) {
      throw new Error(
        `duplicate failed: ${clipIsMidi ? "MIDI" : "audio"} clip cannot be duplicated to ` +
          `${trackIsMidi ? "MIDI" : "audio"} track ${trackIndex}`,
      );
    }
  }

  return trackIndices;
}

/**
 * Validates destination parameter compatibility with object type
 * @param type - Type of object being duplicated
 * @param destination - Inferred destination
 */
export function validateDestinationParameter(
  type: string,
  destination: string | undefined,
): void {
  if (type === "track" && destination === "arrangement") {
    throw new Error(
      "duplicate failed: tracks cannot be duplicated to arrangement",
    );
  }
}

/**
 * Validates arrangement position params are mutually exclusive
 * @param destination - Inferred destination
 * @param arrangementStart - Start time in bar|beat format
 * @param locator - Arrangement locator ID(s) or name(s) for position
 */
export function validateArrangementParameters(
  destination: string | undefined,
  arrangementStart: string | undefined,
  locator: string | undefined,
): void {
  if (destination !== "arrangement") {
    return;
  }

  const hasStart = arrangementStart != null && arrangementStart.trim() !== "";
  const hasLocator = locator != null;

  if (hasStart && hasLocator) {
    throw new Error(
      "duplicate failed: arrangementStart and locator are mutually exclusive",
    );
  }
}
