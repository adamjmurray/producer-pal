// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Running a call's clips one at a time, in the plan's order, and handing each
// target's results back under the place the caller named it at.

import { errorMessage } from "#src/shared/error-message.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { applyCodeToSingleClip } from "#src/tools/clip/code-exec/apply-code-to-clip.ts";
import { type ClipResult } from "#src/tools/clip/helpers/clip-results.ts";
import { isDeadlineExceeded } from "#src/tools/clip/helpers/loop-deadline.ts";
import { getColorForIndex } from "#src/tools/shared/validation/color-parsing.ts";
import { pairLabels } from "#src/tools/shared/validation/lists/labeled-targets.ts";
import { getNameForIndex } from "#src/tools/shared/validation/name-parsing.ts";
import { trackMoveSkips } from "../arrangement/update-clip-move-skip.ts";
import { type MoveGroup } from "../arrangement/update-clip-move-groups.ts";
import { appendReason } from "#src/tools/shared/helpers/entry-reasons.ts";
import {
  type ClipReasons,
  clipIgnoredParams,
  clipLandedNothing,
  reportClipReasons,
} from "../entries/clip-reasons.ts";
import { type ClipTargets, refuseTarget } from "../entries/clip-targets.ts";
import { type ClipUpdatePlan } from "../plan-clip-update.ts";
import {
  buriedClipEntry,
  clipAddresses,
  markBuriedClips,
} from "./buried-clips.ts";
import { clipValuesAt, parseClipValueLists } from "./clip-value-lists.ts";
import {
  type ClipAudioWarpQuantizeParams,
  type ProcessSingleClipUpdateParams,
  processSingleClipUpdate,
} from "./process-single-clip-update.ts";
import { trimmedLandings } from "./trimmed-landings.ts";

/**
 * Every param one update-clip call carries, as the tool received them.
 * warping is omitted and redeclared: it pairs per clip, so it arrives as a
 * coerced string and is read out one entry at a time.
 */
export interface ClipUpdateArgs extends Omit<
  ClipAudioWarpQuantizeParams,
  "warping"
> {
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
  /** "true" or "false"; a coerced string, so it can pair per clip */
  looping?: string;
  /** "true" or "false"; a coerced string, so it can pair per clip */
  duplicateLoop?: string;
  /** "true" or "false"; a coerced string, so it can pair per clip */
  warping?: string;
  arrangementStart?: string;
  arrangementLength?: string;
  toSlot?: string;
  toPath?: string;
  arrangementSplit?: string;
  split?: string;
  code?: string;
  focus?: boolean;
}

export interface RunClipBatchArgs {
  args: ClipUpdateArgs;
  plan: ClipUpdatePlan;
  targets: ClipTargets;
  reasons: ClipReasons;
  context: Partial<ToolContext>;
  deadline: number | null;
  movedClipGroups: Map<string, MoveGroup>;
}

/**
 * Update the clips one at a time, in the plan's order, and hand each target's
 * results back under the place the caller named it at.
 * @param batch - The call's args, the plan, and the per-call collectors
 * @param batch.args - The tool arguments as received
 * @param batch.plan - What the call does to which clips
 * @param batch.targets - The targets the call named
 * @param batch.reasons - What each clip has to say beyond its result
 * @param batch.context - Per-request context
 * @param batch.deadline - The request deadline
 * @param batch.movedClipGroups - Tally of clips landing on each lane and position
 * @returns The results each target produced, by its place in the call
 */
