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
} from "#src/tools/shared/arrangement/take-lane-helpers.ts";
import { paramNamesSomething } from "#src/tools/shared/utils.ts";
import { NO_ENVELOPES_NOTE } from "./duplicate-clip-recreate-helpers.ts";

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
 * the lanes already made. A destination that doesn't fit is warned and dropped,
 * like an audio source, so the copies around it still run.
 * @param sourceClip - The clip being duplicated
 * @param id - Source clip ID (for messages)
 * @param targets - Destinations, in copy order
 * @param takeLaneName - Name for a take lane newly created by this call
 * @returns Lanes keyed by {@link takeLaneKey}
 */
export function resolveDuplicateTakeLanes(
  sourceClip: LiveAPI,
  id: string,
  targets: ArrangementTrack[],
  takeLaneName: string | undefined,
): Map<string, ResolvedDuplicateLane> {
  const laneTargets = targets.filter((target) => target.takeLane != null);

  if (laneTargets.length === 0) {
    if (paramNamesSomething(takeLaneName)) {
      console.warn(
        "duplicate: takeLaneName ignored: no destination names a take lane",
      );
    }

    return new Map();
  }

  if (sourceClip.getProperty("is_midi_clip") !== 1) {
    console.warn(
      `duplicate: take lanes hold MIDI clips only; audio clip "${id}" was not duplicated to a take lane`,
    );

    return new Map();
  }

  const lanes = new Map<string, ResolvedDuplicateLane>();

  // Resolve once per destination rather than once per copy — otherwise a single
  // "l+" cycled over three arrangementStarts gets three fresh lanes.
  for (const destination of takeLaneTargetsThatFit(laneTargets, "duplicate")) {
    const { trackIndex, takeLane: target } = destination;
    const key = takeLaneKey(destination);

    if (lanes.has(key)) continue;

    const { lane, laneIndex } = resolveTakeLane(
      LiveAPI.from(livePath.track(trackIndex)),
      target,
      takeLaneName,
    );

    lanes.set(key, { lane, laneIndex });
    console.warn(
      `duplicate: created on take lane "t${trackIndex}/l${laneIndex}" ` +
        `(${NO_ENVELOPES_NOTE}). ` +
        "Expand the take-lanes arrow on the track header in Live to see it.",
    );
  }

  return lanes;
}
