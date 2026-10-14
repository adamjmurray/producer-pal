// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { errorMessage } from "#src/shared/error-message.ts";
import { targetObject } from "#src/tools/shared/validation/lists/named-targets.ts";
import { refuseUnparsableEntries } from "#src/tools/shared/validation/helpers/object-paths.ts";
import { trackIdAtPath } from "#src/tools/shared/validation/path-target-lookup.ts";
import { type Target } from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import {
  type TakeLaneTargetSpec,
  planTakeLaneTargets,
} from "../track-take-lanes.ts";
import { type TrackCall } from "./parse-track-call.ts";

/** What one target of an update-track call carries into its write. */
export type TrackPayload =
  | { kind: "track"; track: LiveAPI }
  | { kind: "lane"; spec: TakeLaneTargetSpec };

/**
 * Name the call's targets and resolve each now, before the first write. A path
 * that can't be parsed refuses the call; one that parses but names no track
 * skips only its own target.
 * @param call - The update-track call
 * @returns The targets in the order named, ids first
 * @throws Error when a path can't be parsed, or the take lanes the call makes
 *   would put a track over the cap
 */
export function trackTargets(call: TrackCall): Array<Target<TrackPayload>> {
  // Lanes are planned before anything runs: a plan over the cap is refused
  // whole, because a lane an earlier entry created can't be taken back.
  const lanes = planTakeLaneTargets(call.named);

  // A path that doesn't parse refuses the call; the lookup below parses it
  // again and says any legacy spelling.
  refuseUnparsableEntries(call.targets.path, "path");

  return call.named.map((named, index): Target<TrackPayload> => {
    const spec = lanes.get(index);

    if (spec != null) {
      return {
        named,
        // A lane named by its id and by its path is one lane; one that is
        // appended (`l+`) is a new lane each time, so it has no key.
        key: spec.laneIndex == null ? undefined : laneKey(spec),
        data: { kind: "lane", spec },
      };
    }

    try {
      const track = targetObject(named, "track", trackIdAtPath);

      // Keyed by the track itself, so an id and its path are one target.
      return { named, key: track.id, data: { kind: "track", track } };
    } catch (error) {
      return { named, skip: errorMessage(error) };
    }
  });
}

// --- Helpers below main export ---

/**
 * What names one take lane, whatever the call spelled it as.
 * @param spec - The lane target
 * @param spec.trackIndex - The track holding the lane
 * @param spec.laneIndex - The lane
 * @returns A key no track's id can equal
 */
function laneKey({ trackIndex, laneIndex }: TakeLaneTargetSpec): string {
  return `take lane t${trackIndex}/l${laneIndex}`;
}
