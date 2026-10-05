// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { sharingLaneView } from "#src/tools/shared/arrangement/helpers/arrangement-lane-view.ts";
import { runWrite } from "#src/tools/shared/write-pipeline/write-pipeline.ts";
import {
  type PipelineResult,
  type WriteSpec,
} from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import { checkDuplicateCall } from "./helpers/call/check-duplicate-call.ts";
import {
  type CopyPayload,
  type DuplicateArgs,
  type DuplicateCall,
  type DuplicateRun,
} from "./helpers/call/duplicate-call-types.ts";
import { newDuplicateRun } from "./helpers/call/duplicate-run.ts";
import { duplicateTargets } from "./helpers/call/duplicate-targets.ts";
import { parseDuplicateCall } from "./helpers/call/parse-duplicate-call.ts";
import { planDuplicateOrder } from "./helpers/call/plan-duplicate-order.ts";
import { settleDuplicate } from "./helpers/call/settle-duplicate.ts";
import { writeDuplicateCopy } from "./helpers/call/write-duplicate-copy.ts";

/**
 * Duplicates an object based on its type.
 * @param args - The parameters
 * @param args.type - Object type to duplicate
 * @param args.id - Object ID(s), comma-separated to copy several sources
 * @param args.ids - Hidden alias for id
 * @param args.path - Source path(s), comma-separated, instead of or alongside id
 * @param args.paths - Hidden alias for path
 * @param args.count - Number of duplicates
 * @param args.arrangementStart - Arrangement position(s): bar|beat or `loc:<locator>`
 * @param args.locator - Deprecated locator ref(s); use arrangementStart
 * @param args.arrangementLength - Span to fill: one for all, or one per copy
 * @param args.name - Name for duplicates
 * @param args.color - Color for all the copies, or comma-separated one per copy
 * @param args.withoutClips - Exclude clips
 * @param args.withoutDevices - Exclude devices
 * @param args.routeToSource - Route to source
 * @param args.focus - Focus duplicated clip/scene
 * @param args.toSlot - Deprecated destination clip slot(s); use toPath
 * @param args.toPath - Destination path(s): track, clip slot, or device
 * @param args.transforms - Transform expressions broadcast across all copies
 * @param args.code - JavaScript function body broadcast across all copies
 * @param args.takeLane - Arrangement take lane target for clips (0/omitted = main, 1+)
 * @param args.takeLaneName - Deprecated: name for a lane this call creates
 * @param context - Context object
 * @returns The copy when the call made one, otherwise one entry per copy asked for
 */
export async function duplicate(
  args: DuplicateArgs,
  context: Partial<ToolContext> = {},
): Promise<PipelineResult<object>> {
  // Every arrangement write in the call, and in a tool nested in it, shares the
  // one lane view the context carries meanwhile.
  return await sharingLaneView(
    context,
    async () =>
      await runWrite(duplicateSpec(newDuplicateRun(context)), args, context),
  );
}

/**
 * The hooks of one duplicate call. Every copy of every source is a target, in
 * the order the call named them.
 * @param run - The call's shared state
 * @returns The spec to run the call with
 */
function duplicateSpec(
  run: DuplicateRun,
): WriteSpec<DuplicateArgs, DuplicateCall, CopyPayload, DuplicateCall, object> {
  return {
    tool: "ppal-duplicate",
    words: {
      // Known once the call is read: a copy of a track or scene, or a place.
      get rerun() {
        return run.rerun;
      },
    },

    parse: (args) => parseDuplicateCall(args),
    targets: (parsed, call) => duplicateTargets(parsed, run, call),
    check: (parsed, targets) => checkDuplicateCall(parsed, targets, run),

    plan: (targets, _checked, _call, superseded) =>
      planDuplicateOrder(targets, superseded, run),
    write: (target, step) => writeDuplicateCopy(run, target, step),

    settle: (done, call) => settleDuplicate(run, done, call),
  };
}
