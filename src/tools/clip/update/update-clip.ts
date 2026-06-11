// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { errorMessage } from "#src/shared/error-utils.ts";
import * as console from "#src/shared/v8-max-console.ts";
import { applyCodeToSingleClip } from "#src/tools/clip/code-exec/apply-code-to-clip.ts";
import {
  validateAndParseArrangementParams,
  emitArrangementWarnings,
} from "#src/tools/clip/helpers/clip-result-helpers.ts";
import {
  computeLoopDeadline,
  isDeadlineExceeded,
} from "#src/tools/clip/helpers/loop-deadline.ts";
import { select } from "#src/tools/session/select.ts";
import {
  prepareSplitParams,
  performSplitting,
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
import { validateIdTypes } from "#src/tools/shared/validation/id-validation.ts";
import {
  getNameForIndex,
  parseNames,
} from "#src/tools/shared/validation/name-utils.ts";
import { parseSlotList } from "#src/tools/shared/validation/position-parsing.ts";
import { computeNonSurvivorClipIds } from "./helpers/update-clip-arrangement-optimizer.ts";
import {
  type ClipAudioWarpQuantizeParams,
  type ProcessSingleClipUpdateParams,
  processSingleClipUpdate,
} from "./helpers/update-clip-helpers.ts";

interface UpdateClipArgs extends ClipAudioWarpQuantizeParams {
  ids?: string;
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
 * @param args.duplicateLoop - Double the clip length, copying notes and envelopes into the new half (native Clip.duplicate_loop; MIDI clips only; mutually exclusive with length/notes/transforms/preTransforms)
 * @param args.arrangementStart - Bar|beat position to move arrangement clip
 * @param args.arrangementLength - Duration for arrangement span: Nbar, n<fraction>, or Nbar+n<fraction>
 * @param args.toSlot - Session clip destination slot (trackIndex/sceneIndex)
 * @param args.split - Comma-separated bar|beat positions to split clip
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
  const deadline = computeLoopDeadline(context.timeoutMs);

  if (!ids) {
    console.warn("updateClip: ids is required");

    return [];
  }

  validateDuplicateLoopExclusivity({
    duplicateLoop,
    length,
    notationString,
    transforms,
    preTransforms,
  });

  const mutableClips = applySplittingIfNeeded(
    validateIdTypes(parseCommaSeparatedIds(ids), "clip", "updateClip", {
      skipInvalid: true,
    }),
    split,
    context,
  );

  const { arrangementStartBeats, arrangementLengthBeats } =
    validateAndParseArrangementParams(arrangementStart, arrangementLength);

  // Validate timeSignature up front so format errors throw to the caller
  // instead of being swallowed by the per-clip warn-and-skip wrapper.
  if (timeSignature != null) parseTimeSignature(timeSignature);

  const parsedToSlot = parseToSlotParam(toSlot);
  // prettier-ignore
  const nonSurvivorClipIds = computeNonSurvivorClipIds(mutableClips, arrangementStartBeats, arrangementLengthBeats);

  const parsedNames = parseNames(name, mutableClips.length, "updateClip");
  const parsedColors = parseCommaSeparatedColors(color, mutableClips.length);

  const updatedClips: ClipResult[] = [];
  const tracksWithMovedClips = new Map<number, number>();

  for (let i = 0; i < mutableClips.length; i++) {
    const clip = mutableClips[i] as LiveAPI;

    if (isDeadlineExceeded(deadline)) {
      console.warn(
        `Deadline exceeded after updating ${updatedClips.length} of ${mutableClips.length} clips`,
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
      toSlot: parsedToSlot,
      nonSurvivorClipIds,
      context,
      updatedClips,
      tracksWithMovedClips,
      code,
    });
  }

  emitArrangementWarnings(arrangementStartBeats, tracksWithMovedClips);

  if (focus && updatedClips.length > 0) {
    const lastClip = updatedClips.at(-1) as ClipResult;

    select({ clipId: lastClip.id, detailView: "clip" });
  }

  return unwrapSingleResult(updatedClips);
}

/**
 * Fail loud when duplicateLoop is combined with note/length edits. duplicateLoop
 * is a standalone op (Live doubles the loop and copies notes + envelopes
 * natively); combining it with edits is an ordering footgun - whether the edits
 * land before or after the double is ambiguous. Validated up front so the error
 * reaches the caller instead of being swallowed by the per-clip warn-and-skip.
 * @param args - The mutually-exclusive parameters
 * @param args.duplicateLoop - Whether the loop-double was requested
 * @param args.length - The length edit (mutually exclusive)
 * @param args.notationString - The notes edit (mutually exclusive)
 * @param args.transforms - The transforms edit (mutually exclusive)
 * @param args.preTransforms - The preTransforms edit (mutually exclusive)
 */
function validateDuplicateLoopExclusivity({
  duplicateLoop,
  length,
  notationString,
  transforms,
  preTransforms,
}: {
  duplicateLoop?: boolean;
  length?: string;
  notationString?: string;
  transforms?: string;
  preTransforms?: string;
}): void {
  if (
    duplicateLoop &&
    (length != null ||
      notationString != null ||
      transforms != null ||
      preTransforms != null)
  ) {
    throw new Error(
      "duplicateLoop cannot be combined with length, notes, transforms, or preTransforms - it is a standalone operation. Run the edit and the loop-double as separate update-clip calls.",
    );
  }
}

/**
 * Parse the toSlot parameter, validating single destination
 * @param toSlot - Raw toSlot string (trackIndex/sceneIndex format)
 * @returns Parsed slot position or null
 */
function parseToSlotParam(
  toSlot?: string,
): { trackIndex: number; sceneIndex: number } | null {
  if (toSlot == null) return null;

  const slots = parseSlotList(toSlot);

  if (slots.length === 0) return null;

  if (slots.length > 1) {
    console.warn("toSlot only supports a single destination - using first");
  }

  return slots[0] as { trackIndex: number; sceneIndex: number };
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
 * Apply splitting to arrangement clips if split parameter is provided
 * @param clips - Validated clip LiveAPI objects
 * @param split - Comma-separated split positions
 * @param context - Tool execution context
 * @returns Filtered clips (non-existent removed after splitting)
 */
function applySplittingIfNeeded(
  clips: LiveAPI[],
  split: string | undefined,
  context: Partial<ToolContext>,
): LiveAPI[] {
  const arrangementClips = clips.filter((clip) => {
    if ((clip.getProperty("is_arrangement_clip") as number) <= 0) return false;

    // performSplitting uses duplicate_clip_to_arrangement (Track-only) which
    // can't target take lanes. Warn-and-skip rather than silently misroute
    // the split onto the main lane.
    if (isTakeLaneClip(clip)) {
      console.warn(
        `split parameter ignored for take-lane clip (id ${clip.id}); split it in Live's UI`,
      );

      return false;
    }

    return true;
  });
  const splitPoints = prepareSplitParams(split, arrangementClips, new Set());

  if (split != null && splitPoints != null && arrangementClips.length > 0) {
    performSplitting(
      arrangementClips,
      splitPoints,
      clips,
      context as SplittingContext,
    );

    return clips.filter((clip) => clip.exists());
  }

  return clips;
}
