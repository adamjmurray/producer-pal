// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type ClipResult } from "#src/tools/clip/helpers/clip-results.ts";
import { errorMessage } from "#src/shared/error-message.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { applyCodeToSingleClip } from "#src/tools/clip/code-exec/apply-code-to-clip.ts";
import { isDeadlineExceeded } from "#src/tools/clip/helpers/loop-deadline.ts";
import { focusSelect } from "#src/tools/session/helpers/focus-select.ts";
import { unwrapSingleResult } from "#src/tools/shared/helpers/target-entries.ts";
import { getColorForIndex } from "#src/tools/shared/validation/color-parsing.ts";
import { pairLabels } from "#src/tools/shared/validation/lists/labeled-targets.ts";
import { getNameForIndex } from "#src/tools/shared/validation/name-parsing.ts";
import { type OverwritePlan } from "./helpers/arrangement/update-clip-arrangement-optimizer.ts";
import { flushDeferredDeletions } from "./helpers/arrangement/update-clip-deferred-deletion.ts";
import {
  emitArrangementWarnings,
  type MoveGroup,
} from "./helpers/arrangement/update-clip-move-groups.ts";
import { trackMoveSkips } from "./helpers/arrangement/update-clip-move-skip.ts";
import {
  planClipUpdate,
  type ClipUpdatePlan,
} from "./helpers/plan-clip-update.ts";
import {
  refuseRegionWithDuplicateLoop,
  refuseUnreadableCall,
} from "./helpers/update-clip-refusals.ts";
import {
  type ClipAudioWarpQuantizeParams,
  type ProcessSingleClipUpdateParams,
  processSingleClipUpdate,
} from "./helpers/process-single-clip-update.ts";
import { clipIdPerPath } from "#src/tools/clip/helpers/clip-path-lookup.ts";
import { validateListLengths } from "#src/tools/shared/validation/lists/list-lengths.ts";
import {
  targetCount,
  targetIds,
  targetParamLabel,
  warnBlankTarget,
} from "#src/tools/shared/validation/lists/target-lists.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";

interface UpdateClipArgs extends ClipAudioWarpQuantizeParams {
  id?: string;
  /** Hidden alias for id */
  ids?: string;
  path?: string;
  /** Hidden alias for path */
  paths?: string;
  notes?: string;
  transforms?: string;
  preTransforms?: string;
  name?: string;
  color?: string;
  timeSignature?: string;
  start?: string;
  length?: string;
  firstStart?: string;
  looping?: boolean;
  duplicateLoop?: boolean;
  arrangementStart?: string;
  arrangementLength?: string;
  toSlot?: string;
  toPath?: string;
  arrangementSplit?: string;
  split?: string;
  code?: string;
  focus?: boolean;
}

/**
 * Updates properties of existing clips
 *
 * @param args - The clip parameters
 * @param args.id - Clip ID or comma-separated list of clip IDs to update
 * @param args.ids - Hidden alias for id
 * @param args.path - Clip slot(s) of clips to update, instead of id
 * @param args.paths - Hidden alias for path
 * @param args.notes - Musical notation string
 * @param args.transforms - Transform expressions applied AFTER merge, broadcast across all the clips
 * @param args.preTransforms - Transform expressions applied to existing notes BEFORE merging new notes (works with or without notes; bare "v0" clears the clip)
 * @param args.name - Optional clip name
 * @param args.color - Optional clip color (CSS format: hex)
 * @param args.timeSignature - Time signature in format "4/4"
 * @param args.start - Bar|beat position where loop/clip region begins
 * @param args.length - Duration: <count>bar, n<fraction> note value, or <count>bar+n<fraction>. end = start + length
 * @param args.firstStart - Bar|beat position for initial playback start
 * @param args.looping - Enable looping for the clip
 * @param args.duplicateLoop - Double the clip length, copying notes and envelopes into the new half (native Clip.duplicate_loop; MIDI clips only). Refuses start/length, which set the region it doubles (ADR-0040). Composes with the rest on a defined timeline: firstStart, then preTransforms edit the source, then the double; notes, transforms, and code then apply across the full doubled clip
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
 * @param args.focus - Select the clip and show clip detail view
 * @param context - Per-request context
 * @returns Single clip object or array of clip objects
 */
