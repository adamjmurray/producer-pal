// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  barBeatToAbletonBeats,
  durationToAbletonBeats,
  validateBarBeatPosition,
} from "#src/notation/barbeat/time/barbeat-time.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { targetEntries, namedParam } from "#src/tools/shared/utils.ts";
import {
  pairValues,
  type PairLabels,
} from "#src/tools/shared/validation/list-pairing.ts";

/** One arrangement time per clip, in beats. */
export interface ArrangementBeats {
  /** The single value the call named, applying to every clip. */
  broadcast: number | null;
  /** One value per named clip, by its position in the call. */
  perClip: Array<number | null>;
}

export interface ArrangementParams {
  startBeats: ArrangementBeats;
  lengthBeats: ArrangementBeats;
}

const NO_BEATS: ArrangementBeats = { broadcast: null, perClip: [] };

const START_LABELS: PairLabels = {
  param: "arrangementStart",
  noun: "position",
  item: "clip",
  shortfall: "were not moved",
};

const LENGTH_LABELS: PairLabels = {
  param: "arrangementLength",
  noun: "length",
  item: "clip",
  shortfall: "kept the length they had",
};

/**
 * Parse arrangementStart and arrangementLength into one value per clip.
 *
 * Both take a comma-separated list paired with the ids in order. A single
 * value covers the whole call.
 * @param arrangementStart - Bar|beat position(s), comma-separated
 * @param arrangementLength - Duration(s) (`Nbar`, `n<fraction>`, or `Nbar+n<fraction>`), comma-separated
 * @param clipCount - How many clips the call named, before any are dropped
 * @returns Start and length beats per clip
 */
export function parseArrangementParams(
  arrangementStart: string | undefined,
  arrangementLength: string | undefined,
  clipCount: number,
): ArrangementParams {
  // A blank names no position, so read it as omitted rather than as a value
  // that failed to parse — a caller that fills unused strings with "" gets the
  // clip left where it is instead of an error. A value that is not blank but
  // still names nothing (",  ,") is a different thing: the caller asked for a
  // move, so say it didn't happen.
  const positions = targetEntries(
    namedParam(arrangementStart, "arrangementStart"),
    "arrangementStart",
  );
  const durations = targetEntries(
    namedParam(arrangementLength, "arrangementLength"),
    "arrangementLength",
  );

  if (positions.length === 0 && durations.length === 0) {
    return { startBeats: NO_BEATS, lengthBeats: NO_BEATS };
  }

  // One meter for the whole timeline. Live reports the signature under the
  // playhead and exposes no way to find where the meter changes, so in a Set
  // that changes meter these positions are wrong past the first change, and the
  // error shifts when the user moves the playhead. Documented as a limitation.
  const liveSet = LiveAPI.from(livePath.liveSet);
  const numerator = liveSet.getProperty("signature_numerator") as number;
  const denominator = liveSet.getProperty("signature_denominator") as number;

  return {
    startBeats: fanOut(
      positions.map((position) => {
        // Validate the standalone position first so a 0-indexed/zero-bar
        // arrangement start gets the 1-indexing steer (matching create-clip),
        // not a silent pre-origin beat.
        validateBarBeatPosition(position);

        return barBeatToAbletonBeats(position, numerator, denominator);
      }),
      clipCount,
      START_LABELS,
    ),
    lengthBeats: fanOut(
      durations.map((duration) => {
        const beats = durationToAbletonBeats(duration, numerator, denominator);

        if (beats <= 0) {
          throw new Error("arrangementLength must be greater than 0");
        }

        return beats;
      }),
      clipCount,
      LENGTH_LABELS,
    ),
  };
}

/**
 * The value for one clip, or null when the call named none for it.
 *
 * Clips past the end of the call — the pieces `arrangementSplit` made — are
 * only covered by a broadcast value: a list has no entry to pair them with.
 * @param beats - The parsed values
 * @param requestedIndex - The clip's position in the call, or undefined
 * @returns Beats, or null
 */
export function beatsForClip(
  beats: ArrangementBeats,
  requestedIndex: number | undefined,
): number | null {
  if (beats.broadcast != null) return beats.broadcast;

  return requestedIndex == null
    ? null
    : (beats.perClip[requestedIndex] ?? null);
}

/**
 * Pair parsed values with the clips, remembering a lone value as a broadcast.
 * @param values - The parsed values, in call order
 * @param clipCount - How many clips the call named
 * @param labels - What to call the param and its entries in a warning
 * @returns The values per clip
 */
function fanOut(
  values: number[],
  clipCount: number,
  labels: PairLabels,
): ArrangementBeats {
  if (values.length === 0) return NO_BEATS;

  return {
    broadcast: values.length === 1 ? (values[0] as number) : null,
    perClip: pairValues(values, clipCount, labels),
  };
}
