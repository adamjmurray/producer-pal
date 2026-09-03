// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  barBeatToAbletonBeats,
  validateBarBeatPosition,
} from "#src/notation/barbeat/time/barbeat-time.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { DUPLICATE_TYPES } from "#src/tools/constants.ts";
import {
  type ArrangementTrack,
  warnUnusedTakeLane,
} from "#src/tools/shared/arrangement/helpers/take-lane-helpers.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  type SourceShare,
  warnSharedArrangementDestination,
} from "./sources/duplicate-source-helpers.ts";
import { parseArrangementStartList } from "#src/tools/shared/validation/position-parsing.ts";
import {
  type ClipDestinations,
  warnInapplicableClipParams,
  warnUnusedArrangementParams,
  warnUnusedDestination,
} from "./clip/duplicate-destination-helpers.ts";
import {
  targetLabel,
  targetLabelForId,
} from "#src/tools/shared/validation/object-path-for-api.ts";

/**
 * Resolves the comma-separated arrangementStart list to beats. Shared by clip
 * and scene duplication so both honor the schema's comma-separated promise
 * (scenes previously threw on a list). Any `loc:` entry was rewritten as
 * bar|beat at the tool boundary.
 * @param arrangementStart - Bar|beat position(s), comma-separated for multiple
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @returns Array of positions in beats
 */
export function resolveArrangementPositions(
  arrangementStart: string | undefined,
  timeSigNumerator: number,
  timeSigDenominator: number,
): number[] {
  // A malformed list (e.g. "", "," or only whitespace) survives the earlier
  // trim-only checks but parses to zero positions. Callers cycle this list
  // against the destination tracks, so an empty one yields a copy at an
  // undefined position rather than no copies — throw instead.
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
 * @param id - ID(s) of the object(s) to duplicate
 * @param count - Number of duplicates to create
 * @param path - Path(s) of the object(s) to duplicate
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

  if (!(DUPLICATE_TYPES as readonly string[]).includes(type)) {
    throw new Error(
      `duplicate failed: type must be one of ${DUPLICATE_TYPES.join(", ")}`,
    );
  }

  // `id` and `path` name different objects and add up, so either will do and
  // both together are a longer source list, not a conflict.
  if (id == null && path == null) {
    throw new Error("duplicate failed: id or path is required");
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
 * @returns True when one is named
 */
export function hasArrangementPosition(
  arrangementStart: string | undefined,
): boolean {
  return arrangementStart != null && arrangementStart.trim() !== "";
}

/**
 * Infers the duplication destination for a track, scene, or device. Clips
 * resolve theirs from toPath (see duplicate-destination-helpers.ts).
 * @param type - Type of object being duplicated
 * @param arrangementStart - Bar|beat position
 * @returns Inferred destination
 */
export function inferDestination(
  type: string,
  arrangementStart: string | undefined,
): "session" | "arrangement" | undefined {
  if (hasArrangementPosition(arrangementStart)) {
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
 * A skipped entry comes back as null rather than being removed, and one that
 * arrived null stays null. Name and color are counted per requested
 * destination, so a shorter list here would slide every name after the gap onto
 * the wrong copy.
 * @param sourceClip - The clip being duplicated
 * @param targets - Requested destinations, or empty for the source's own track
 * @returns One entry per request: the destination, or null where it can't be used
 */
export function resolveDestinationTargets(
  sourceClip: LiveAPI,
  targets: (ArrangementTrack | null)[],
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
    target != null &&
    canCopyClipToTrack(sourceClip.id, target.trackIndex, clipIsMidi)
      ? target
      : null,
  );
}

/**
 * Whether a clip can be copied to a track, warning about why not.
 * @param clipId - The clip being copied, for the warning
 * @param trackIndex - Destination track index
 * @param clipIsMidi - Whether the clip being copied is MIDI
 * @returns True when the copy can be made
 */
function canCopyClipToTrack(
  clipId: string,
  trackIndex: number,
  clipIsMidi: boolean,
): boolean {
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
      `duplicate: ${clipIsMidi ? "MIDI" : "audio"} clip ${targetLabelForId(clipId)} cannot be duplicated to ` +
        `${trackIsMidi ? "MIDI" : "audio"} track ${targetLabel(track)}`,
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

interface DestinationParams {
  type: string;
  clipDestinations: ClipDestinations | null;
  count: number;
  toPath: string | undefined;
  toSlot: string | undefined;
  arrangementStart: string | undefined;
  arrangementLength: string | undefined;
  takeLane: number | string | undefined;
  takeLaneName: string | undefined;
  transforms: string | undefined;
  code: string | undefined;
  /** Every source this call copies, so a pile-up on one destination is caught
   *  here with the rest of the destination warnings. */
  sources: SourceShare[];
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
  const { type, clipDestinations, arrangementStart } = params;
  const { arrangementLength, takeLane, takeLaneName } = params;

  warnUnusedDestination(type, params.toPath, params.toSlot);
  warnUnusedArrangementParams(type, arrangementStart, arrangementLength);

  if (clipDestinations != null) {
    warnInapplicableClipParams(
      clipDestinations,
      params.count,
      arrangementLength,
    );
  }

  const destination =
    clipDestinations?.destination ?? inferDestination(type, arrangementStart);

  validateDestinationParameter(type, destination);

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
  warnSharedArrangementDestination(params.sources, destination);

  return destination;
}
