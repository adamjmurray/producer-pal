// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  type PairedLabels,
  pairLabels,
} from "#src/tools/shared/validation/lists/labeled-targets.ts";
import { refuseNoWrite } from "#src/tools/shared/validation/lists/refuse-no-write.ts";
import { type TargetParams } from "#src/tools/shared/validation/lists/target-lists.ts";
import { type Target } from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import {
  type RoutingParams,
  routingValuesAt,
} from "../track-routing-updates.ts";
import { type TrackSends, trackSendsAt } from "../track-send-updates.ts";
import { paramsTakeLanesIgnore } from "../track-take-lanes.ts";
import { type UpdateTrackArgs, type TrackCall } from "./parse-track-call.ts";
import { type TrackPayload } from "./resolve-track-targets.ts";

/** An update-track call, checked and ready to write. */
export interface TrackChecked extends PairedLabels {
  args: UpdateTrackArgs;
  /** The routing the target at an index takes from the call */
  routingAt: (index: number) => RoutingParams;
  /** The sends the target at an index takes from the call */
  sendsAt: (index: number) => TrackSends;
  /** The params a take lane has no use for, in the caller's spelling */
  laneIgnores: string[];
  /** The target params as sent, for a blank one to be reported */
  sent: TargetParams;
  /** How many targets the call named */
  named: number;
}

/**
 * Pair the call's lists with the targets named, refusing a call that can't be
 * carried out before any track is touched.
 * @param call - The update-track call
 * @param targets - The call's targets
 * @returns What each target takes from the lists
 * @throws Error when a list can't be paired, or the call asks nothing of its
 *   targets: a take lane path that adds a lane, or that no track can hold, is
 *   work in itself
 */
export function checkTrackCall(
  call: TrackCall,
  targets: Array<Target<TrackPayload>>,
): TrackChecked {
  const { args, sent } = call;
  const lanes = targets.flatMap(({ data }) =>
    data?.kind === "lane" ? [data.spec] : [],
  );

  if (!lanes.some((lane) => lane.work)) {
    refuseNoWrite(args, "tracks");
  }

  return {
    args,
    // Paired against the targets named, not the ones that resolve, so name[k]
    // and color[k] still land on target k when an earlier one is skipped.
    ...pairLabels({
      noun: "track",
      count: targets.length,
      name: args.name,
      color: args.color,
    }),
    routingAt: routingValuesAt(args, targets.length),
    // The return tracks belong to the Live Set, so only the sendReturn a track
    // was given decides what its sends resolve to.
    sendsAt: trackSendsAt(
      args.sendGainDb,
      args.sendReturn,
      args.sends,
      targets.length,
    ),
    laneIgnores: lanes.length > 0 ? paramsTakeLanesIgnore(args) : [],
    sent,
    named: targets.length,
  };
}
