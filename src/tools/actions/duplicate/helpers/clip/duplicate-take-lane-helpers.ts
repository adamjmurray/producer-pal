// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  assertAllTakeLanesFit,
  resolveTakeLane,
  takeLaneKey,
  type ArrangementTrack,
  type TakeLaneTarget,
} from "#src/tools/shared/arrangement/take-lane-helpers.ts";

/**
 * Resolve every take lane a duplicate's destinations name, auto-creating as
 * needed.
 *
 * Lanes are permanent (Live has no delete), so every destination's capacity is
 * checked before any lane is created — a cap error partway through would strand
 * the lanes already made. MIDI only: an audio source warns and gets no lanes,
 * which skips its lane copies while its main-lane copies still run.
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
): Map<string, LiveAPI> {
  const laneTargets = targets.filter((target) => target.takeLane != null);

  if (laneTargets.length === 0) return new Map();

  if (sourceClip.getProperty("is_midi_clip") !== 1) {
    console.warn(
      `duplicate: take lanes hold MIDI clips only; audio clip "${id}" was not duplicated to a take lane`,
    );

    return new Map();
  }

  assertAllTakeLanesFit(laneTargets);

  const lanes = new Map<string, LiveAPI>();

  // Resolve once per destination rather than once per copy — otherwise a single
  // "l+" cycled over three arrangementStarts gets three fresh lanes.
  for (const destination of laneTargets) {
    const { trackIndex } = destination;
    const target = destination.takeLane as TakeLaneTarget;
    const key = takeLaneKey(destination);

    if (lanes.has(key)) continue;

    const { lane, laneIndex } = resolveTakeLane(
      LiveAPI.from(livePath.track(trackIndex)),
      target,
      takeLaneName,
    );

    lanes.set(key, lane);
    console.warn(
      `duplicate: created on take lane "t${trackIndex}/l${laneIndex}". ` +
        "Expand the take-lanes arrow on the track header in Live to see it.",
    );
  }

  return lanes;
}
