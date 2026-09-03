// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type ClipResult } from "#src/tools/clip/helpers/clip-result-helpers.ts";
import { errorMessage } from "#src/shared/error-utils.ts";
import { noteNameToMidi } from "#src/shared/pitch.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { applyCodeToSingleClip } from "#src/tools/clip/code-exec/apply-code-to-clip.ts";
import { isDeadlineExceeded } from "#src/tools/clip/helpers/loop-deadline.ts";
import { focusSelect } from "#src/tools/session/helpers/select-focus-helpers.ts";
import {
  parseTimeSignature,
  unwrapSingleResult,
} from "#src/tools/shared/utils.ts";
import {
  getColorForIndex,
  parseColors,
} from "#src/tools/shared/validation/color-utils.ts";
import {
  getNameForIndex,
  parseNames,
} from "#src/tools/shared/validation/name-utils.ts";
import {
  emitArrangementWarnings,
  type MoveGroup,
} from "./helpers/arrangement/update-clip-move-groups.ts";
import { planClipUpdate } from "./helpers/update-clip-prep-helpers.ts";
import {
  type ClipAudioWarpQuantizeParams,
  type ProcessSingleClipUpdateParams,
  processSingleClipUpdate,
} from "./helpers/update-clip-helpers.ts";
import { clipIdPerPath } from "#src/tools/clip/helpers/clip-path-lookup.ts";
import { refuseDoubledPosition } from "#src/tools/shared/validation/helpers/clip-destination-path.ts";
import { validateListLengths } from "#src/tools/shared/validation/lists/list-lengths.ts";
import {
  targetCount,
  targetIds,
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
 * @param args.length - Duration: Nbar, n<fraction> note value, or Nbar+n<fraction>. end = start + length
 * @param args.firstStart - Bar|beat position for initial playback start
 * @param args.looping - Enable looping for the clip
 * @param args.duplicateLoop - Double the clip length, copying notes and envelopes into the new half (native Clip.duplicate_loop; MIDI clips only). Composes with edits on a defined timeline: start/length/firstStart set the loop region first (select the portion to double; duplicate_loop inserts the copy, so content past the region is pushed later, not deleted), preTransforms edit the source, then the double; notes, transforms, and code then apply across the full doubled clip
 * @param args.arrangementStart - Bar|beat position(s) to move arrangement clips to, one per id
 * @param args.arrangementLength - Duration(s) for the arrangement span, one per id: Nbar, n<fraction>, or Nbar+n<fraction>
 * @param args.toSlot - Deprecated session destination slot (trackIndex/sceneIndex); use toPath
 * @param args.toPath - Where to move the clip: a clip slot ("t2/s3"), a track's arrangement lane ("t2"), or a take lane on it ("t2/l0", "t2/l+")
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
  {
    id,
    ids,
    path,
    paths,
    notes: notationString,
    transforms,
    preTransforms,
    name,
    color,
    timeSignature,
    start,
    length,
    firstStart,
    looping,
    duplicateLoop,
    arrangementStart,
    arrangementLength,
    toSlot,
    toPath,
    arrangementSplit,
    split,
    gainDb,
    pitchShift,
    warpMode,
    warping,
    warpOp,
    warpBeatTime,
    warpSampleTime,
    warpDistance,
    quantize,
    quantizeGrid,
    quantizePitch,
    code,
    focus,
  }: UpdateClipArgs = {},
  context: Partial<ToolContext> = {},
): Promise<ClipResult | ClipResult[]> {
  // Set once per request by the V8 adapter, so a nested call (duplicate ->
  // updateClip) spends the caller's remaining budget instead of restarting it.
  const deadline = context.deadline ?? null;

  // Refuses a call whose lists disagree before resolving anything.
  const requestedIds = resolveClipTargets(
    { id, ids, path, paths },
    { name, color, arrangementStart, arrangementLength, toPath, toSlot },
  );

  if (requestedIds.length === 0) {
    throw new Error("updateClip failed: id or path is required");
  }

  validateWholeCallParams(timeSignature, quantizePitch);

  // Two spellings of one position, so there is no combined reading and nothing
  // has run yet.
  refuseDoubledPosition(toPath, arrangementStart, "updateClip", "toPath");

  const {
    clips: mutableClips,
    destinationById,
    destinationParam,
    nonSurvivorClipIds,
    startBeatsFor,
    lengthBeatsFor,
  } = planClipUpdate({
    requestedIds,
    toPath,
    toSlot,
    arrangementStart,
    arrangementLength,
    arrangementSplit,
    split,
    context,
  });

  const parsedNames = parseNames(name, mutableClips.length, "clip");
  const parsedColors = parseColors(color, mutableClips.length, "clip");

  const updatedClips: ClipResult[] = [];
  const movedClipGroups = new Map<string, MoveGroup>();

  for (let i = 0; i < mutableClips.length; i++) {
    const clip = mutableClips[i] as LiveAPI;

    if (stopBatch(deadline, mutableClips, i)) break;

    await processClipUpdateStep({
      clip,
      clipIndex: i,
      clipCount: mutableClips.length,
      notationString,
      transformString: transforms,
      preTransformString: preTransforms,
      name: getNameForIndex(name, i, parsedNames),
      color: getColorForIndex(color, i, parsedColors),
      timeSignature,
      start,
      length,
      firstStart,
      looping,
      duplicateLoop,
      gainDb,
      pitchShift,
      warpMode,
      warping,
      warpOp,
      warpBeatTime,
      warpSampleTime,
      warpDistance,
      quantize,
      quantizeGrid,
      quantizePitch,
      arrangementLengthBeats: lengthBeatsFor(clip),
      arrangementStartBeats: startBeatsFor(clip),
      destination: destinationById.get(clip.id) ?? null,
      destinationParam,
      nonSurvivorClipIds,
      context,
      updatedClips,
      movedClipGroups,
      code,
    });
  }

  emitArrangementWarnings(movedClipGroups);
  focusLastUpdatedClip(updatedClips, focus);

  return unwrapSingleResult(updatedClips);
}

