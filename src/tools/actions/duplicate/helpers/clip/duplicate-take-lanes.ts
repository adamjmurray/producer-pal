// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  resolveTakeLane,
  takeLaneLabel,
  takeLaneTargetsThatFit,
  type ArrangementTrack,
} from "#src/tools/shared/arrangement/helpers/take-lanes.ts";
import { paramNamesSomething } from "#src/tools/shared/helpers/param-presence.ts";
import {
  canRecreateClip,
  recreatedClipLosses,
  recreateLossesNote,
} from "#src/tools/shared/clip/recreate-clip.ts";

/** A take lane this call resolved, and where it landed on the track. */
export interface ResolvedDuplicateLane {
  lane: LiveAPI;
  laneIndex: number;
}

/** The lanes a call resolved, and why each one it couldn't wasn't usable. */
export interface DuplicateTakeLanes {
  /** Lanes keyed by {@link takeLaneLabel}. */
  lanes: Map<string, ResolvedDuplicateLane>;
  /** Why each lane destination got none, by the same key. */
  refusals: Map<string, string>;
}

/**
 * Resolve every take lane a duplicate's destinations name, auto-creating as
 * needed.
 *
 * Lanes are permanent (Live has no delete), so every destination's capacity is
 * checked before any lane is created — a cap error partway through would strand
 * the lanes already made. A destination that gets no lane is left out, and its
 * own entry in the result says no copy landed there.
 * @param sourceClip - The clip being duplicated
 * @param targets - Destinations, in copy order
 * @param takeLaneName - Deprecated: name for a lane this call creates
 * @param tracks - The destination tracks, keyed by index
 * @returns The lanes, and why each destination that got none didn't
 */
export function resolveDuplicateTakeLanes(
  sourceClip: LiveAPI,
  targets: ArrangementTrack[],
  takeLaneName: string | undefined,
  tracks: Map<number, LiveAPI> = new Map(),
): DuplicateTakeLanes {
  const laneTargets = targets.filter((target) => target.takeLane != null);
  const lanes = new Map<string, ResolvedDuplicateLane>();

  if (laneTargets.length === 0) {
    if (paramNamesSomething(takeLaneName)) {
      console.warn("takeLaneName ignored: no destination names a take lane");
    }

    return { lanes, refusals: new Map() };
  }

  // An audio clip is rebuilt from its sample, so one that has lost its file (or
  // never had one) can't go on a lane at all. Each lane destination's entry says
  // so; the caller holds the reason.
  if (!canRecreateClip(sourceClip)) {
    return { lanes, refusals: new Map() };
  }

  const losses = recreatedClipLosses(sourceClip);
  const { fitting, dropped } = takeLaneTargetsThatFit(laneTargets);

  // Resolve once per destination rather than once per copy.
  for (const destination of fitting) {
    const { trackIndex, takeLane: target } = destination;
    const key = takeLaneLabel(destination);

    if (lanes.has(key)) {
      continue;
    }

    const { lane, laneIndex } = resolveTakeLane(
      tracks.get(trackIndex) ?? LiveAPI.from(livePath.track(trackIndex)),
      target,
      takeLaneName,
    );

    lanes.set(key, { lane, laneIndex });
    console.warn(
      `created on take lane "t${trackIndex}/l${laneIndex}"` +
        recreateLossesNote(losses) +
        ". Expand the take-lanes arrow on the track header in Live to see it.",
    );
  }

  return { lanes, refusals: dropped };
}
