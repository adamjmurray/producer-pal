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
 * Infers the duplication destination from the provided parameters
 * @param type - Type of object being duplicated
 * @param arrangementStart - Bar|beat position
 * @param locator - Locator ID or name
 * @param toSlot - Session clip slot
 * @returns Inferred destination
 */
export function inferDestination(
  type: string,
  arrangementStart: string | undefined,
  locator: string | undefined,
  toSlot: string | undefined,
): "session" | "arrangement" | undefined {
  const hasArrangementParams =
    (arrangementStart != null && arrangementStart.trim() !== "") ||
    locator != null;

  if (hasArrangementParams) {
    return "arrangement";
  }

  if (type === "clip") {
    return toSlot != null ? "session" : undefined;
  }

  if (type === "device") {
    return undefined;
  }

  // Tracks and scenes default to session (in-place duplication)
  return "session";
}

/**
 * Validates clip-specific parameters
 * @param type - Type of object being duplicated
 * @param destination - Inferred destination
 * @param toSlot - Destination clip slot(s) in trackIndex/sceneIndex format
 */
export function validateClipParameters(
  type: string,
  destination: string | undefined,
  toSlot: string | undefined,
): void {
  if (type !== "clip") {
    return;
  }

  if (destination == null) {
    throw new Error(
      "duplicate failed: clip requires toSlot (for session) or arrangementStart/locator (for arrangement)",
    );
  }

  if (destination === "session" && (toSlot == null || toSlot.trim() === "")) {
    throw new Error("duplicate failed: toSlot is required for session clips");
  }
}

/**
 * Rejects cross-track destination params that don't apply to this duplicate.
 * These used to be dropped in silence, which turned an intended cross-track copy
 * into a duplicate onto the source's own track — overwriting the source when the
 * position matched. Say no instead, and name the param that does work.
 * @param type - Type of object being duplicated
 * @param destination - Inferred destination
 * @param toSlot - Session destination clip slot(s)
 * @param toPath - Device destination path(s)
 * @param toTrack - Arrangement destination track index
 */
export function validateDestinationTrackParameters(
  type: string,
  destination: string | undefined,
  toSlot: string | undefined,
  toPath: string | undefined,
  toTrack: number | undefined,
): void {
  if (type === "clip" && toPath != null) {
    throw new Error(
      "duplicate failed: toPath is for devices; duplicate a clip to another track with toTrack (arrangement) or toSlot (session)",
    );
  }

  if (type === "clip" && destination === "arrangement" && toSlot != null) {
    throw new Error(
      "duplicate failed: toSlot is for session destinations; use toTrack to duplicate to another track's arrangement",
    );
  }

  if (toTrack == null) {
    return;
  }

  if (type !== "clip") {
    console.warn(`toTrack ignored: only supported for clips (type "${type}")`);

    return;
  }

  if (destination === "session") {
    throw new Error(
      "duplicate failed: toTrack is for arrangement destinations; toSlot already names the session destination track",
    );
  }
}

/**
 * Resolves and validates the track a clip is duplicated onto in the arrangement.
 * @param sourceClip - The clip being duplicated
 * @param toTrack - Requested destination track index, or undefined for the source's own track
 * @returns The destination track index
 */
export function resolveDestinationTrackIndex(
  sourceClip: LiveAPI,
  toTrack: number | undefined,
): number {
  if (toTrack == null) {
    const sourceTrackIndex = sourceClip.trackIndex;

    if (sourceTrackIndex == null) {
      throw new Error(
        `duplicate failed: no track index for clip id "${sourceClip.id}" (path=${sourceClip.path})`,
      );
    }

    return sourceTrackIndex;
  }

  const track = LiveAPI.from(livePath.track(toTrack));

  if (!track.exists()) {
    throw new Error(`duplicate failed: no track at toTrack ${toTrack}`);
  }

  // Live's duplicate_clip_to_arrangement no-ops on a type mismatch instead of
  // failing, so check first rather than reporting a copy that never happened.
  const clipIsMidi = sourceClip.getProperty("is_midi_clip") === 1;
  const trackIsMidi = (track.getProperty("has_midi_input") as number) > 0;

  if (clipIsMidi !== trackIsMidi) {
    throw new Error(
      `duplicate failed: ${clipIsMidi ? "MIDI" : "audio"} clip cannot be duplicated to ` +
        `${trackIsMidi ? "MIDI" : "audio"} track ${toTrack}`,
    );
  }

  return toTrack;
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
