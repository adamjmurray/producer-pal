// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type ListArg } from "#src/tools/shared/validation/lists/list-lengths.ts";
import { type Target } from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import {
  type CreateTrackTarget,
  type CreateTrackType,
  resolveCreateTrackTargets,
} from "./create-track-targets.ts";

export interface CreateTrackArgs {
  path?: string;
  trackIndex?: number;
  count?: number;
  name?: string;
  color?: string;
  type?: CreateTrackType;
  mute?: boolean;
  solo?: boolean;
  arm?: boolean;
}

/** A create-track call, read once. */
export interface CreateTrackCall {
  targets: CreateTrackTarget[];
  /** Whether `count` said how many tracks, which list errors then name */
  counted: boolean;
  name: string | undefined;
  color: string | undefined;
  mute: boolean | undefined;
  solo: boolean | undefined;
  arm: boolean | undefined;
}

/**
 * Stage 1: read where the tracks go. Reading the deprecated params warns, so
 * it is done once here.
 * @param args - The tool's args
 * @returns The call
 * @throws Error when a path can't be read, or the call mixes addressing params
 */
export function parseCreateTrackCall(args: CreateTrackArgs): CreateTrackCall {
  const { count, name, color, mute, solo, arm } = args;

  return {
    targets: resolveCreateTrackTargets(args),
    counted: count != null,
    name,
    color,
    mute,
    solo,
    arm,
  };
}

/**
 * Stage 2: one target per track to create.
 * @param call - The create-track call
 * @returns The targets, in the order named
 */
export function createTrackTargets(
  call: CreateTrackCall,
): Array<Target<CreateTrackTarget>> {
  return call.targets.map((target) => ({
    named: { param: "path", value: target.spelled },
    data: target,
  }));
}

/**
 * The lists a call has to keep the same length.
 * @param call - The create-track call
 * @returns The track count, then the name and color lists
 */
export function createTrackLists(call: CreateTrackCall): ListArg[] {
  return [
    {
      param: call.counted ? "count" : "path",
      count: call.targets.length,
      noun: "track",
    },
    { param: "name", value: call.name },
    { param: "color", value: call.color },
  ];
}
