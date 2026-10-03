// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Take lanes as update-track targets. `t2/l<n>` names a lane, creating the ones
// up to it; `t2/l+` appends one; a lane's own id names the lane it came from. A
// lane holds a name and nothing else, so every other param the call sent is
// reported on the lane's own entry.

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { MAX_TAKE_LANES } from "#src/tools/constants.ts";
import {
  assertTrackTakesLanes,
  resolveTakeLane,
  takeLaneById,
  takeLaneCapacityMessage,
} from "#src/tools/shared/arrangement/helpers/take-lanes.ts";
import { createdRange } from "#src/tools/shared/helpers/created-range.ts";
import { takeLanePathEntry } from "#src/tools/shared/validation/helpers/object-paths.ts";
import { CREATE_TRACK_ADVICE } from "#src/tools/shared/validation/object-path.ts";
import { type NamedTarget } from "#src/tools/shared/validation/lists/named-targets.ts";
import { pathField } from "#src/tools/shared/validation/object-path-for-api.ts";

/** One take-lane target of a call, as the caller spelled it. */
export interface TakeLaneTargetSpec {
  /** The entry the caller wrote, path or id, for messages */
  entry: string;
  trackIndex: number;
  /** The lane to name, or null to append one (`l+`) */
  laneIndex: number | null;
  /** Whether the target is work in itself: it adds a lane, or its track can't
   * hold one and the write says why. Set by the plan, once the lanes are
   * counted. */
  work: boolean;
}

/** What update-track reports about a take lane it wrote to. */
export interface UpdateTakeLaneResult {
  id: string;
  path?: string;
  name: string;
  /** The lanes this call made ("l3", or "l1-l3" when it filled the gap below
   * the one named), when it made any */
  created?: string;
  detail?: string;
}

/** The params that name the targets, plus the one a lane can use. */
const TARGET_AND_LANE_PARAMS = new Set(["id", "ids", "path", "paths", "name"]);

/**
 * The lane targets in a call, by their position in the target list, with the
 * whole plan checked against the cap first.
 * @param targets - The targets, in the order the call named them
 * @returns The lane targets, keyed by position; empty when the call names none
 */
export function planTakeLaneTargets(
  targets: NamedTarget[],
): Map<number, TakeLaneTargetSpec> {
  const lanes = new Map<number, TakeLaneTargetSpec>();

  for (const [index, target] of targets.entries()) {
    const spec =
      target.param === "path"
        ? lanePathSpec(target.value)
        : laneIdSpec(target.value);

    if (spec != null) {
      lanes.set(index, spec);
    }
  }

  planTakeLaneGrowth([...lanes.values()]);

  return lanes;
}

/**
 * The params a call sent that a take lane has no use for, in the caller's own
 * spelling. A lane is a name and a list of clips; everything else update-track
 * writes belongs to a track.
 * @param args - The call's args, as the caller sent them
 * @returns The param names, in the order the call sent them
 */
export function paramsTakeLanesIgnore(args: object): string[] {
  return Object.entries(args)
    .filter(
      ([param, value]) => !TARGET_AND_LANE_PARAMS.has(param) && value != null,
    )
    .map(([param]) => param);
}

/**
 * Names one take lane, appending or filling in the lanes up to it first.
 * @param spec - The lane target
 * @param name - The name for it, or undefined to leave it alone
 * @param ignored - The params this lane can't use, from {@link paramsTakeLanesIgnore}
 * @param landed - Told what has changed as it does, for a throw to say so
 * @returns The lane's entry in the result
 * @throws Error when the path names no track, or one with no take lanes, or
 *   when the call asked nothing of the lane that it can take
 */
export function updateTakeLane(
  spec: TakeLaneTargetSpec,
  name: string | undefined,
  ignored: string[],
  landed: (phrase: string, partial?: Record<string, unknown>) => void,
): UpdateTakeLaneResult {
  const track = laneTrack(spec);
  const before = track.getChildCount("take_lanes");
  const laneIndex = spec.laneIndex ?? before;
  const { lane } = resolveTakeLane(track, laneIndex);
  // Naming a lane past the end fills in every lane below it too, so the entry
  // says which lanes the call made, not just the one it asked for.
  const created =
    laneIndex >= before ? createdRange("l", before, laneIndex) : null;

  // A lane the call made or named still got what it could give it, so the
  // ignored params are a note on a hit. With nothing written, the target was
  // refused: a lone one throws, and in a list it is a skip.
  if (created == null && name == null && ignored.length > 0) {
    throw new Error(ignoredParamsDetail(ignored));
  }

  const address = { id: lane.id, ...pathField(lane) };

  if (created != null) {
    landed(`take lane ${created} made`, { ...address, created });
  }

  lane.setAll({ name }, () => landed("name", address));

  return {
    ...address,
    // A lane is only ever its name, so the entry says what it is now: the name
    // just written, or the one it kept.
    name: name ?? lane.getName(),
    ...(created == null ? {} : { created }),
    ...(ignored.length === 0 ? {} : { detail: ignoredParamsDetail(ignored) }),
  };
}

