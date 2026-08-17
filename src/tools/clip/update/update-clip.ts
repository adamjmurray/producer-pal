// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { errorMessage } from "#src/shared/error-utils.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { applyCodeToSingleClip } from "#src/tools/clip/code-exec/apply-code-to-clip.ts";
import {
  validateAndParseArrangementParams,
  emitArrangementWarnings,
} from "#src/tools/clip/helpers/clip-result-helpers.ts";
import { isDeadlineExceeded } from "#src/tools/clip/helpers/loop-deadline.ts";
import { select } from "#src/tools/session/select.ts";
import { prepareSplitParams } from "#src/tools/shared/arrangement/arrangement-splitting-params.ts";
import {
  ARRANGEMENT_SPLIT_MODE,
  LEGACY_SPLIT_MODE,
  performSplitting,
  type SplitMode,
  type SplittingContext,
} from "#src/tools/shared/arrangement/arrangement-splitting.ts";
import { isTakeLaneClip } from "#src/tools/shared/arrangement/take-lane-helpers.ts";
import {
  parseCommaSeparatedIds,
  parseTimeSignature,
  unwrapSingleResult,
} from "#src/tools/shared/utils.ts";
import {
  getColorForIndex,
  parseCommaSeparatedColors,
} from "#src/tools/shared/validation/color-utils.ts";
import {
  getNameForIndex,
  parseNames,
} from "#src/tools/shared/validation/name-utils.ts";
import { computeNonSurvivorClipIds } from "./helpers/update-clip-arrangement-optimizer.ts";
import {
  type ClipAudioWarpQuantizeParams,
  type ProcessSingleClipUpdateParams,
  processSingleClipUpdate,
} from "./helpers/update-clip-helpers.ts";
import { clipIdPerPath } from "#src/tools/clip/helpers/clip-path-lookup.ts";
import {
  resolveMoveDestinations,
  resolveRequestedClips,
} from "./helpers/update-clip-session-helpers.ts";

interface UpdateClipArgs extends ClipAudioWarpQuantizeParams {
  ids?: string;
  path?: string;
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

interface ClipResult {
  id: string;
  noteCount?: number;
}

/**
 * Updates properties of existing clips
 *
 * @param args - The clip parameters
 * @param args.ids - Clip ID or comma-separated list of clip IDs to update
 * @param args.path - Session position(s) of clips to update, instead of ids
 * @param args.notes - Musical notation string
 * @param args.transforms - Transform expressions applied AFTER merge, broadcast across all ids
 * @param args.preTransforms - Transform expressions applied to existing notes BEFORE merging new notes (works with or without notes; bare "v0" clears the clip)
 * @param args.name - Optional clip name
 * @param args.color - Optional clip color (CSS format: hex)
 * @param args.timeSignature - Time signature in format "4/4"
 * @param args.start - Bar|beat position where loop/clip region begins
 * @param args.length - Duration: Nbar, n<fraction> note value, or Nbar+n<fraction>. end = start + length
 * @param args.firstStart - Bar|beat position for initial playback start
 * @param args.looping - Enable looping for the clip
 * @param args.duplicateLoop - Double the clip length, copying notes and envelopes into the new half (native Clip.duplicate_loop; MIDI clips only). Composes with edits on a defined timeline: start/length/firstStart set the loop region first (select the portion to double; duplicate_loop inserts the copy, so content past the region is pushed later, not deleted), preTransforms edit the source, then the double; notes, transforms, and code then apply across the full doubled clip
 * @param args.arrangementStart - Bar|beat position to move arrangement clip
 * @param args.arrangementLength - Duration for arrangement span: Nbar, n<fraction>, or Nbar+n<fraction>
 * @param args.toSlot - Deprecated session destination slot (trackIndex/sceneIndex); use toPath
 * @param args.toPath - Session slot to move the clip to (e.g., "t2/s3")
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
 * @param args.code - JavaScript code to transform notes (broadcast across ids; use context.clip.{index,count} for per-clip variation)
 * @param args.focus - Select the clip and show clip detail view
 * @param context - Tool execution context with holding area settings
 * @returns Single clip object or array of clip objects
 */
export async function updateClip(
  {
    ids,
    path,
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

  // ids and path both name clips to update, so a call may use either or both —
  // neither contradicts the other the way two destinations would. Entries stay
  // in place, nulls included, so toPath lines up with what the caller named.
  const requestedIds = [
    ...(ids == null ? [] : parseCommaSeparatedIds(ids)),
    ...(path == null ? [] : clipIdPerPath(path, "updateClip")),
  ];

  if (requestedIds.length === 0) {
    console.warn("updateClip: ids or path is required");

    return [];
  }

  const { arrangementStartBeats, arrangementLengthBeats } =
    validateAndParseArrangementParams(arrangementStart, arrangementLength);

  // Validate timeSignature up front so format errors throw to the caller
  // instead of being swallowed by the per-clip warn-and-skip wrapper.
  if (timeSignature != null) parseTimeSignature(timeSignature);

  const { clips, destinationById } = resolveRequestedClips(
    requestedIds,
    resolveMoveDestinations(toPath, toSlot, requestedIds.length),
  );
  const mutableClips = applySplittingIfNeeded(
    clips,
    arrangementSplit,
    split,
    context,
  );
  // prettier-ignore
  const nonSurvivorClipIds = computeNonSurvivorClipIds(mutableClips, arrangementStartBeats, arrangementLengthBeats);

  const parsedNames = parseNames(name, mutableClips.length, "updateClip");
  const parsedColors = parseCommaSeparatedColors(color, mutableClips.length);

  const updatedClips: ClipResult[] = [];
  const tracksWithMovedClips = new Map<number, number>();

  for (let i = 0; i < mutableClips.length; i++) {
    const clip = mutableClips[i] as LiveAPI;

    if (isDeadlineExceeded(deadline)) {
      // Name the ones that didn't run: without them the caller knows the batch
      // was cut short but not where the gap is.
      const skipped = mutableClips.slice(i).map((c) => c.id);

      console.warn(
        `Ran out of time after updating ${i} of ${mutableClips.length} clips. ` +
          `Not updated: ${skipped.join(", ")}. Re-run for those ids.`,
      );
      break;
    }

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
      arrangementLengthBeats,
      arrangementStartBeats,
      toSlot: destinationById.get(clip.id) ?? null,
      nonSurvivorClipIds,
      context,
      updatedClips,
      tracksWithMovedClips,
      code,
    });
  }

