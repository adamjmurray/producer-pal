// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { validateSendPair } from "#src/tools/shared/helpers/send-validation.ts";
import { type SendEntry } from "#src/tools/shared/sends/sends-schema.ts";
import { type ListArg } from "#src/tools/shared/validation/lists/list-lengths.ts";
import {
  type NamedTarget,
  namedTargets,
} from "#src/tools/shared/validation/lists/named-targets.ts";
import {
  type TargetParams,
  foldTargetParams,
  targetCount,
  targetParamLabel,
} from "#src/tools/shared/validation/lists/target-lists.ts";
import { type PanningMode } from "../track-mixer-updates.ts";
import { validateMonitoringState } from "../track-monitoring-updates.ts";
import { ROUTING_PARAMS } from "../track-routing-updates.ts";

export interface UpdateTrackArgs {
  id?: string;
  /** Hidden alias for id */
  ids?: string;
  path?: string;
  /** Hidden alias for path */
  paths?: string;
  name?: string;
  color?: string;
  gainDb?: number;
  pan?: number;
  panningMode?: PanningMode;
  leftPan?: number;
  rightPan?: number;
  mute?: boolean;
  solo?: boolean;
  arm?: boolean;
  inputRoutingType?: string;
  inputRoutingChannel?: string;
  outputRoutingType?: string;
  outputRoutingChannel?: string;
  /** Deprecated: use inputRoutingType */
  inputRoutingTypeId?: string;
  /** Deprecated: use inputRoutingChannel */
  inputRoutingChannelId?: string;
  /** Deprecated: use outputRoutingType */
  outputRoutingTypeId?: string;
  /** Deprecated: use outputRoutingChannel */
  outputRoutingChannelId?: string;
  monitoringState?: string;
  sendGainDb?: number;
  sendReturn?: string;
  sends?: SendEntry[];
}

/** An update-track call, read once and refused if it was written wrong. */
export interface TrackCall {
  args: UpdateTrackArgs;
  /** The target params, folded onto `id` and `path` */
  targets: TargetParams;
  /** The target params as sent, for a blank one to be reported */
  sent: TargetParams;
  /** The targets, ids first, each as the caller wrote it */
  named: NamedTarget[];
}

/**
 * Read an update-track call, refusing one that was written wrong before any
 * track is touched.
 * @param args - The update-track args
 * @returns The call, with its target params folded
 * @throws Error when the call names no target, or a whole-call param can't be
 *   read
 */
export function parseTrackCall(args: UpdateTrackArgs): TrackCall {
  const { id, ids, path, paths } = args;
  // Folded once: a param that names nothing warns every time it is read.
  const targets = foldTargetParams({ id, ids, path, paths });

  if (targetCount(targets) === 0) {
    throw new Error("id or path is required");
  }

  const named = namedTargets(targets);

  validateSendPair(args.sendGainDb, args.sendReturn);
  validateMonitoringState(args.monitoringState);

  return { args, targets, sent: { id, ids, path, paths }, named };
}

/**
 * The lists a call has to keep the same length.
 * @param call - The update-track call
 * @param call.args - The call's args
 * @param call.targets - The call's target params, folded
 * @returns The lists to compare
 */
export function trackListArgs({ args, targets }: TrackCall): ListArg[] {
  return [
    { param: targetParamLabel(targets), count: targetCount(targets) },
    { param: "name", value: args.name },
    { param: "color", value: args.color },
    ...[...ROUTING_PARAMS, "sendReturn" as const].map((param) => ({
      param,
      value: args[param],
    })),
  ];
}
