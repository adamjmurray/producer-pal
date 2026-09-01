// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Where new clips go. `path` names it in the grammar duplicate and update-clip
// already speak — `t0/s1` for a clip slot, `t0` for that track's arrangement
// — and the retired `slot` plus the trackIndex/sceneIndex models reach for on
// their own still resolve to the same two buckets.
//
// Resolved before anything is created, so a bad destination fails instead of
// quietly landing clips somewhere else.

import { targetEntries, namedParam } from "#src/tools/shared/utils.ts";
import { pairValues } from "#src/tools/shared/validation/list-pairing.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  isTakeLaneRequested,
  normalizeTakeLaneTarget,
  takeLaneFromPath,
  withNewLaneOrdinals,
  type ArrangementTrack,
} from "#src/tools/shared/arrangement/helpers/take-lane-helpers.ts";
import {
  arrangementPath,
  namedHiddenPath,
  parseObjectPathList,
  requireClipPath,
} from "#src/tools/shared/validation/object-path-helpers.ts";
import {
  parseSlotList,
  type ClipSlotPosition,
} from "#src/tools/shared/validation/position-parsing.ts";

/** One arrangement clip: which track and lane, and where on it. */
export interface ArrangementPosition extends ArrangementTrack {
  arrangementStart: string;
}

export interface ClipDestinations {
  /** Clip slots, in order. */
  clipSlots: ClipSlotPosition[];
  /** Arrangement clips, one per track/position pair. */
  arrangementPositions: ArrangementPosition[];
}

/** The destination params as the tool received them. */
export interface ClipDestinationParams {
  path?: string | null;
  /** Deprecated trackIndex/sceneIndex slot list. */
  slot?: string | null;
  /** Hidden alias: a track for the arrangement, or half a slot with sceneIndex. */
  trackIndex?: number | null;
  /** Hidden alias: the other half of a slot. */
  sceneIndex?: number | null;
  /** Hidden alias for the path's `l` segment: 1-based, 0 = the main lane. */
  takeLane?: number | string | null;
}

interface SplitDestinations {
  clipSlots: ClipSlotPosition[];
  tracks: ArrangementTrack[];
}

/**
 * Resolves where a create-clip call's clips go.
 * @param params - The destination params as the tool received them
 * @param arrangementStart - Bar|beat position(s), comma-separated, as sent
 * @returns Clip slots and arrangement positions, both possibly empty
 */
export function resolveCreateClipDestinations(
  params: ClipDestinationParams,
  arrangementStart?: string | null,
): ClipDestinations {
  // A blank param names nothing, so read it as omitted rather than as a
  // destination that failed to parse. A position list that is not blank but
  // still names nothing warns instead: a real position beside a slot-only path
  // is refused, so one that parses to nothing must not just vanish.
  const path = namedParam(params.path, "path");
  const slot = namedHiddenPath(params.slot ?? undefined, "slot");
  const arrangementStarts = targetEntries(
    namedParam(arrangementStart, "arrangementStart"),
    "arrangementStart",
  );

  // Honoring one and dropping the other is exactly the silent-destination bug
  // path replaces, so refuse instead of picking.
  if (path != null && slot != null) {
    throw new Error(
      "createClip failed: path and slot both name a destination; use path alone (slot is deprecated)",
    );
  }

  const { clipSlots, tracks } =
    path != null
      ? splitPathDestinations(path, params)
      : legacyDestinations(slot, params, arrangementStarts.length > 0);

  return {
    clipSlots,
    arrangementPositions: pairTracksWithStarts(
      applyTakeLaneAlias(tracks, params.takeLane, clipSlots.length),
      arrangementStarts,
    ),
  };
}

// --- Helpers below main exports ---

/**
 * Splits a parsed `path` into its clip slots and arrangement tracks. A call
 * may name both, which is how one call fills a clip slot and drops an
 * arrangement clip at the same time.
 * @param path - The raw path param, already known to name something
 * @param params - The destination params as the tool received them
 * @returns Clip slots and arrangement tracks, in order
 */
function splitPathDestinations(
  path: string,
  params: ClipDestinationParams,
): SplitDestinations {
  // The aliases are a fallback for a caller that did not use path. One that did
  // is naming the destination twice, so honor the explicit param and say the
  // other went unused rather than guessing which was meant.
  if (params.trackIndex != null || params.sceneIndex != null) {
    console.warn(
      'createClip: trackIndex/sceneIndex ignored — "path" already names the destination',
    );
  }

  const clipSlots: ClipSlotPosition[] = [];
  const tracks: ArrangementTrack[] = [];

  for (const destination of parseObjectPathList(path, "path")) {
    const clipPath = requireClipPath(destination, "path");

    if (clipPath.kind === "slot") {
      clipSlots.push({
        trackIndex: clipPath.trackIndex,
        sceneIndex: clipPath.sceneIndex,
      });
    } else {
      tracks.push({
        trackIndex: clipPath.trackIndex,
        takeLane: takeLaneFromPath(clipPath),
      });
    }
  }

  // Number the lanes here, off the list the caller wrote: pairTracksWithStarts
  // may broadcast one entry to every position, and a repeat of one "l+" must
  // reuse its lane, not append one per position.
  return { clipSlots, tracks: withNewLaneOrdinals(tracks) };
}

