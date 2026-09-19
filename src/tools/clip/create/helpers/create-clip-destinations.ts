// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Where new clips go. `path` names it in the grammar duplicate and update-clip
// already speak — `t0/s1` for a clip slot, `t0[5|1]` for a spot on that track's
// arrangement — and the retired `slot` plus the trackIndex/sceneIndex models
// reach for on their own still resolve to the same two buckets.
//
// A create has no source to borrow the other half of an arrangement address
// from, so it needs both: the lane from the path, and the position from either
// the path's coordinate or arrangementStart.
//
// Resolved before anything is created, so a bad destination fails instead of
// quietly landing clips somewhere else.

import { namedParam } from "#src/tools/shared/helpers/param-presence.ts";
import { targetEntries } from "#src/tools/shared/helpers/target-entries.ts";
import { pairValues } from "#src/tools/shared/validation/lists/list-pairing.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  isTakeLaneRequested,
  normalizeTakeLaneTarget,
  takeLaneFromPath,
  type ArrangementTrack,
} from "#src/tools/shared/arrangement/helpers/take-lanes.ts";
import { resolveDestinationPositions } from "#src/tools/shared/arrangement/helpers/arrangement-destination-position.ts";
import { parseClipDestinationList } from "#src/tools/shared/validation/helpers/clip-destination-path.ts";
import { arrangementPath } from "#src/tools/shared/validation/helpers/object-paths.ts";
import { refuseDoubledSpelling } from "#src/tools/shared/validation/doubled-spelling.ts";
import { pathError } from "#src/tools/shared/validation/helpers/object-path-lexer.ts";
import {
  parseSlotList,
  type ClipSlotPosition,
} from "#src/tools/shared/validation/position-parsing.ts";

/** One arrangement clip: which track and lane, and where on it. */
export interface ArrangementPosition extends ArrangementTrack {
  arrangementStart: string;
}

/** Where one destination sits in the two buckets below. */
export interface DestinationRef {
  view: "session" | "arrangement";
  /** Index into clipSlots or arrangementPositions. */
  index: number;
}

export interface ClipDestinations {
  /** Clip slots, in order. */
  clipSlots: ClipSlotPosition[];
  /** Arrangement clips, one per track/position pair. */
  arrangementPositions: ArrangementPosition[];
  /** Every destination, in the order the call named it. */
  order: DestinationRef[];
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

/** An arrangement destination, with the position its own coordinate named. */
interface ArrangementTrackTarget extends ArrangementTrack {
  /** The `[...]` position, or null when the entry carried none. */
  position: string | null;
  /** Where the call named this destination, counting both kinds together. */
  ordinal: number;
}

interface SplitDestinations {
  clipSlots: ClipSlotPosition[];
  /** Where the call named each clip slot, alongside the arrangement ones. */
  slotOrdinals: number[];
  tracks: ArrangementTrackTarget[];
}

/** An arrangement clip, still carrying the destination ordinal it came from. */
type OrderedArrangementPosition = ArrangementPosition & { ordinal: number };

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
  const { value: path, aliasValue: slot } = refuseDoubledSpelling({
    param: "path",
    value: params.path,
    alias: "slot",
    aliasValue: params.slot,
    noun: "a destination",
  });
  // A position list that is not blank but still names nothing warns rather than
  // vanishing: a real position beside a slot-only path is refused.
  const arrangementStarts = targetEntries(
    namedParam(arrangementStart, "arrangementStart"),
    "arrangementStart",
  );

  const { clipSlots, slotOrdinals, tracks } =
    path != null
      ? splitPathDestinations(path, params)
      : legacyDestinations(slot, params, arrangementStarts.length > 0);
  const paired = pairTracksWithStarts(
    applyTakeLaneAlias(tracks, params.takeLane, clipSlots.length),
    arrangementStarts,
  );

  return {
    clipSlots,
    arrangementPositions: paired.map(
      ({ ordinal: _ordinal, ...position }) => position,
    ),
    order: destinationOrder(
      slotOrdinals,
      paired.map((position) => position.ordinal),
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
      'trackIndex/sceneIndex ignored — "path" already names the destination',
    );
  }

  const clipSlots: ClipSlotPosition[] = [];
  const slotOrdinals: number[] = [];
  const tracks: ArrangementTrackTarget[] = [];
  // The lane is settled before the locators are resolved, so a refusal quotes
  // the position the caller wrote rather than the bar|beat it names.
  const entries = parseClipDestinationList(path, "path").map((entry) => ({
    position: entry.position,
    lane: entry.lane ?? noTrack(entry.position),
  }));

  for (const [ordinal, { lane, position }] of resolveDestinationPositions(
    entries,
    { paramName: "path" },
  ).entries()) {
    if (lane.kind === "slot") {
      clipSlots.push({
        trackIndex: lane.trackIndex,
        sceneIndex: lane.sceneIndex,
      });
      slotOrdinals.push(ordinal);
    } else {
      tracks.push({
        trackIndex: lane.trackIndex,
        takeLane: takeLaneFromPath(lane),
        position,
        ordinal,
      });
    }
  }

  return { clipSlots, slotOrdinals, tracks };
}

/**
 * Every destination in the order the call named it, so the result's entries
 * pair with the call position for position (ADR-0042).
 * @param slotOrdinals - Where the call named each clip slot
 * @param arrangementOrdinals - Where the call named each arrangement clip
 * @returns One ref per destination, in call order
 */
