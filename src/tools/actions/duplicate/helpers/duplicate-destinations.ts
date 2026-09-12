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
} from "#src/tools/shared/arrangement/helpers/take-lane-helpers.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { parseArrangementStartList } from "#src/tools/shared/validation/position-parsing.ts";
import {
  type ClipDestinations,
  type DuplicateArrangementTarget,
  warnInapplicableClipParams,
  warnUnusedArrangementParams,
  warnUnusedDestination,
} from "./clip/clip-destinations.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";
import { clipCopyBlocker } from "#src/tools/shared/clip/copy-clip-to-slot.ts";
import { validateDestinationParameter } from "./duplicate-input-validation.ts";

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
    throw new Error("arrangementStart has no valid bar|beat positions");
  }

  return positions.map((pos) =>
    arrangementPositionToBeats(pos, timeSigNumerator, timeSigDenominator),
  );
}

/**
 * One bar|beat position in Ableton beats. Validated standalone first so a
 * 0-indexed/zero-bar arrangement start gets the 1-indexing steer, not a silent
 * pre-origin beat.
 * @param position - A bar|beat position
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @returns The position in beats
 */
export function arrangementPositionToBeats(
  position: string,
  timeSigNumerator: number,
  timeSigDenominator: number,
): number {
  validateBarBeatPosition(position);

  return barBeatToAbletonBeats(position, timeSigNumerator, timeSigDenominator);
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
 * resolve theirs from toPath (see clip-destinations.ts).
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
 *
 * An entry with no track — a bare `[5|1]` — is the source clip's own, which is
 * also what an empty list means. Neither is checked for type or existence: the
 * clip is already on it.
 * @param sourceClip - The clip being duplicated
 * @param targets - Requested destinations, or empty for the source's own track
 * @returns One entry per request: the destination, or null where it can't be used
 */
export function resolveDestinationTargets(
  sourceClip: LiveAPI,
  targets: (DuplicateArrangementTarget | null)[],
): (ArrangementTrack | null)[] {
  const ownTrack = (): ArrangementTrack => {
    const sourceTrackIndex = sourceClip.trackIndex;

    if (sourceTrackIndex == null) {
      throw new Error(
        `no track index for clip id "${sourceClip.id}" (path=${sourceClip.path})`,
      );
    }

    return { trackIndex: sourceTrackIndex, takeLane: null };
  };

  if (targets.length === 0) {
    return [ownTrack()];
  }

  const clipIsMidi = sourceClip.getProperty("is_midi_clip") === 1;

  return targets.map((target) => {
    if (target == null) {
      return null;
    }

    if (target.trackIndex == null) {
      return { ...target, ...ownTrack() };
    }

    return canCopyClipToTrack(sourceClip, target.trackIndex, clipIsMidi)
      ? { ...target, trackIndex: target.trackIndex }
      : null;
  });
}

/**
 * Whether a clip can be copied to a track, warning about why not.
 * @param clip - The clip being copied, for the warning
 * @param trackIndex - Destination track index
 * @param clipIsMidi - Whether the clip being copied is MIDI
 * @returns True when the copy can be made
 */
function canCopyClipToTrack(
  clip: LiveAPI,
  trackIndex: number,
  clipIsMidi: boolean,
): boolean {
  const track = LiveAPI.from(livePath.track(trackIndex));

  if (!track.exists()) {
    console.warn(`no track at toPath "t${trackIndex}"`);

    return false;
  }

  // Live refuses a wrong-type or frozen destination without saying why. Asking
  // first names the reason and drops the destination cleanly; without it the
  // copy just fails downstream with a position and no cause.
  const blocker = clipCopyBlocker(clipIsMidi, trackIndex, track);

  if (blocker != null) {
    console.warn(`clip ${targetLabel(clip)} was not duplicated: ${blocker}`);

    return false;
  }

  return true;
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

  return destination;
}