  emitArrangementWarnings(arrangementStartBeats, tracksWithMovedClips);
  focusLastUpdatedClip(updatedClips, focus);

  return unwrapSingleResult(updatedClips);
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

    select({ clipId: lastClip.id, detailView: "clip" });
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
      `Failed to update clip ${params.clip.id}: ${errorMessage(error)}`,
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

/**
 * Apply splitting to arrangement clips if a split param is provided
 * @param clips - Validated clip LiveAPI objects
 * @param arrangementSplit - Comma-separated song-timeline split positions
 * @param split - Deprecated clip-relative split positions
 * @param context - Tool execution context
 * @returns Filtered clips (non-existent removed after splitting)
 */
function applySplittingIfNeeded(
  clips: LiveAPI[],
  arrangementSplit: string | undefined,
  split: string | undefined,
  context: Partial<ToolContext>,
): LiveAPI[] {
  const request = resolveSplitRequest(arrangementSplit, split);

  if (request == null) return clips;

  const { value, mode } = request;

  const arrangementClips = clips.filter((clip) => {
    if ((clip.getProperty("is_arrangement_clip") as number) <= 0) return false;

    // performSplitting uses duplicate_clip_to_arrangement (Track-only) which
    // can't target take lanes. Warn-and-skip rather than silently misroute
    // the split onto the main lane.
    if (isTakeLaneClip(clip)) {
      console.warn(
        `${mode.param} ignored for take-lane clip (id ${clip.id}); split it in Live's UI`,
      );

      return false;
    }

    return true;
  });
  const splitPoints = prepareSplitParams(
    value,
    arrangementClips,
    new Set(),
    mode,
  );

  if (splitPoints != null) {
    performSplitting(
      arrangementClips,
      splitPoints,
      clips,
      context as SplittingContext,
      mode,
    );

    return clips.filter((clip) => clip.exists());
  }

  return clips;
}

/**
 * Pick which split param to act on. The two read positions on different
 * timelines, so sending both is ambiguous: warn and split nothing rather than
 * guess, matching how toPath/toSlot handle a doubled destination.
 * @param arrangementSplit - Song-timeline positions
 * @param split - Deprecated clip-relative positions
 * @returns The positions and how to read them, or null to skip splitting
 */
function resolveSplitRequest(
  arrangementSplit: string | undefined,
  split: string | undefined,
): { value: string; mode: SplitMode } | null {
  if (arrangementSplit != null && split != null) {
    console.warn(
      "arrangementSplit and split both name split positions, so no clip was " +
        "split; use arrangementSplit alone (split is deprecated, and its " +
        "positions are measured from each clip's start instead of the song timeline)",
    );

    return null;
  }

  if (arrangementSplit != null) {
    return { value: arrangementSplit, mode: ARRANGEMENT_SPLIT_MODE };
  }

  if (split != null) return { value: split, mode: LEGACY_SPLIT_MODE };

  return null;
}