export async function runClipBatch({
  args,
  plan,
  targets,
  reasons,
  context,
  deadline,
  movedClipGroups,
}: RunClipBatchArgs): Promise<Map<number, ClipResult[]>> {
  const { clips, moveOrder, destinationById } = plan;
  const { name, color } = args;
  // Paired against the targets named, not the clips that resolved: name[k] has
  // to land on target k even when an earlier target found no clip, and the
  // pieces of a split all take the name of the target they were cut from.
  const { parsedNames, parsedColors } = pairLabels({
    noun: "clip",
    count: targets.named.length,
    name,
    color,
  });
  // timeSignature/start/length/firstStart and the booleans pair the same way.
  const valueLists = parseClipValueLists(args, targets.named.length);
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
    reasons,
    refusedMoves: plan.refusedMoves,
    heldBackIds: plan.overwrites?.nonSurvivorIds,
    refuseMove: plan.refuseMove,
  });
  // Both cost a Live read apiece, so neither runs for a call that can bury
  // nothing. The addresses are read before the first move: a clip cleared by
  // one of them has none left to report itself by.
  const clears = clearsSpans(clips, plan);
  const addresses = clipAddresses(clips, clears);

  for (const [step, i] of moveOrder.entries()) {
    const clip = clips[i] as LiveAPI;
    const slot = plan.slots[i] as number;

    if (stopBatch({ deadline, plan, targets, clips, order: moveOrder, step })) {
      break;
    }

    const buried = buriedClipEntry(clip, addresses);

    if (buried != null) {
      // No `skips.settle`: the clip is gone, so its span is free and whatever
      // was waiting on it can still run.
      resultsPerClip[i] = [buried];

      continue;
    }

    const written = updatedClips.length;

    const failure = await processClipUpdateStep({
      clip,
      clipIndex: i,
      clipCount: clips.length,
      notationString: args.notes,
      transformString: args.transforms,
      preTransformString: args.preTransforms,
      name: getNameForIndex(name, slot, parsedNames),
      color: getColorForIndex(color, slot, parsedColors),
      ...clipValuesAt(args, valueLists, slot),
      gainDb: args.gainDb,
      pitchShift: args.pitchShift,
      warpMode: args.warpMode,
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
      reasons,
      code: args.code,
    });

    resultsPerClip[i] = settleClipTurn({
      clip,
      results: updatedClips.slice(written),
      failure,
      reasons,
      targets,
      slot,
      askedAnythingElse: askedBeyondPosition(
        args,
        clipIgnoredParams(reasons, clip.id),
      ),
    });

    skips.settle(i, resultsPerClip[i]);
  }

  markBuriedClips({
    results: resultsPerClip.flat(),
    clearsSpans: clears,
    heldBack: plan.overwrites?.nonSurvivorIds,
    trims: trimmedLandings(movedClipGroups),
  });

  return groupResultsBySlot(resultsPerClip, plan.slots);
}

/**
 * Whether the call writes anywhere a clip could be sitting: a move clears its
 * whole destination span, an arrangementLength the span it tiles across.
 * @param clips - The clips to update
 * @param plan - What the call does to which clips
 * @returns True when something the call does clears a span
 */
function clearsSpans(clips: LiveAPI[], plan: ClipUpdatePlan): boolean {
  return clips.some(
    (clip) =>
      plan.destinationById.has(clip.id) ||
      plan.startBeatsFor(clip) != null ||
      plan.lengthBeatsFor(clip) != null,
  );
}

interface SettleClipTurnArgs {
  clip: LiveAPI;
  results: ClipResult[];
  /** Why the clip's update threw, or null when it ran to the end. */
  failure: string | null;
  reasons: ClipReasons;
  targets: ClipTargets;
  /** The target this clip belongs to, by its place in the call. */
  slot: number;
  /** Whether the call asked this clip for anything besides its position. */
  askedAnythingElse: boolean;
}

/**
 * Settle what one clip's turn reports: its reasons go on the entry it wrote, and
 * a turn with nothing to report hands its target a skip instead.
 *
 * A throw partway leaves whatever landed before it in place, so it is reported on
 * the entry rather than as a refusal.
 * @param turn - The clip, what it wrote, and what went wrong
 * @param turn.clip - The clip whose turn just finished
 * @param turn.results - The entries its turn wrote
 * @param turn.failure - Why its update threw, or null
 * @param turn.reasons - What each clip has to say beyond its result
 * @param turn.targets - The targets the call named
 * @param turn.slot - The target this clip belongs to
 * @param turn.askedAnythingElse - Whether the call asked for more than a position
 * @returns The entries to keep for this clip, empty when its target took a skip
 */
