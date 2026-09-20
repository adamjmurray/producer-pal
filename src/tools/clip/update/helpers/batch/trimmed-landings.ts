// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Clips a call sends to one lane and position stack: the last one lands whole
// at the position, and each earlier one keeps only what reaches past it — as a
// NEW clip, because the trim re-creates it. Its entry's id is dead either way,
// so reading that id back can't tell a trimmed clip from a buried one. This
// works out where each remainder must be, and finds it.
//
// Only the FRONT is ever trimmed here, so the landing's end is what identifies
// the remainder: everything in the group starts at the same beat, and a
// landing from somewhere else can start there too. Matching the start alone
// hands back that other clip.

import { clipsOnLane } from "#src/tools/shared/arrangement/helpers/arrangement-clip-at-position.ts";
import { arrangementLaneOf } from "#src/tools/shared/arrangement/helpers/arrangement-write-effects.ts";
import { SAME_TIME_EPSILON } from "#src/shared/config.ts";
import { type ArrangementLane } from "#src/tools/shared/validation/helpers/object-path-position.ts";
import {
  type LandedClip,
  type MoveGroup,
} from "../arrangement/update-clip-move-groups.ts";

/** What is left of a landing once later ones trimmed its front. */
export interface TrimmedLanding {
  lane: ArrangementLane;
  /** The earliest beat the remainder can start at. */
  beats: number;
  /** Where the landing ends, which the trim leaves alone. */
  end: number;
}

/**
 * What each trimmed landing left behind, keyed by the id its entry reported.
 * Nothing is read from Live here — the lengths were taken as each copy landed.
 * @param groups - Tally of clips landing on each lane and position
 * @returns The remainder to look for, per landed clip id
 */
export function trimmedLandings(
  groups: ReadonlyMap<string, MoveGroup>,
): Map<string, TrimmedLanding> {
  const trims = new Map<string, TrimmedLanding>();

  for (const group of groups.values()) {
    addGroupTrims(group, trims);
  }

  return trims;
}

/**
 * Looks a trimmed landing's remainder up, scanning each lane at most once —
 * the scan builds a LiveAPI per clip on it.
 * @returns A look-up that answers with the remainder, or null when it is gone
 */
export function remainderFinder(): (trim: TrimmedLanding) => LiveAPI | null {
  const scanned = new Map<string, LiveAPI[]>();

  return (trim) => {
    const key = JSON.stringify(trim.lane);
    const clips = scanned.get(key) ?? clipsOnLane(trim.lane);

    scanned.set(key, clips);

    return clips.find((clip) => isRemainder(clip, trim)) ?? null;
  };
}

/**
 * Whether a clip is what a trim left: it ends where the landing did, and
 * starts no earlier than the trim could have left it. A landing trimmed again
 * from the front by a clip outside the group is still itself, and still ends
 * there.
 * @param clip - A clip on the landing's lane
 * @param trim - What the trim left behind
 * @returns True when this is the remainder
 */
function isRemainder(clip: LiveAPI, trim: TrimmedLanding): boolean {
  return (
    Math.abs((clip.getProperty("end_time") as number) - trim.end) <
      SAME_TIME_EPSILON &&
    (clip.getProperty("start_time") as number) > trim.beats - SAME_TIME_EPSILON
  );
}

/**
 * One group's trims: walking its landings backwards, each one keeps whatever
 * reaches past the longest landing after it.
 * @param group - The clips that landed on one lane and position
 * @param trims - The remainders so far, added to
 */
function addGroupTrims(
  group: MoveGroup,
  trims: Map<string, TrimmedLanding>,
): void {
  const landings = knownLengths(group.landed);

  // One landing trims nothing, and a length that can't be trusted would
  // describe the wrong clip — leave the whole group to the read-back instead.
  if (landings == null || landings.length < 2) {
    return;
  }

  let coveredAfter = 0;

  for (const { id, length } of landings.toReversed()) {
    if (coveredAfter > 0 && length > coveredAfter) {
      trims.set(id, {
        lane: arrangementLaneOf(group.landing),
        beats: group.startBeats + coveredAfter,
        end: group.startBeats + length,
      });
    }

    coveredAfter = Math.max(coveredAfter, length);
  }
}

/** A landing whose length was read. */
interface MeasuredLanding {
  id: string;
  length: number;
}

/**
 * The group's landings in landing order, or null when any length is unknown.
 * @param landed - What each clip's placement landed, by source id
 * @returns The landings, or null when one can't be measured
 */
function knownLengths(
  landed: ReadonlyMap<string, LandedClip>,
): MeasuredLanding[] | null {
  const measured: MeasuredLanding[] = [];

  for (const { id, length } of landed.values()) {
    if (length == null) {
      return null;
    }

    measured.push({ id, length });
  }

  return measured;
}