// --- Helpers below main exports ---

/**
 * What a lane says about the params it can't use.
 * @param ignored - The ignored params, in the caller's spelling
 * @returns The detail
 */
function ignoredParamsDetail(ignored: string[]): string {
  return `a take lane takes only name; ignored ${ignored.join(", ")}`;
}

/**
 * The lane a path entry names.
 * @param entry - One path, as the caller wrote it
 * @returns The lane target, or null when the path names no lane
 */
function lanePathSpec(entry: string): TakeLaneTargetSpec | null {
  const path = takeLanePathEntry(entry);

  if (path == null) {
    return null;
  }

  return {
    entry,
    trackIndex: path.trackIndex,
    laneIndex: path.kind === "take-lane" ? path.laneIndex : null,
    work: false,
  };
}

/**
 * The lane an id names. It is already there, so it adds nothing to the track's
 * lane count.
 * @param entry - One id, as the caller wrote it
 * @returns The lane target, or null when the id names something else
 */
function laneIdSpec(entry: string): TakeLaneTargetSpec | null {
  const lane = takeLaneById(entry);

  if (lane == null) {
    return null;
  }

  // A lane sits at `live_set tracks N take_lanes M`, so both indices are there.
  return {
    entry,
    trackIndex: lane.trackIndex as number,
    laneIndex: lane.takeLaneIndex as number,
    work: false,
  };
}

/**
 * Marks the lane targets that are work, and refuses a call whose lane entries
 * would put a track over the cap, before any lane exists. Lanes can't be
 * deleted, so a call that created some and then hit the cap would strand them.
 * @param specs - Every lane target in the call, in the order named; each one
 *   that is work is marked in place
 * @throws Error when a track would end up over MAX_TAKE_LANES
 */
function planTakeLaneGrowth(specs: TakeLaneTargetSpec[]): void {
  // null for a track that can hold no lanes: those entries are skipped one by
  // one, so they add nothing to count.
  const counts = new Map<number, number | null>();

  for (const spec of specs) {
    const { trackIndex } = spec;
    const before = counts.has(trackIndex)
      ? counts.get(trackIndex)
      : startingLaneCount(spec);

    if (before == null) {
      // Skipped one by one when the call runs, with the real reason.
      spec.work = true;
      counts.set(trackIndex, null);
      continue;
    }

    const total =
      spec.laneIndex == null
        ? before + 1
        : Math.max(before, spec.laneIndex + 1);

    // A lane that already exists creates nothing, so a track already over the
    // cap can still have one renamed.
    if (total > before && total > MAX_TAKE_LANES) {
      throw new Error(
        `${takeLaneCapacityMessage(total - 1)}; "${spec.entry}" would add it. ` +
          `Nothing was created — a take lane can't be deleted.`,
      );
    }

    spec.work = total > before;
    counts.set(trackIndex, total);
  }
}

/**
 * The lanes a track already has, or null when it can hold none — a track that
 * isn't there, or a group. Those entries are skipped one at a time when the
 * call runs, so they add nothing to the count.
 * @param spec - A lane target on that track
 * @returns The lane count, or null when the track holds no lanes
 */
function startingLaneCount(spec: TakeLaneTargetSpec): number | null {
  try {
    return laneTrack(spec).getChildCount("take_lanes");
  } catch {
    return null;
  }
}

/**
 * The track a lane target sits on.
 * @param spec - The lane target
 * @returns The track
 * @throws Error when the path names no track, or one with no take lanes
 */
function laneTrack(spec: TakeLaneTargetSpec): LiveAPI {
  const track = LiveAPI.from(livePath.track(spec.trackIndex));

  if (!track.exists()) {
    throw new Error(`no track at path "${spec.entry}"; ${CREATE_TRACK_ADVICE}`);
  }

  assertTrackTakesLanes(track, spec.trackIndex);

  return track;
}
