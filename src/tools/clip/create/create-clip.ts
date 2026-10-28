// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { sharingLaneView } from "#src/tools/shared/arrangement/helpers/arrangement-lane-view.ts";
import { runWrite } from "#src/tools/shared/write-pipeline/write-pipeline.ts";
import { type WriteSpec } from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import { type ClipResultObject } from "./helpers/created-clip-result.ts";
import { type CreateClipArgs } from "./helpers/call/create-clip-args.ts";
import {
  type CreatePayload,
  createClipTargets,
} from "./helpers/call/create-clip-targets.ts";
import { type CreateRun, newCreateRun } from "./helpers/call/create-run.ts";
import {
  type CreateClipCall,
  parseCreateCall,
} from "./helpers/call/parse-create-call.ts";
import { settleCreatedClips } from "./helpers/call/settle-created-clips.ts";
import { writeCreatedClip } from "./helpers/call/write-created-clip.ts";

/**
 * Creates MIDI or audio clips in Session or Arrangement view, one per
 * destination named. A destination that got no clip keeps its place in the
 * result as a skip entry.
 * @param args - The clip params (see CreateClipArgs); `path` says where the
 *   clips go, comma-separated for several
 * @param context - Per-request context: the deadline, the notation
 * @returns The clip when one destination was named, otherwise one entry per
 *   destination
 */
export async function createClip(
  args: CreateClipArgs,
  context: Partial<ToolContext> = {},
): Promise<object | object[]> {
  // Every arrangement write in the call shares the one lane view the context
  // carries meanwhile.
  return await sharingLaneView(
    context,
    async () =>
      await runWrite(createClipSpec(newCreateRun(context)), args, context),
  );
}

/**
 * The hooks of one create-clip call. Built per call: the targets share what
 * the run keeps, and nothing of it outlives the request.
 * @param run - The call's shared state
 * @returns The spec to run the call with
 */
function createClipSpec(
  run: CreateRun,
): WriteSpec<
  CreateClipArgs,
  CreateClipCall,
  CreatePayload,
  CreateClipCall,
  ClipResultObject
> {
  return {
    tool: "ppal-create-clip",
    words: { rerun: "clip" },

    parse: parseCreateCall,
    targets: createClipTargets,
    // Nothing to look up: take lanes are made when a target first needs one,
    // so a target the call never reaches (the deadline, say) makes none.
    check: (call) => call,

    write: (target, step) => writeCreatedClip(run, target, step),

    settle: (done, call) => settleCreatedClips(run, done, call),
  };
}
