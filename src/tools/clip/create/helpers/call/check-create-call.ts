// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type FittingTakeLaneTarget } from "#src/tools/shared/arrangement/helpers/take-lanes.ts";
import { type Target } from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import { createTakeLanes } from "../clip-timing-context.ts";
import { type CreatePayload } from "./create-clip-targets.ts";
import { type CreateRun } from "./create-run.ts";
import { type CreateClipCall } from "./parse-create-call.ts";

/**
 * Make the take lanes the call writes to, before any clip exists: Live can't
 * delete a lane, so one made for a clip that then fails stays behind either way,
 * and none is made for a destination that was skipped.
 * @param call - The create-clip call
 * @param targets - The call's targets, in the order named
 * @param run - The call's shared state, which keeps the lanes
 * @returns The call, checked
 */
export function checkCreateCall(
  call: CreateClipCall,
  targets: Array<Target<CreatePayload>>,
  run: CreateRun,
): CreateClipCall {
  const fitting = targets.flatMap(({ data }) =>
    data?.position.takeLane == null
      ? []
      : [data.position as FittingTakeLaneTarget<typeof data.position>],
  );

  run.takeLanes = createTakeLanes(call.args.takeLaneName ?? null, fitting);

  return call;
}
