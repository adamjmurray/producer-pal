// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Where new clips go. `path` names it in the grammar duplicate and update-clip
// already speak — `t0/s1` for a session slot, `t0` for that track's arrangement
// — and the retired `slot` plus the trackIndex/sceneIndex models reach for on
// their own still resolve to the same two buckets.
//
// Resolved before anything is created, so a bad destination fails instead of
// quietly landing clips somewhere else.

import * as console from "#src/shared/max/v8-max-console.ts";
import {
  isTakeLaneRequested,
  normalizeTakeLaneTarget,
  takeLaneFromPath,
  withNewLaneOrdinals,
  type ArrangementTrack,
} from "#src/tools/shared/arrangement/take-lane-helpers.ts";
import {
  arrangementPath,
  namedPath,
  namedHiddenPath,
  parseObjectPathList,
  requireClipPath,
} from "#src/tools/shared/validation/object-path-helpers.ts";
import {
  parseSlotList,
  type SlotPosition,
} from "#src/tools/shared/validation/position-parsing.ts";

/** One arrangement clip: which track and lane, and where on it. */
export interface ArrangementPosition extends ArrangementTrack {
  arrangementStart: string;
}

export interface ClipDestinations {
  /** Session slots, in order. */
  sessionSlots: SlotPosition[];
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
  sessionSlots: SlotPosition[];
  tracks: ArrangementTrack[];
}

/**
 * Resolves where a create-clip call's clips go.
 * @param params - The destination params as the tool received them
 * @param arrangementStarts - Parsed arrangement bar|beat positions
 * @returns Session slots and arrangement positions, both possibly empty
 */
export function resolveCreateClipDestinations(
  params: ClipDestinationParams,
  arrangementStarts: string[],
): ClipDestinations {
  // A blank param names nothing, so read it as omitted rather than as a
  // destination that failed to parse.
  const path = namedPath(params.path ?? undefined);
  const slot = namedHiddenPath(params.slot ?? undefined);

  // Honoring one and dropping the other is exactly the silent-destination bug
  // path replaces, so refuse instead of picking.
  if (path != null && slot != null) {
    throw new Error(
      "createClip failed: path and slot both name a destination; use path alone (slot is deprecated)",
    );
  }

  const { sessionSlots, tracks } =
    path != null
      ? splitPathDestinations(path, params)
      : legacyDestinations(slot, params, arrangementStarts.length > 0);

  return {
    sessionSlots,
    arrangementPositions: pairTracksWithStarts(
      applyTakeLaneAlias(tracks, params.takeLane, sessionSlots.length),
      arrangementStarts,
    ),
  };
}

// --- Helpers below main exports ---

/**
 * Splits a parsed `path` into its session slots and arrangement tracks. A call
 * may name both, which is how one call fills a session slot and drops an
 * arrangement clip at the same time.
 * @param path - The raw path param, already known to name something
 * @param params - The destination params as the tool received them
 * @returns Session slots and arrangement tracks, in order
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

  const sessionSlots: SlotPosition[] = [];
  const tracks: ArrangementTrack[] = [];

  for (const destination of parseObjectPathList(path, "path")) {
    const clipPath = requireClipPath(destination, "path");

    if (clipPath.kind === "slot") {
      sessionSlots.push({
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
  // cycles this list, and a cycled repeat must reuse its lane, not append one.
  return { sessionSlots, tracks: withNewLaneOrdinals(tracks) };
}

/**
 * Folds the `takeLane` alias onto the destinations. It names one lane for the
 * whole call, so a path that already named its own lane wins — the alias is a
 * fallback for a caller that didn't use the segment.
 * @param tracks - Arrangement destinations, in order
 * @param takeLane - The raw takeLane param
 * @param sessionSlotCount - Number of session slots in this request
 * @returns The destinations, with the alias applied where a lane was unnamed
 */
function applyTakeLaneAlias(
  tracks: ArrangementTrack[],
  takeLane: number | string | null | undefined,
  sessionSlotCount: number,
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

  if (sessionSlotCount > 0) {
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
 * @returns Session slots and arrangement tracks, in order
 */
function legacyDestinations(
  slot: string | undefined,
  params: ClipDestinationParams,
  hasArrangementStarts: boolean,
): SplitDestinations {
  const { trackIndex, sceneIndex } = params;
  const sessionSlots = slot == null ? [] : parseSlotList(slot, "slot");

  if (trackIndex == null && sceneIndex == null) {
    return { sessionSlots, tracks: [] };
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

      return { sessionSlots, tracks: [] };
    }

    return { sessionSlots: [{ trackIndex, sceneIndex }], tracks: [] };
  }

  // trackIndex alone means the arrangement, but only arrangementStart says
  // where on it. Without one it named nothing the session slots didn't already.
  if (!hasArrangementStarts && sessionSlots.length > 0) {
    console.warn(
      "createClip: trackIndex ignored — an arrangement clip also needs arrangementStart",
    );

    return { sessionSlots, tracks: [] };
  }

  return { sessionSlots, tracks: [{ trackIndex, takeLane: null }] };
}

/**
 * Pairs arrangement tracks with arrangement positions. Each param sets a clip
 * count; the longer list wins and the shorter one cycles, matching duplicate.
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
        ? `add arrangementStart for its arrangement, or use "t${trackIndex}/s<scene>" for a session slot`
        : "add arrangementStart; take lanes hold arrangement clips";

    throw new Error(
      `createClip failed: path "${arrangementPath(trackIndex, takeLane)}" names no position; ${fix}`,
    );
  }

  const count = Math.max(tracks.length, arrangementStarts.length);

  return Array.from({ length: count }, (_unused, i) => ({
    ...(tracks[i % tracks.length] as ArrangementTrack),
    arrangementStart: arrangementStarts[i % arrangementStarts.length] as string,
  }));
}