/**
 * Folds the `takeLane` alias onto the destinations. It names one lane for the
 * whole call, so a path that already named its own lane wins — the alias is a
 * fallback for a caller that didn't use the segment.
 * @param tracks - Arrangement destinations, in order
 * @param takeLane - The raw takeLane param
 * @param clipSlotCount - Number of clip slots in this request
 * @returns The destinations, with the alias applied where a lane was unnamed
 */
function applyTakeLaneAlias(
  tracks: ArrangementTrack[],
  takeLane: number | string | null | undefined,
  clipSlotCount: number,
): ArrangementTrack[] {
  if (!isTakeLaneRequested(takeLane)) return tracks;

  // Warn-and-ignore without validating the value: an LLM passing garbage on a
  // request with nowhere to put a lane shouldn't lose the whole call to it.
  if (tracks.length === 0) {
    console.warn(
      "createClip: takeLane ignored for session clips (arrangement-only)",
    );

    return tracks;
  }

  if (clipSlotCount > 0) {
    console.warn(
      "createClip: takeLane ignored for session clips (arrangement-only)",
    );
  }

  if (tracks.some((track) => track.takeLane != null)) {
    console.warn(
      'createClip: takeLane ignored — "path" already names the take lane',
    );

    return tracks;
  }

  const target = normalizeTakeLaneTarget(takeLane);

  return tracks.map((track) => ({ ...track, takeLane: target }));
}

/**
 * Reads destinations off the params `path` replaced: the deprecated `slot`
 * list, and the trackIndex/sceneIndex a model reaches for unprompted. The two
 * compose the way they did before `path` — a slot list for the session, a bare
 * trackIndex for the arrangement — so an existing call keeps working.
 * @param slot - The deprecated slot list, or undefined
 * @param params - The destination params as the tool received them
 * @param hasArrangementStarts - Whether arrangementStart named any position
 * @returns Clip slots and arrangement tracks, in order
 */
function legacyDestinations(
  slot: string | undefined,
  params: ClipDestinationParams,
  hasArrangementStarts: boolean,
): SplitDestinations {
  const { trackIndex, sceneIndex } = params;
  const clipSlots = slot == null ? [] : parseSlotList(slot, "slot");

  if (trackIndex == null && sceneIndex == null) {
    return { clipSlots, tracks: [] };
  }

  if (trackIndex == null) {
    throw new Error(
      `createClip failed: sceneIndex ${sceneIndex} has no track; use path "t<track>/s${sceneIndex}"`,
    );
  }

  if (sceneIndex != null) {
    // Both halves of a slot. A slot list already names the session
    // destinations, so the guess is the redundant one.
    if (slot != null) {
      console.warn(
        'createClip: trackIndex/sceneIndex ignored — "slot" already names the session destination',
      );

      return { clipSlots, tracks: [] };
    }

    return { clipSlots: [{ trackIndex, sceneIndex }], tracks: [] };
  }

  // trackIndex alone means the arrangement, but only arrangementStart says
  // where on it. Without one it named nothing the clip slots didn't already.
  if (!hasArrangementStarts && clipSlots.length > 0) {
    console.warn(
      "createClip: trackIndex ignored — an arrangement clip also needs arrangementStart",
    );

    return { clipSlots, tracks: [] };
  }

  return { clipSlots, tracks: [{ trackIndex, takeLane: null }] };
}

/**
 * Pairs arrangement tracks with arrangement positions.
 *
 * Either list may hold the single value that covers the other; two lists pair
 * 1:1. A mismatch warns and makes only the clips both lists name — see
 * `list-pairing.ts`.
 * @param tracks - Arrangement destination tracks, in order
 * @param arrangementStarts - Parsed arrangement bar|beat positions
 * @returns One entry per arrangement clip
 */
function pairTracksWithStarts(
  tracks: ArrangementTrack[],
  arrangementStarts: string[],
): ArrangementPosition[] {
  if (tracks.length === 0) {
    if (arrangementStarts.length > 0) {
      throw new Error(
        'createClip failed: arrangementStart needs a track; add one to path (e.g. path: "t0")',
      );
    }

    return [];
  }

  if (arrangementStarts.length === 0) {
    // A bare track names two places at once, and guessing between them is how a
    // clip lands on top of something. A take lane names only one, but still
    // needs a position on it.
    const { trackIndex, takeLane } = tracks[0] as ArrangementTrack;
    const fix =
      takeLane == null
        ? `add arrangementStart for its arrangement, or use "t${trackIndex}/s<scene>" for a clip slot`
        : "add arrangementStart; take lanes hold arrangement clips";

    throw new Error(
      `createClip failed: path "${arrangementPath(trackIndex, takeLane)}" names no position; ${fix}`,
    );
  }

  const count = Math.max(tracks.length, arrangementStarts.length);
  const pairedTracks = pairValues(tracks, count, {
    param: "path",
    noun: "track",
    item: "position",
    shortfall: "got no clip",
  });
  const pairedStarts = pairValues(arrangementStarts, count, {
    param: "arrangementStart",
    noun: "position",
    item: "track",
    shortfall: "got no clip",
  });

  return pairedTracks.flatMap((track, i) => {
    const arrangementStart = pairedStarts[i];

    return track == null || arrangementStart == null
      ? []
      : [{ ...track, arrangementStart }];
  });
}