function destinationOrder(
  slotOrdinals: number[],
  arrangementOrdinals: number[],
): DestinationRef[] {
  const refs = [
    ...slotOrdinals.map((ordinal, index) => ({
      ordinal,
      view: "session" as const,
      index,
    })),
    ...arrangementOrdinals.map((ordinal, index) => ({
      ordinal,
      view: "arrangement" as const,
      index,
    })),
  ];

  // Stable, so several positions sharing one destination keep their own order.
  refs.sort((a, b) => a.ordinal - b.ordinal);

  return refs.map(({ view, index }) => ({ view, index }));
}

/**
 * Refuses a bare "[5|1]". A create has no source clip to borrow the lane from,
 * so half an address names nowhere to put a clip.
 * @param position - The position the coordinate named
 * @returns Never — always throws
 */
function noTrack(position: string | null): never {
  throw pathError(
    "path",
    `[${position}]`,
    `a new clip needs a track; name the lane too, as "t<track>[${position}]"`,
  );
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
  tracks: ArrangementTrackTarget[],
  takeLane: number | string | null | undefined,
  clipSlotCount: number,
): ArrangementTrackTarget[] {
  if (!isTakeLaneRequested(takeLane)) {
    return tracks;
  }

  // Warn-and-ignore without validating the value: an LLM passing garbage on a
  // request with nowhere to put a lane shouldn't lose the whole call to it.
  if (tracks.length === 0) {
    console.warn("takeLane ignored for session clips (arrangement-only)");

    return tracks;
  }

  if (clipSlotCount > 0) {
    console.warn("takeLane ignored for session clips (arrangement-only)");
  }

  if (tracks.some((track) => track.takeLane != null)) {
    console.warn('takeLane ignored — "path" already names the take lane');

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

  // The params path replaced never carried a position of their own.
  if (trackIndex == null && sceneIndex == null) {
    return sessionOnly(clipSlots);
  }

  if (trackIndex == null) {
    throw new Error(
      `sceneIndex ${sceneIndex} has no track; use path "t<track>/s${sceneIndex}"`,
    );
  }

  if (sceneIndex != null) {
    // Both halves of a slot. A slot list already names the session
    // destinations, so the guess is the redundant one.
    if (slot != null) {
      console.warn(
        'trackIndex/sceneIndex ignored — "slot" already names the session destination',
      );

      return sessionOnly(clipSlots);
    }

    return sessionOnly([{ trackIndex, sceneIndex }]);
  }

  // trackIndex alone means the arrangement, but only a position says where on
  // it. Without one it named nothing the clip slots didn't already.
  if (!hasArrangementStarts && clipSlots.length > 0) {
    console.warn(
      `trackIndex ignored — an arrangement clip also needs a position (path "t${trackIndex}[5|1]")`,
    );

    return sessionOnly(clipSlots);
  }

  return {
    ...sessionOnly(clipSlots),
    tracks: [
      {
        trackIndex,
        takeLane: null,
        position: null,
        ordinal: clipSlots.length,
      },
    ],
  };
}

/**
 * Destinations from the params path replaced, which name one kind each: the
 * clip slots come first, and the arrangement track — when there is one —
 * follows them.
 * @param slots - The clip slots the call named
 * @returns The split, with no arrangement track
 */
function sessionOnly(slots: ClipSlotPosition[]): SplitDestinations {
  return {
    clipSlots: slots,
    slotOrdinals: slots.map((_slot, ordinal) => ordinal),
    tracks: [],
  };
}

/**
 * Pairs arrangement tracks with arrangement positions.
 *
 * A track whose path carried a `[...]` already has its own position, so nothing
 * pairs — the two spellings can't both be in play, since a coordinate beside
 * arrangementStart is refused before any of this runs. Otherwise either list
 * may hold the single value that covers the other; two lists pair 1:1, and a
 * mismatch warns and makes only the clips both lists name — see
 * `list-pairing.ts`.
 * @param tracks - Arrangement destination tracks, in order
 * @param arrangementStarts - Parsed arrangement bar|beat positions
 * @returns One entry per arrangement clip
 */
function pairTracksWithStarts(
  tracks: ArrangementTrackTarget[],
  arrangementStarts: string[],
): OrderedArrangementPosition[] {
  if (tracks.length === 0) {
    if (arrangementStarts.length > 0) {
      throw new Error(
        'arrangementStart needs a track; name both in path (e.g. path: "t0[5|1]")',
      );
    }

    return [];
  }

  if (tracks.some((track) => track.position != null)) {
    return tracks.map(({ position, ...track }) => ({
      ...track,
      arrangementStart: position ?? noPosition(track),
    }));
  }

  if (arrangementStarts.length === 0) {
    noPosition(tracks[0] as ArrangementTrack);
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

  return pairedTracks.flatMap((entry, i) => {
    const arrangementStart = pairedStarts[i];

    if (entry == null || arrangementStart == null) {
      return [];
    }

    const { position: _position, ...track } = entry;

    return [{ ...track, arrangementStart }];
  });
}

/**
 * Refuses a lane the call named no position on. A bare track names two places
 * at once — its arrangement and its clip slots — and guessing between them is
 * how a clip lands on top of something. A take lane names only one, but still
 * needs a position on it.
 * @param track - The lane with no position
 * @returns Never — always throws
 */
function noPosition(track: ArrangementTrack): never {
  const { trackIndex, takeLane } = track;
  const lane = arrangementPath(trackIndex, takeLane);
  const fix =
    takeLane == null
      ? `add one, as "${lane}[5|1]", or use "t${trackIndex}/s<scene>" for a clip slot`
      : `add one, as "${lane}[5|1]"; take lanes hold arrangement clips`;

  throw new Error(`path "${lane}" names no position; ${fix}`);
}