/**
 * Whether the batch should stop here, naming the clips it didn't reach.
 *
 * Without them the caller knows the batch was cut short but not where the gap
 * is.
 * @param deadline - The request deadline
 * @param clips - Every clip in the batch
 * @param index - How far the loop got
 * @returns true when time is up
 */
function stopBatch(
  deadline: number | null,
  clips: LiveAPI[],
  index: number,
): boolean {
  if (!isDeadlineExceeded(deadline)) return false;

  const skipped = clips.slice(index).map(targetLabel);

  console.warn(
    `Ran out of time after updating ${index} of ${clips.length} clips. ` +
      `Not updated: ${skipped.join(", ")}. Re-run for those clips.`,
  );

  return true;
}

/**
 * Refuse a call whose lists disagree, then resolve the clips it names.
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
    { param: "id and path", count: targetCount(targets) },
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

  return targetIds(targets, "updateClip", clipIdPerPath);
}

/**
 * Refuse a whole-call param the tool can't read, before any clip is touched.
 *
 * These are one value for every clip in the call, so a per-clip skip would
 * repeat the same message down the list — and the per-clip warn-and-skip
 * wrapper would swallow a throw from inside the loop.
 * @param timeSignature - Time signature to apply, if given
 * @param quantizePitch - Pitch to limit quantization to, if given
 */
function validateWholeCallParams(
  timeSignature: string | undefined,
  quantizePitch: string | undefined,
): void {
  if (timeSignature != null) parseTimeSignature(timeSignature);

  if (quantizePitch != null && noteNameToMidi(quantizePitch) == null) {
    throw new Error(
      `updateClip failed: invalid note name "${quantizePitch}" for quantizePitch`,
    );
  }
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
  if (code == null) return;

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
