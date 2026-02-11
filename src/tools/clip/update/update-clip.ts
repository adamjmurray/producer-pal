// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

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
import {
  prepareSplitParams,
  performSplitting,
} from "#src/tools/shared/arrangement/arrangement-splitting.ts";
import type { SplittingContext } from "#src/tools/shared/arrangement/arrangement-splitting.ts";
import {
  parseCommaSeparatedIds,
  unwrapSingleResult,
} from "#src/tools/shared/utils.ts";
import { validateIdTypes } from "#src/tools/shared/validation/id-validation.ts";
import { processSingleClipUpdate } from "./helpers/update-clip-helpers.ts";

interface UpdateClipArgs {
  ids?: string;
  notes?: string;
  transforms?: string;
  noteUpdateMode?: string;
  name?: string;
  color?: string;
  timeSignature?: string;
  start?: string;
  length?: string;
  firstStart?: string;
  looping?: boolean;
  arrangementStart?: string;
  arrangementLength?: string;
  split?: string;
  gainDb?: number;
  pitchShift?: number;
  warpMode?: string;
  warping?: boolean;
  warpOp?: string;
  warpBeatTime?: number;
  warpSampleTime?: number;
  warpDistance?: number;
  quantize?: number;
  quantizeGrid?: string;
  quantizeSwing?: number;
  quantizePitch?: string;
  code?: string;
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
 * @param args.transforms - Transform expressions (parameter: expression per line)
 * @param args.noteUpdateMode - How to handle existing notes: 'replace' or 'merge'
 * @param args.name - Optional clip name
 * @param args.color - Optional clip color (CSS format: hex)
 * @param args.timeSignature - Time signature in format "4/4"
 * @param args.start - Bar|beat position where loop/clip region begins
 * @param args.length - Duration in bar:beat format. end = start + length
 * @param args.firstStart - Bar|beat position for initial playback start
 * @param args.looping - Enable looping for the clip
 * @param args.arrangementStart - Bar|beat position to move arrangement clip
 * @param args.arrangementLength - Bar:beat duration for arrangement span
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
 * @param args.quantizeSwing - Swing amount 0-1 (default: 0)
 * @param args.quantizePitch - Limit quantization to specific pitch
 * @param args.code - JavaScript code to transform notes
 * @param context - Tool execution context with holding area settings
 * @returns Single clip object or array of clip objects
 */
export async function updateClip(
  {
    ids,
    notes: notationString,
    transforms: transformString,
    noteUpdateMode = "merge",
    name,
    color,
    timeSignature,
    start,
    length,
    firstStart,
    looping,
    arrangementStart,
    arrangementLength,
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
    quantizeSwing,
    quantizePitch,
    code,
  }: UpdateClipArgs = {},
  context: Partial<ToolContext> = {},
): Promise<ClipResult | ClipResult[]> {
  const deadline = computeLoopDeadline(context.timeoutMs);

  if (!ids) {
    throw new Error("updateClip failed: ids is required");
  }

  const clipIds = parseCommaSeparatedIds(ids);
  const clips = validateIdTypes(clipIds, "clip", "updateClip", {
    skipInvalid: true,
  });

  // Standard update path
  const warnings = new Set<string>();
  let mutableClips = clips;

  const arrangementClips = mutableClips.filter(
    (clip) => (clip.getProperty("is_arrangement_clip") as number) > 0,
  );

  const splitPoints = prepareSplitParams(split, arrangementClips, warnings);

  if (split != null && splitPoints != null && arrangementClips.length > 0) {
    performSplitting(
      arrangementClips,
      splitPoints,
      mutableClips,
      context as SplittingContext,
    );
    mutableClips = mutableClips.filter((clip) => clip.exists());
  }

  const { arrangementStartBeats, arrangementLengthBeats } =
    validateAndParseArrangementParams(arrangementStart, arrangementLength);

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

    const prevLen = updatedClips.length;

    processSingleClipUpdate({
      clip,
      clipIndex: i,
      notationString,
      transformString,
      noteUpdateMode,
      name,
      color,
      timeSignature,
      start,
      length,
      firstStart,
      looping,
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
      quantizeSwing,
      quantizePitch,
      arrangementLengthBeats,
      arrangementStartBeats,
      context,
      updatedClips,
      tracksWithMovedClips,
    });

    // Apply code to each newly added clip result
    if (code != null) {
      for (let j = prevLen; j < updatedClips.length; j++) {
        const clipResult = updatedClips[j] as ClipResult;
        const noteCount = await applyCodeToSingleClip(clipResult.id, code);

        if (noteCount != null) {
          clipResult.noteCount = noteCount;
        }
      }
    }
  }

  emitArrangementWarnings(arrangementStartBeats, tracksWithMovedClips);

  return unwrapSingleResult(updatedClips);
}