export async function updateClip(
  args: UpdateClipArgs = {},
  context: Partial<ToolContext> = {},
): Promise<ClipResult | ClipResult[]> {
  const { id, ids, path, paths, name, color, toPath, toSlot } = args;
  const { arrangementStart, arrangementLength, arrangementSplit, split } = args;
  // Set once per request by the V8 adapter, so a nested call (duplicate ->
  // updateClip) spends the caller's remaining budget instead of restarting it.
  const deadline = context.deadline ?? null;

  // Refuses a call whose lists disagree, or that names no clip at all, before
  // resolving anything.
  const requestedIds = resolveClipTargets(
    { id, ids, path, paths },
    { name, color, arrangementStart, arrangementLength, toPath, toSlot },
  );

  refuseUnreadableCall(
    args.timeSignature,
    args.quantizePitch,
    toPath,
    arrangementStart,
    requestedIds.length,
  );
  refuseRegionWithDuplicateLoop(args.start, args.length, args.duplicateLoop);

  const plan = planClipUpdate({
    requestedIds,
    toPath,
    toSlot,
    arrangementStart,
    arrangementLength,
    arrangementSplit,
    split,
    context,
  });

  // Said here, not where the args are read: it claims what the call did, so a
  // call refused above — or one whose paths found no clip — must not carry it.
  warnBlankTarget({ id, ids, path, paths }, "clips", plan.clips.length);

  const movedClipGroups = new Map<string, MoveGroup>();
  const updated = await runClipBatch({
    args,
    plan,
    context,
    deadline,
    movedClipGroups,
  });

  return finishUpdate(movedClipGroups, plan.overwrites, updated, args.focus);
}

interface RunClipBatchArgs {
  args: UpdateClipArgs;
  plan: ClipUpdatePlan;
  context: Partial<ToolContext>;
  deadline: number | null;
  movedClipGroups: Map<string, MoveGroup>;
}

/**
 * Update the clips one at a time, in the plan's order, and hand the results
 * back in the order the caller named them.
 * @param batch - The call's args, the plan, and the per-call collectors
 * @param batch.args - The tool arguments as received
 * @param batch.plan - What the call does to which clips
 * @param batch.context - Per-request context
 * @param batch.deadline - The request deadline
 * @param batch.movedClipGroups - Tally of clips landing on each lane and position
 * @returns One entry per clip written, in call order
 */
async function runClipBatch({
  args,
  plan,
  context,
  deadline,
  movedClipGroups,
}: RunClipBatchArgs): Promise<ClipResult[]> {
  const { clips, moveOrder, destinationById } = plan;
  const { name, color } = args;
  const { parsedNames, parsedColors } = pairLabels({
    noun: "clip",
    count: clips.length,
    name,
    color,
  });
  const updatedClips: ClipResult[] = [];
  // The clips can be processed out of call order, so each one's results are
  // kept at its own place and the response is put back together at the end.
  const resultsPerClip: ClipResult[][] = clips.map(() => []);
  // The tracks the moves resolve, so a batch moving into one track resolves it
  // once; what makes reusing one safe is spelled out at destinationTrack() in
  // the slot-move helpers. Lives and dies with this call.
  const destinationTracks = new Map<number, LiveAPI>();
  // The order above assumes every move lands. This watches what actually
  // happened and calls off the moves that were counting on one that didn't.
  const skips = trackMoveSkips({
    clips,
    dependencies: plan.dependencies,
    vacates: plan.vacates,
    refuseMove: plan.refuseMove,
  });

  for (const [step, i] of moveOrder.entries()) {
    const clip = clips[i] as LiveAPI;

    if (stopBatch(deadline, clips, moveOrder, step)) {
      break;
    }

    const written = updatedClips.length;

    await processClipUpdateStep({
      clip,
      clipIndex: i,
      clipCount: clips.length,
      notationString: args.notes,
      transformString: args.transforms,
      preTransformString: args.preTransforms,
      name: getNameForIndex(name, i, parsedNames),
      color: getColorForIndex(color, i, parsedColors),
      timeSignature: args.timeSignature,
      start: args.start,
      length: args.length,
      firstStart: args.firstStart,
      looping: args.looping,
      duplicateLoop: args.duplicateLoop,
      gainDb: args.gainDb,
      pitchShift: args.pitchShift,
      warpMode: args.warpMode,
      warping: args.warping,
      warpOp: args.warpOp,
      warpBeatTime: args.warpBeatTime,
      warpSampleTime: args.warpSampleTime,
      warpDistance: args.warpDistance,
      quantize: args.quantize,
      quantizeGrid: args.quantizeGrid,
      quantizePitch: args.quantizePitch,
      arrangementLengthBeats: plan.lengthBeatsFor(clip),
      arrangementStartBeats: plan.startBeatsFor(clip),
      destination: destinationById.get(clip.id) ?? null,
      destinationParam: plan.destinationParam,
      nonSurvivorClipIds: plan.overwrites?.nonSurvivorIds,
      destinationTracks,
      context,
      updatedClips,
      movedClipGroups,
      code: args.code,
    });

    resultsPerClip[i] = updatedClips.slice(written);
    skips.settle(i, resultsPerClip[i]);
  }

  return resultsPerClip.flat();
}

/**
 * Whether the batch should stop here, naming the clips it didn't reach.
 *
 * Without them the caller knows the batch was cut short but not where the gap
 * is. Named in call order, not the order the loop would have reached them in.
 * @param deadline - The request deadline
 * @param clips - Every clip in the batch
 * @param order - Positions in `clips`, in processing order
 * @param step - How far the loop got
 * @returns true when time is up
 */
