// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Take lanes as update-track targets. `t2/l<n>` names a lane, creating the ones
// up to it; `t2/l+` appends one. A lane holds a name and nothing else, so every
// other param the call sent is reported on the lane's own entry.

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { MAX_TAKE_LANES } from "#src/tools/constants.ts";
import {
  assertTrackTakesLanes,
  resolveTakeLane,
  takeLaneCapacityMessage,
} from "#src/tools/shared/arrangement/helpers/take-lanes.ts";
import { takeLanePathEntry } from "#src/tools/shared/validation/helpers/object-paths.ts";
import { type NamedTarget } from "#src/tools/shared/validation/lists/named-targets.ts";
import { pathField } from "#src/tools/shared/validation/object-path-for-api.ts";

/** One take-lane target of a call, as the caller spelled it. */
export interface TakeLaneTargetSpec {
  /** The path entry, for messages */
  entry: string;
  trackIndex: number;
  /** The lane to name, or null to append one (`l+`) */
  laneIndex: number | null;
}

/** What update-track reports about a take lane it wrote to. */
export interface UpdateTakeLaneResult {
  id: string;
  path?: string;
  name: string;
  /** Only when this call made the lane */
  created?: true;
  ok?: false;
  reason?: string;
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
    const path =
      target.param === "path" ? takeLanePathEntry(target.value) : null;

    if (path != null) {
      lanes.set(index, {
        entry: target.value,
        trackIndex: path.trackIndex,
        laneIndex: path.kind === "take-lane" ? path.laneIndex : null,
      });
    }
  }

  assertTakeLanePlanFits([...lanes.values()]);

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
 * @returns The lane's entry in the result
 * @throws Error when the path names no track, or one with no take lanes
 */
export function updateTakeLane(
  spec: TakeLaneTargetSpec,
  name: string | undefined,
  ignored: string[],
): UpdateTakeLaneResult {
  const track = laneTrack(spec);
  const before = track.getChildCount("take_lanes");
  const laneIndex = spec.laneIndex ?? before;
  const { lane } = resolveTakeLane(track, laneIndex);
  const created = laneIndex >= before;

  lane.setAll({ name });

  // The lane still got what the call could give it when it was created or
  // named, so the ignored params are a note on a hit rather than a skip.
  const wrote = created || name != null;

  return {
    id: lane.id,
    ...pathField(lane),
    // A lane is only ever its name, so the entry says what it is now: the name
    // just written, or the one it kept.
    name: name ?? lane.getName(),
    ...(created ? { created: true as const } : {}),
    ...(ignored.length === 0
      ? {}
      : {
          ...(wrote ? {} : { ok: false as const }),
          reason: `a take lane takes only name; ignored ${ignored.join(", ")}`,
        }),
  };
}

// --- Helpers below main exports ---

/**
 * Refuses a call whose lane entries would put a track over the cap, before any
 * lane exists. Lanes can't be deleted, so a call that created some and then hit
 * the cap would strand them.
 * @param specs - Every lane target in the call, in the order named
 * @throws Error when a track would end up over MAX_TAKE_LANES
 */
function assertTakeLanePlanFits(specs: TakeLaneTargetSpec[]): void {
  // null for a track that can hold no lanes: those entries are skipped one by
  // one, so they add nothing to count.
  const counts = new Map<number, number | null>();

  for (const spec of specs) {
    const { trackIndex } = spec;
    const before = counts.has(trackIndex)
      ? counts.get(trackIndex)
      : startingLaneCount(spec);

    if (before == null) {
      counts.set(trackIndex, null);
      continue;
    }

    const total =
      spec.laneIndex == null
        ? before + 1
        : Math.max(before, spec.laneIndex + 1);

    if (total > MAX_TAKE_LANES) {
      throw new Error(
        `${takeLaneCapacityMessage(total - 1)}; "${spec.entry}" would add it. ` +
          `Nothing was created — a take lane can't be deleted.`,
      );
    }

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
    throw new Error(`no track at path "${spec.entry}"`);
  }

  assertTrackTakesLanes(track, spec.trackIndex);

  return track;
}
