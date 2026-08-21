// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  barBeatToAbletonBeats,
  validateBarBeatPosition,
} from "#src/notation/barbeat/time/barbeat-time.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  type ArrangementTrack,
  warnUnusedTakeLane,
} from "#src/tools/shared/arrangement/take-lane-helpers.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { resolveLocatorRefListToBeats } from "#src/tools/shared/locator/locator-helpers.ts";
import { validateExclusiveParams } from "#src/tools/shared/validation/id-validation.ts";
import { parseArrangementStartList } from "#src/tools/shared/validation/position-parsing.ts";
import {
  type ClipDestinations,
  warnInapplicableClipParams,
  warnUnusedArrangementParams,
  warnUnusedDestination,
} from "./clip/duplicate-destination-helpers.ts";

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
  // A malformed list (e.g. "", "," or only whitespace) survives the earlier
  // trim-only checks but parses to zero positions. Callers cycle this list
  // against the destination tracks, so an empty one yields a copy at an
  // undefined position rather than no copies — throw instead.
  if (locator != null) {
    const times = resolveLocatorRefListToBeats(liveSet, locator, "duplicate");

    if (times.length === 0) {
      throw new Error("duplicate failed: locator names no locators");
    }

    return times;
  }

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
 * @param path - Source drum pad path, when the call names its source that way
 */
export function validateBasicInputs(
  type: string,
  id: string | undefined,
  count: number,
  path?: string,
): void {
  if (!type) {
    throw new Error("duplicate failed: type is required");
  }

  const validTypes = ["track", "scene", "clip", "device", "drum-pad"];

  if (!validTypes.includes(type)) {
    throw new Error(
      `duplicate failed: type must be one of ${validTypes.join(", ")}`,
    );
  }

  validateSource(type, id, path);

  if (count < 1) {
    throw new Error("duplicate failed: count must be at least 1");
  }
}

/**
 * Checks the call named its source. A drum pad can say so by path instead of
 * id: the 128 pad slots are fixed, so p{pitch} names the same pad every time.
 * Naming it both ways is a conflict, not a preference — a copy has one source,
 * and picking one would be the wrong-source bug in silence.
 * @param type - Type of object to duplicate
 * @param id - ID of the object to duplicate
 * @param path - Source drum pad path
 */
function validateSource(
  type: string,
  id: string | undefined,
  path: string | undefined,
): void {
  // `id` takes a comma-separated list on every other tool, so say what this one
  // does instead of handing "1,2" to Live as an id and reporting it as missing.
  if (id?.includes(",")) {
    throw new Error(
      `duplicate failed: id "${id}" names more than one source; duplicate copies one object per call`,
    );
  }

  if (type === "drum-pad") {
    validateExclusiveParams(id, path, "id", "path");

    return;
  }

  if (!id) {
    throw new Error("duplicate failed: id is required");
  }

  if (path != null) {
    console.warn(`path ignored: only supported for drum pads (type "${type}")`);
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

  if (type === "device" || type === "drum-pad") {
    return undefined;
  }

  // Tracks and scenes default to session (in-place duplication)
  return "session";
}

/**
 * Resolves the tracks a clip is duplicated onto in the arrangement, marking the
 * ones it can't be copied to. A destination is skipped rather than fatal, so one
 * bad entry in a comma-separated toPath doesn't cost the good ones.
 *
 * A skipped entry comes back as null rather than being removed. Name and color
 * are counted per requested destination, so a shorter list here would slide
 * every name after the gap onto the wrong copy.
 * @param sourceClip - The clip being duplicated
 * @param targets - Requested destinations, or empty for the source's own track
 * @returns One entry per request: the destination, or null where it can't be used
 */
export function resolveDestinationTargets(
  sourceClip: LiveAPI,
  targets: ArrangementTrack[],
): (ArrangementTrack | null)[] {
  if (targets.length === 0) {
    const sourceTrackIndex = sourceClip.trackIndex;

    if (sourceTrackIndex == null) {
      throw new Error(
        `duplicate failed: no track index for clip id "${sourceClip.id}" (path=${sourceClip.path})`,
      );
    }

    return [{ trackIndex: sourceTrackIndex, takeLane: null }];
  }

  const clipIsMidi = sourceClip.getProperty("is_midi_clip") === 1;

  return targets.map((target) =>
    canCopyClipToTrack(target.trackIndex, clipIsMidi) ? target : null,
  );
}

/**
 * Whether a clip can be copied to a track, warning about why not.
 * @param trackIndex - Destination track index
 * @param clipIsMidi - Whether the clip being copied is MIDI
 * @returns True when the copy can be made
 */
function canCopyClipToTrack(trackIndex: number, clipIsMidi: boolean): boolean {
  const track = LiveAPI.from(livePath.track(trackIndex));

  if (!track.exists()) {
    console.warn(`duplicate: no track at toPath "t${trackIndex}"`);

    return false;
  }

  // Live's duplicate_clip_to_arrangement no-ops on a type mismatch instead of
  // failing, so check first rather than reporting a copy that never happened.
  const trackIsMidi = (track.getProperty("has_midi_input") as number) > 0;

  if (clipIsMidi !== trackIsMidi) {
    console.warn(
      `duplicate: ${clipIsMidi ? "MIDI" : "audio"} clip cannot be duplicated to ` +
        `${trackIsMidi ? "MIDI" : "audio"} track ${trackIndex}`,
    );

    return false;
  }

  return true;
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

interface DestinationParams {
  type: string;
  clipDestinations: ClipDestinations | null;
  count: number;
  toPath: string | undefined;
  toSlot: string | undefined;
  arrangementStart: string | undefined;
  locator: string | undefined;
  arrangementLength: string | undefined;
  takeLane: number | string | undefined;
  takeLaneName: string | undefined;
  transforms: string | undefined;
  code: string | undefined;
}

/**
 * Settle where the copies go, warning for every param the chosen type and
 * destination have no use for. Grouped here so the tool's one rule — an
 * inapplicable param is warned about, never silently dropped — has one place
 * to hold.
 * @param params - The destination and position params as the tool received them
 * @returns The destination, or undefined when the type has none
 */
export function resolveDestinationAndWarn(
  params: DestinationParams,
): "session" | "arrangement" | undefined {
  const { type, clipDestinations, arrangementStart, locator } = params;
  const { arrangementLength, takeLane, takeLaneName } = params;

  warnUnusedDestination(type, params.toPath, params.toSlot);
  warnUnusedArrangementParams(
    type,
    arrangementStart,
    locator,
    arrangementLength,
  );

  if (clipDestinations != null) {
    warnInapplicableClipParams(
      clipDestinations,
      params.count,
      arrangementLength,
    );
  }

  const destination =
    clipDestinations?.destination ??
    inferDestination(type, arrangementStart, locator);

  validateDestinationParameter(type, destination);
  validateArrangementParameters(destination, arrangementStart, locator);

  if (type !== "clip" && (params.transforms != null || params.code != null)) {
    console.warn(
      `transforms/code ignored: only supported when duplicating clips (type "${type}")`,
    );
  }

  // takeLane and takeLaneName only apply to arrangement-destination clips; the
  // helper warns for non-clip types and session destinations so a malformed
  // value doesn't throw before the warn-and-ignore path. Where they do apply,
  // the destination resolver folded takeLane onto the paths already, and the
  // lane resolver warns if it had no new lane to name.
  warnUnusedTakeLane(type, destination, takeLane, console.warn, takeLaneName);

  return destination;
}
