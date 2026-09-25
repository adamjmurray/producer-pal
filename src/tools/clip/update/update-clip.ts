// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type ClipResult } from "#src/tools/clip/helpers/clip-results.ts";
import { focusSelect } from "#src/tools/session/helpers/focus-select.ts";
import { unwrapSingleResult } from "#src/tools/shared/helpers/target-entries.ts";
import { type OverwritePlan } from "./helpers/arrangement/update-clip-arrangement-overwrite-plan.ts";
import { flushDeferredDeletions } from "./helpers/arrangement/update-clip-deferred-deletion.ts";
import { type MoveGroup } from "./helpers/arrangement/update-clip-move-groups.ts";
import { newClipReasons } from "./helpers/entries/clip-reasons.ts";
import {
  type ClipEntry,
  clipEntriesInCallOrder,
  type ClipTargets,
  resolveClipTargets,
} from "./helpers/entries/clip-targets.ts";
import { loneRefusal } from "#src/tools/shared/validation/lists/named-targets.ts";
import { pairLabels } from "#src/tools/shared/validation/lists/labeled-targets.ts";
import { planClipUpdate, warnBlankArgs } from "./helpers/plan-clip-update.ts";
import {
  refuseRegionWithDuplicateLoop,
  refuseUnreadableCall,
} from "./helpers/update-clip-refusals.ts";
import {
  type ClipUpdateArgs,
  runClipBatch,
} from "./helpers/batch/run-clip-batch.ts";
import { validateListLengths } from "#src/tools/shared/validation/lists/list-lengths.ts";
import {
  targetCount,
  targetParamLabel,
  warnBlankTarget,
} from "#src/tools/shared/validation/lists/target-lists.ts";

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
 * @param args.timeSignature - Time signature in format "4/4", one per clip
 * @param args.start - Bar|beat position where loop/clip region begins, one per clip
 * @param args.length - Duration: <count>bar, n<fraction> note value, or <count>bar+n<fraction> (end = start + length), one per clip
 * @param args.firstStart - Bar|beat position for initial playback start, one per clip
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
 * @returns The clip when one was named, otherwise one entry per target named
 */
export async function updateClip(
  args: ClipUpdateArgs = {},
  context: Partial<ToolContext> = {},
): Promise<ClipEntry | ClipEntry[]> {
  const { id, ids, path, paths, toPath, toSlot } = args;
  const { arrangementStart, arrangementLength, arrangementSplit, split } = args;
  // Set once per request by the V8 adapter, so a nested call (duplicate ->
  // updateClip) spends the caller's remaining budget instead of restarting it.
  const deadline = context.deadline ?? null;

  // Refuses a call whose lists disagree, or that names no clip at all, before
  // resolving anything.
  const targets = clipTargets({ id, ids, path, paths }, args);

  refuseUnreadableCall(args, targets.named.length);
  refuseRegionWithDuplicateLoop(args.start, args.length, args.duplicateLoop);

  // Paired with the targets named, not the clips found, so name[k] lands on
  // target k and every piece of a split takes its target's name. Done before
  // the plan, which may split: a bad color or a gap in the names must be
  // refused before anything is cut.
  const labels = pairLabels({
    noun: "clip",
    count: targets.named.length,
    name: args.name,
    color: args.color,
  });

  // What the clips the call did reach have to say beyond their own results.
  const reasons = newClipReasons();
  const plan = planClipUpdate({
    targets,
    toPath,
    toSlot,
    arrangementStart,
    arrangementLength,
    arrangementSplit,
    split,
    reasons,
    context,
  });

  // Said here, not where the args are read: they claim what the call did, so a
  // call refused above — or one whose paths found no clip — must not carry them.
  warnBlankTarget({ id, ids, path, paths }, "clips", plan.clips.length);
  warnBlankArgs(args);

  const movedClipGroups = new Map<string, MoveGroup>();
  const resultsPerSlot = await runClipBatch({
    args,
    plan,
    targets,
    labels,
    reasons,
    context,
    deadline,
    movedClipGroups,
  });

  return finishUpdate({
    movedClipGroups,
    overwrites: plan.overwrites,
    targets,
    resultsPerSlot,
    focus: args.focus,
  });
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
 * @param values - The tool arguments as received, for the lists paired against
 *   the clips those params name
 * @returns The targets the call names, and the clips they found
 */
function clipTargets(
  targets: Pick<ClipUpdateArgs, "id" | "ids" | "path" | "paths">,
  values: ClipUpdateArgs,
): ClipTargets {
  validateListLengths([
    { param: targetParamLabel(targets), count: targetCount(targets) },
    { param: "name", value: values.name },
    { param: "color", value: values.color },
    { param: "timeSignature", value: values.timeSignature },
    { param: "start", value: values.start },
    { param: "length", value: values.length },
    { param: "firstStart", value: values.firstStart },
    { param: "quantizePitch", value: values.quantizePitch },
    { param: "arrangementStart", value: values.arrangementStart },
    { param: "arrangementLength", value: values.arrangementLength },
    {
      param: values.toPath != null ? "toPath" : "toSlot",
      value: values.toPath ?? values.toSlot,
      isPath: true,
    },
  ]);

  const resolved = resolveClipTargets(targets);

  if (resolved.named.length === 0) {
    throw new Error("id or path is required");
  }

  return resolved;
}

/**
 * Select the last clip the call wrote and show the clip detail view, when focus
 * is set.
 * @param entries - The call's result entries, in call order
 * @param focus - Whether to focus the last clip written
 */
function focusLastUpdatedClip(
  entries: ClipEntry[],
  focus: boolean | undefined,
): void {
  // A skip names a target, not a clip, so there is nothing there to select.
  const lastClip = entries.findLast((entry) => !("ok" in entry));

  if (focus && lastClip != null) {
    focusSelect({ id: (lastClip as ClipResult).id, detailView: "clip" });
  }
}

interface FinishUpdateArgs {
  movedClipGroups: Map<string, MoveGroup>;
  /** Which clips the moves were set to land on top of. */
  overwrites: OverwritePlan | null;
  targets: ClipTargets;
  resultsPerSlot: Map<number, ClipResult[]>;
  focus: boolean | undefined;
}

/**
 * Settles the clips the moves held back, says what the batch's moves collided
 * over, focuses the last clip written, and shapes the result.
 * @param finish - The call's collectors and what it wrote
 * @param finish.movedClipGroups - Tally of clips landing on each lane and position
 * @param finish.overwrites - Which clips the moves were set to land on top of
 * @param finish.targets - The targets the call named
 * @param finish.resultsPerSlot - Each target's results, by its place in the call
 * @param finish.focus - Whether to select the last one in Live
 * @returns The single result, or one entry per target named
 * @throws Error when the call named one target and it got nothing done
 */
function finishUpdate({
  movedClipGroups,
  overwrites,
  targets,
  resultsPerSlot,
  focus,
}: FinishUpdateArgs): ClipEntry | ClipEntry[] {
  flushDeferredDeletions(movedClipGroups, overwrites);

  const entries = clipEntriesInCallOrder(
    targets.named,
    targets.unused,
    resultsPerSlot,
  );
  // A lone target that got nothing done has no list for an entry to hold a
  // place in, so its reason goes back as the error it would have been.
  const refusal = loneRefusal(entries);

  if (refusal != null) {
    throw new Error(refusal);
  }

  focusLastUpdatedClip(entries, focus);

  return unwrapSingleResult(entries);
}
