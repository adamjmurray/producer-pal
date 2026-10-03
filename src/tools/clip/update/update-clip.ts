// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type ClipResult } from "#src/tools/clip/helpers/clip-results.ts";
import { sharingLaneView } from "#src/tools/shared/arrangement/helpers/arrangement-lane-view.ts";
import { runWrite } from "#src/tools/shared/write-pipeline/write-pipeline.ts";
import {
  type PipelineResult,
  type WriteSpec,
} from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import { checkClipUpdate } from "./helpers/call/check-clip-update.ts";
import { type ClipRun, newClipRun } from "./helpers/call/clip-run.ts";
import { type ClipUpdateArgs } from "./helpers/call/clip-update-args.ts";
import {
  type ClipCall,
  parseClipCall,
} from "./helpers/call/parse-clip-call.ts";
import {
  type ClipPlanned,
  planClipMoves,
} from "./helpers/call/plan-clip-moves.ts";
import {
  type ClipPayload,
  clipTargets,
} from "./helpers/call/resolve-clip-targets.ts";
import { settleClipUpdate } from "./helpers/call/settle-clip-update.ts";
import { writeClip } from "./helpers/call/write-clip.ts";

/** What update-clip answers: a lone entry, or one entry per target. */
export type UpdateClipResult = PipelineResult<ClipResult>;

/**
 * Updates properties of existing clips
 *
 * @param args - The clip parameters
 * @param args.id - Clip ID or comma-separated list of clip IDs to update
 * @param args.ids - Hidden alias for id (args.paths is the one for path)
 * @param args.path - Clip slot(s) of clips to update, instead of id
 * @param args.notes - Musical notation string
 * @param args.transforms - Transform expressions applied AFTER merge, broadcast across all the clips
 * @param args.preTransforms - Transform expressions applied to existing notes BEFORE merging new notes (works with or without notes; bare "v0" clears the clip)
 * @param args.name - Optional clip name
 * @param args.color - Optional clip color (CSS format: hex)
 * @param args.timeSignature - Time signature in format "4/4", one per clip
 * @param args.start - Bar|beat position where loop/clip region begins, one per clip
 * @param args.length - Duration: <count>bar, n<fraction> note value, or <count>bar+n<fraction> (end = start + length), one per clip
 * @param args.firstStart - Bar|beat position for initial playback start, one per clip
 * @param args.looping - Enable looping for the clip
 * @param args.duplicateLoop - Double the clip length, copying notes and envelopes into the new half (native Clip.duplicate_loop; MIDI clips only). Refuses start/length, which set the region it doubles. Composes with the rest on a defined timeline: firstStart, then preTransforms edit the source, then the double; notes, transforms, and code then apply across the full doubled clip
 * @param args.arrangementStart - Bar|beat position(s) to move arrangement clips to, one per id
 * @param args.arrangementLength - Duration(s) for the arrangement span, one per id: <count>bar, n<fraction>, or <count>bar+n<fraction>
 * @param args.toSlot - Deprecated session destination slot (trackIndex/sceneIndex); use toPath
 * @param args.toPath - Where to move the clip: a clip slot ("t2/s3"), a track's arrangement lane ("t2"), or a take lane on it ("t2/l0")
 * @param args.arrangementSplit - Comma-separated song-timeline bar|beat positions to split clips at
 * @param args.split - Deprecated split positions, measured from each clip's start; use arrangementSplit
 * @param args.gainDb - Audio clip gain in decibels (-70 to 24)
 * @param args.pitchShift - Audio clip pitch shift in semitones (-48 to 48)
 * @param args.warpMode - Audio clip warp mode
 * @param args.warping - Audio clip warping on/off
 * @param args.warpOp - Warp marker operation: add, move, remove
 * @param args.warpBeatTime - Beat time for warp marker operation
 * @param args.warpSampleTime - Sample time for warp marker operation
 * @param args.warpDistance - Distance parameter for move operations
 * @param args.quantize - Quantization strength 0-1 (MIDI clips only)
 * @param args.quantizeGrid - Note grid for quantization
 * @param args.quantizePitch - Limit quantization to specific pitch
 * @param args.code - JavaScript code to transform notes (broadcast across the clips; use context.clip.{index,count} for per-clip variation)
 * @param args.envelopes - Clip automation, one "<target>: <notation>" line per parameter (broadcast across the clips)
 * @param args.focus - Select the clip and show clip detail view
 * @param context - Per-request context
 * @returns The clip when one was named, otherwise one entry per target named
 */
export async function updateClip(
  args: ClipUpdateArgs = {},
  context: Partial<ToolContext> = {},
): Promise<UpdateClipResult> {
  const run = newClipRun(context);

  // Every arrangement write in the call, and in a call nested in it, shares the
  // one lane view the context carries meanwhile.
  return await sharingLaneView(
    context,
    async () => await runWrite(clipWriteSpec(run), args, context),
  );
}

/**
 * The hooks of one update-clip call. Built per call: the targets share what the
 * run keeps, and nothing of it outlives the request.
 * @param run - The call's shared state
 * @returns The spec to run the call with
 */
function clipWriteSpec(
  run: ClipRun,
): WriteSpec<
  ClipUpdateArgs,
  ClipCall,
  ClipPayload,
  ClipCall,
  ClipResult,
  ClipPlanned
> {
  return {
    tool: "ppal-update-clip",
    words: { rerun: "clip" },

    parse: (args) => parseClipCall(args),
    targets: (call) =>
      clipTargets(call, {
        lanes: run.context.lanes,
        destinationTracks: run.destinationTracks,
      }),
    check: (call, targets) => checkClipUpdate(call, targets, run),

    plan: (targets, checked, _call, superseded) =>
      planClipMoves(targets, checked, superseded),
    write: (target, step) => writeClip(run, target, step),

    settle: (done, call) => settleClipUpdate(run, done, call),
  };
}