function settleClipTurn({
  clip,
  results,
  failure,
  reasons,
  targets,
  slot,
  askedAnythingElse,
}: SettleClipTurnArgs): ClipResult[] {
  reportClipReasons(reasons, clip.id, results);

  const entry = results[0];

  if (failure != null && entry != null) {
    appendReason(entry, `update stopped partway: ${failure}`);
  }

  if (entry == null) {
    refuseTarget(targets.unused, targets.named, slot, failure ?? "not updated");

    return [];
  }

  // Nothing the call asked of this clip happened, so where it still sits is not
  // worth an entry: the target keeps the reason as a skip instead. A moved clip
  // reports a new id — every route that moves one re-creates it — so an entry
  // that kept the id it came in with is one that stayed put.
  if (
    results.length === 1 &&
    !askedAnythingElse &&
    entry.id === clip.id &&
    clipLandedNothing(reasons, clip.id)
  ) {
    refuseTarget(
      targets.unused,
      targets.named,
      slot,
      entry.reason ?? "not updated",
    );

    return [];
  }

  return results;
}

/**
 * Params that write to the clip itself, whatever the call does with its position.
 * One of these is what makes a refused move a reason on a real entry, not a skip.
 */
const CONTENT_PARAMS = [
  "notes",
  "transforms",
  "preTransforms",
  "name",
  "color",
  "timeSignature",
  "start",
  "length",
  "firstStart",
  "looping",
  "duplicateLoop",
  "gainDb",
  "pitchShift",
  "warpMode",
  "warping",
  "warpOp",
  "warpBeatTime",
  "warpSampleTime",
  "warpDistance",
  "quantize",
  "quantizeGrid",
  "quantizePitch",
  "code",
] as const satisfies ReadonlyArray<keyof ClipUpdateArgs>;

/**
 * Whether the call asked this clip for anything besides where it sits. A param
 * the clip ignored doesn't count: it wrote nothing, so it can't be what keeps a
 * refusal out of the skip.
 * @param args - The tool arguments as received
 * @param ignored - The params that did nothing on this clip
 * @returns True when any param that writes to the clip itself was sent and used
 */
function askedBeyondPosition(
  args: ClipUpdateArgs,
  ignored: ReadonlySet<string>,
): boolean {
  return CONTENT_PARAMS.some(
    (param) => args[param] != null && !ignored.has(param),
  );
}

/**
 * Each target's results, under the place the caller named it at. A target can
 * answer with several clips: a split cuts one into pieces.
 * @param resultsPerClip - What each clip's turn wrote, in clip order
 * @param slots - The target each clip belongs to, in clip order
 * @returns The results per target
 */
function groupResultsBySlot(
  resultsPerClip: ClipResult[][],
  slots: number[],
): Map<number, ClipResult[]> {
  const perSlot = new Map<number, ClipResult[]>();

  for (const [index, results] of resultsPerClip.entries()) {
    const slot = slots[index] as number;

    perSlot.set(slot, [...(perSlot.get(slot) ?? []), ...results]);
  }

  return perSlot;
}

interface StopBatchArgs {
  deadline: number | null;
  plan: ClipUpdatePlan;
  targets: ClipTargets;
  clips: LiveAPI[];
  /** Positions in `clips`, in processing order. */
  order: number[];
  /** How far the loop got. */
  step: number;
}

/**
 * Whether the batch should stop here, refusing the clips it didn't reach. Each
 * one says so in its own entry, so the warning only reports how far the call got.
 * @param batch - The deadline, the plan, and how far the loop got
 * @param batch.deadline - The request deadline
 * @param batch.plan - What the call does to which clips
 * @param batch.targets - The targets the call named
 * @param batch.clips - Every clip in the batch
 * @param batch.order - Positions in `clips`, in processing order
 * @param batch.step - How far the loop got
 * @returns true when time is up
 */
function stopBatch({
  deadline,
  plan,
  targets,
  clips,
  order,
  step,
}: StopBatchArgs): boolean {
  if (!isDeadlineExceeded(deadline)) {
    return false;
  }

  for (const index of order.slice(step)) {
    refuseTarget(
      targets.unused,
      targets.named,
      plan.slots[index] as number,
      "not updated: the request ran out of time; re-run for this clip",
    );
  }

  console.warn(
    `Ran out of time after updating ${step} of ${clips.length} clips. ` +
      `Re-run for the clips whose entries say so.`,
  );

  return true;
}

/**
 * Process one clip update + per-clip code-exec, keeping a failure for the
 * clip's own entry to report.
 * @param params - Per-clip update params plus optional code to apply
 * @returns Why the update threw, or null when it ran to the end
 */
async function processClipUpdateStep(
  params: ProcessSingleClipUpdateParams & { code?: string },
): Promise<string | null> {
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

    return null;
  } catch (error) {
    return errorMessage(error);
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
