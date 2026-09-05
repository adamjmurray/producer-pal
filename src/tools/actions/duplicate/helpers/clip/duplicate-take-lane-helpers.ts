// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  resolveTakeLane,
  takeLaneKey,
  takeLaneTargetsThatFit,
  type ArrangementTrack,
} from "#src/tools/shared/arrangement/helpers/take-lane-helpers.ts";
import { paramNamesSomething } from "#src/tools/shared/utils.ts";
import {
  canRecreateClip,
  recreatedClipLosses,
} from "#src/tools/shared/clip/recreate-clip.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";

/** A take lane this call resolved, and where it landed on the track. */
export interface ResolvedDuplicateLane {
  lane: LiveAPI;
  laneIndex: number;
}

/**
 * Resolve every take lane a duplicate's destinations name, auto-creating as
 * needed.
 *
 * Lanes are permanent (Live has no delete), so every destination's capacity is
 * checked before any lane is created — a cap error partway through would strand
 * the lanes already made. A destination that doesn't fit is warned and dropped
 * so the copies around it still run.
 * @param sourceClip - The clip being duplicated
 * @param targets - Destinations, in copy order
 * @param takeLaneName - Name for a take lane newly created by this call
 * @param tracks - The destination tracks, keyed by index
 * @returns Lanes keyed by {@link takeLaneKey}
 */
export function resolveDuplicateTakeLanes(
  sourceClip: LiveAPI,
  targets: ArrangementTrack[],
  takeLaneName: string | undefined,
  tracks: Map<number, LiveAPI> = new Map(),
): Map<string, ResolvedDuplicateLane> {
  const laneTargets = targets.filter((target) => target.takeLane != null);

  if (laneTargets.length === 0) {
    if (paramNamesSomething(takeLaneName)) {
      console.warn("takeLaneName ignored: no destination names a take lane");
    }

    return new Map();
  }

  // An audio clip is rebuilt from its sample, so one that has lost its file (or
  // never had one) can't go on a lane at all.
  if (!canRecreateClip(sourceClip)) {
    console.warn(
      `audio clip ${targetLabel(sourceClip)} has no sample file to rebuild it from, so it was not duplicated to a take lane`,
    );

    return new Map();
  }

  const lanes = new Map<string, ResolvedDuplicateLane>();
  const losses = recreatedClipLosses(sourceClip);

  // Resolve once per destination rather than once per copy — otherwise a single
  // "l+" covering three arrangementStarts gets three fresh lanes.
  for (const destination of takeLaneTargetsThatFit(laneTargets)) {
    const { trackIndex, takeLane: target } = destination;
    const key = takeLaneKey(destination);

    if (lanes.has(key)) continue;

    const { lane, laneIndex } = resolveTakeLane(
      tracks.get(trackIndex) ?? LiveAPI.from(livePath.track(trackIndex)),
      target,
      takeLaneName,
    );

    lanes.set(key, { lane, laneIndex });
    console.warn(
      `created on take lane "t${trackIndex}/l${laneIndex}"` +
        (losses ? ` (${losses})` : "") +
        ". Expand the take-lanes arrow on the track header in Live to see it.",
    );
  }

  return lanes;
}