function stopBatch(
  deadline: number | null,
  clips: LiveAPI[],
  order: number[],
  step: number,
): boolean {
  if (!isDeadlineExceeded(deadline)) {
    return false;
  }

  const skipped = order
    .slice(step)
    .toSorted((a, b) => a - b)
    .map((index) => targetLabel(clips[index] as LiveAPI));

  console.warn(
    `Ran out of time after updating ${step} of ${clips.length} clips. ` +
      `Not updated: ${skipped.join(", ")}. Re-run for those clips.`,
  );

  return true;
}

/**
 * Refuse a call whose lists disagree or that names no clip, then resolve the
 * clips it names.
 *
 * Every list is checked together, before any of them is split: once one is
 * split nothing knows whether the others are lists at all. `id` and `path` name
 * different clips and add up, so the target count is their sum — comparing the
 * two to each other would refuse a call naming two of each.
 * @param targets - The call's id/ids and path/paths params
 * @param values - The lists paired against the clips those params name
 * @returns The clip ids the call names, null where a path held no clip
 */
function resolveClipTargets(
  targets: Pick<UpdateClipArgs, "id" | "ids" | "path" | "paths">,
  values: Pick<
    UpdateClipArgs,
    | "name"
    | "color"
    | "arrangementStart"
    | "arrangementLength"
    | "toPath"
    | "toSlot"
  >,
): Array<string | null> {
  validateListLengths([
    { param: targetParamLabel(targets), count: targetCount(targets) },
    { param: "name", value: values.name },
    { param: "color", value: values.color },
    { param: "arrangementStart", value: values.arrangementStart },
    { param: "arrangementLength", value: values.arrangementLength },
    {
      param: values.toPath != null ? "toPath" : "toSlot",
      value: values.toPath ?? values.toSlot,
      isPath: true,
    },
  ]);

  const requestedIds = targetIds(targets, clipIdPerPath);

  if (requestedIds.length === 0) {
    throw new Error("id or path is required");
  }

  return requestedIds;
}

/**
 * Select the last updated clip and show the clip detail view, when focus is set.
 * @param updatedClips - The clips updated this call
 * @param focus - Whether to focus the last updated clip
 */
function focusLastUpdatedClip(
  updatedClips: ClipResult[],
  focus: boolean | undefined,
): void {
  if (focus && updatedClips.length > 0) {
    const lastClip = updatedClips.at(-1) as ClipResult;

    focusSelect({ id: lastClip.id, detailView: "clip" });
  }
}

/**
 * Process one clip update + per-clip code-exec, warn-and-continue on failure.
 * @param params - Per-clip update params plus optional code to apply
 */
async function processClipUpdateStep(
  params: ProcessSingleClipUpdateParams & { code?: string },
): Promise<void> {
  const { code, clipIndex, clipCount, ...processParams } = params;
  const prevLen = params.updatedClips.length;

  try {
    processSingleClipUpdate({ ...processParams, clipIndex, clipCount });
    await applyCodeExecToNewClips(
      params.updatedClips,
      prevLen,
      clipIndex,
      clipCount,
      code,
    );
  } catch (error) {
    console.warn(
      `Failed to update clip ${targetLabel(params.clip)}: ${errorMessage(error)}`,
    );
  }
}

/**
 * Apply code exec to newly added clip results
 * @param updatedClips - Array of clip results
 * @param prevLen - Length before new clips were added
 * @param clipIndex - 0-based position in the user's id batch (for clip.index in user code)
 * @param clipCount - Total ids in the user's batch (for clip.count in user code)
 * @param code - JavaScript code to execute
 */
async function applyCodeExecToNewClips(
  updatedClips: ClipResult[],
  prevLen: number,
  clipIndex: number,
  clipCount: number,
  code?: string,
): Promise<void> {
  if (code == null) {
    return;
  }

  for (let j = prevLen; j < updatedClips.length; j++) {
    const clipResult = updatedClips[j] as ClipResult;
    const noteCount = await applyCodeToSingleClip(
      clipResult.id,
      code,
      clipIndex,
      clipCount,
    );

    if (noteCount != null) {
      clipResult.noteCount = noteCount;
    }
  }
}

/**
 * Settles the clips the moves held back, says what the batch's moves collided
 * over, focuses the last clip written, and shapes the result.
 * @param movedClipGroups - Tally of clips landing on each lane and position
 * @param overwrites - Which clips the moves were set to land on top of
 * @param updatedClips - The clips this call wrote
 * @param focus - Whether to select the last one in Live
 * @returns The single result, or the list
 */
function finishUpdate(
  movedClipGroups: Map<string, MoveGroup>,
  overwrites: OverwritePlan | null,
  updatedClips: ClipResult[],
  focus: boolean | undefined,
): ClipResult | ClipResult[] {
  // Before the warnings: a clip cleared here counts toward the group the
  // "same position" warning names.
  flushDeferredDeletions(movedClipGroups, overwrites);
  emitArrangementWarnings(movedClipGroups);
  focusLastUpdatedClip(updatedClips, focus);

  return unwrapSingleResult(updatedClips);
}
