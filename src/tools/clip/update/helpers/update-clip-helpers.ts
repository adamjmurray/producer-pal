// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type ClipContext } from "#src/notation/transform/helpers/transform-evaluator-helpers.ts";
import * as console from "#src/shared/v8-max-console.ts";
import { type NoteUpdateResult } from "#src/tools/clip/helpers/clip-result-helpers.ts";
import { verifyColorQuantization } from "#src/tools/shared/color-verification-helpers.ts";
import {
  applyAudioTransforms,
  setAudioParameters,
  handleWarpMarkerOperation,
} from "./update-clip-audio-helpers.ts";
import {
  handleDuplicateLoop,
  handleDuplicateLoopWithEdits,
  handleNoteUpdates,
  handleQuantization,
} from "./update-clip-notes-helpers.ts";
import { buildClipPropertiesToSet } from "./update-clip-properties-helpers.ts";
import { handlePositionOperations } from "./update-clip-session-helpers.ts";
import {
  calculateBeatPositions,
  getTimeSignature,
} from "./update-clip-timing-helpers.ts";
import { buildClipContext } from "./update-clip-transform-helpers.ts";

interface ClipResult {
  id: string;
  noteCount?: number;
  transformed?: number;
}

export interface ClipAudioWarpQuantizeParams {
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
  quantizePitch?: string;
}

export interface ProcessSingleClipUpdateParams extends ClipAudioWarpQuantizeParams {
  clip: LiveAPI;
  clipIndex: number;
  clipCount: number;
  notationString?: string;
  transformString?: string;
  preTransformString?: string;
  name?: string;
  color?: string;
  timeSignature?: string;
  start?: string;
  length?: string;
  firstStart?: string;
  looping?: boolean;
  duplicateLoop?: boolean;
  arrangementLengthBeats?: number | null;
  arrangementStartBeats?: number | null;
  toSlot?: { trackIndex: number; sceneIndex: number } | null;
  nonSurvivorClipIds?: Set<string> | null;
  context: Partial<ToolContext>;
  updatedClips: ClipResult[];
  tracksWithMovedClips: Map<number, number>;
}

/**
 * Process a single clip update
 * @param params - Parameters object containing all update parameters
 * @param params.clip - The clip to update
 * @param params.notationString - Musical notation string
 * @param params.transformString - Transform expressions to apply after merge
 * @param params.preTransformString - Transform expressions to apply to existing notes before merge
 * @param params.name - Clip name
 * @param params.color - Clip color
 * @param params.timeSignature - Time signature
 * @param params.start - Start position
 * @param params.length - Clip length
 * @param params.firstStart - First start position
 * @param params.looping - Looping enabled
 * @param params.duplicateLoop - Double the loop via native Clip.duplicate_loop
 * @param params.gainDb - Gain in decibels
 * @param params.pitchShift - Pitch shift amount
 * @param params.warpMode - Warp mode
 * @param params.warping - Warping enabled
 * @param params.warpOp - Warp operation type
 * @param params.warpBeatTime - Warp beat time
 * @param params.warpSampleTime - Warp sample time
 * @param params.warpDistance - Warp distance
 * @param params.quantize - Quantization strength 0-1
 * @param params.quantizeGrid - Note grid for quantization
 * @param params.quantizePitch - Limit quantization to specific pitch
 * @param params.arrangementLengthBeats - Arrangement length in beats
 * @param params.arrangementStartBeats - Arrangement start in beats
 * @param params.context - Context object
 * @param params.updatedClips - Array to collect updated clips
 * @param params.tracksWithMovedClips - Map of tracks with moved clips
 */
export function processSingleClipUpdate(
  params: ProcessSingleClipUpdateParams,
): void {
  const {
    clip,
    clipIndex,
    clipCount,
    notationString,
    name,
    color,
    timeSignature,
    start,
    length,
    firstStart,
    looping,
    duplicateLoop,
    warpOp,
    warpBeatTime,
    warpSampleTime,
    warpDistance,
    quantize,
    quantizeGrid,
    quantizePitch,
    context,
    updatedClips,
    tracksWithMovedClips,
  } = params;

  const { timeSigNumerator, timeSigDenominator } = getTimeSignature(
    timeSignature,
    clip,
  );

  // Determine looping state
  const isLooping = looping ?? (clip.getProperty("looping") as number) > 0;

  // Handle firstStart warning for non-looping clips
  if (firstStart != null && !isLooping) {
    console.warn("firstStart parameter ignored for non-looping clips");
  }

  const isAudioClip = (clip.getProperty("is_audio_clip") as number) > 0;

  // duplicateLoop sets the clip length itself (Live doubles the loop), so an
  // explicit length is contradictory - but only on a MIDI clip, where the
  // loop-double actually runs. On an audio clip duplicateLoop warns-and-skips,
  // so length still applies normally. Resolving this per-clip (not batch-wide)
  // keeps length for the audio clips in a mixed MIDI/audio batch.
  let effectiveLength = length;

  if (duplicateLoop && !isAudioClip && length != null) {
    console.warn(
      "duplicateLoop sets the clip length itself - ignoring the length parameter. preTransforms apply before the loop-double; notes, transforms, and code apply across the full doubled clip.",
    );
    effectiveLength = undefined;
  }

  // Calculate beat positions (includes end_marker bounds check for start_marker)
  const { startBeats, endBeats, startMarkerBeats } = calculateBeatPositions({
    start,
    length: effectiveLength,
    firstStart,
    timeSigNumerator,
    timeSigDenominator,
    clip,
    isLooping,
  });

  // Build and set clip properties
  const currentLoopEnd = isLooping
    ? (clip.getProperty("loop_end") as number)
    : null;
  const propsToSet = buildClipPropertiesToSet({
    name,
    color,
    timeSignature,
    timeSigNumerator,
    timeSigDenominator,
    startMarkerBeats,
    looping,
    isLooping,
    startBeats,
    endBeats,
    currentLoopEnd,
  });

  clip.setAll(propsToSet);

  // Verify color quantization if color was set
  if (color != null) {
    verifyColorQuantization(clip, color);
  }

  // Build context for transform variables (clip.*, bar.*)
  // prettier-ignore
  const clipContext = buildClipContext(clip, clipIndex, clipCount, timeSigNumerator, timeSigDenominator);

  if (isAudioClip) {
    handleAudioClipUpdate(clip, clipContext, params);

    // Audio clips can't hold MIDI notes. Warn-and-skip rather than letting the
    // note write throw (mirrors create-clip's guard) so a multi-clip batch
    // keeps going. Transforms are still applied above by handleAudioClipUpdate.
    if (notationString != null) {
      console.warn("notes parameter ignored for audio clip");
    }
  }

  const noteResult = resolveNoteResult(params, {
    isAudioClip,
    clipContext,
    timeSigNumerator,
    timeSigDenominator,
  });

  // Handle quantization (after notes so newly merged notes get quantized)
  handleQuantization(clip, {
    quantize,
    quantizeGrid,
    quantizePitch,
  });

  // Handle warp marker operations
  if (warpOp != null) {
    handleWarpMarkerOperation(
      clip,
      warpOp,
      warpBeatTime,
      warpSampleTime,
      warpDistance,
    );
  }

  // Handle position operations (session toSlot or arrangement start/length)
  handlePositionOperations({
    clip,
    isAudioClip,
    toSlot: params.toSlot,
    arrangementStartBeats: params.arrangementStartBeats,
    arrangementLengthBeats: params.arrangementLengthBeats,
    tracksWithMovedClips,
    context,
    updatedClips,
    noteResult,
    isNonSurvivor: params.nonSurvivorClipIds?.has(clip.id) ?? false,
  });
}

/**
 * Resolve the clip's note update: notes/transforms/preTransforms and the loop
 * double. duplicateLoop on a MIDI clip runs its own pipeline (preTransforms edit
 * the source, Live doubles the loop, then notes/transforms apply across the full
 * doubled clip). Audio clips take the normal path, where handleDuplicateLoop
 * warns-and-skips (no MIDI to double) and audio transforms were already applied
 * in handleAudioClipUpdate.
 * @param params - The full single-clip update params
 * @param resolved - Derived per-clip values not present on params
 * @param resolved.isAudioClip - Whether the clip is an audio clip
 * @param resolved.clipContext - Clip-level context for transform variables
 * @param resolved.timeSigNumerator - Resolved time signature numerator
 * @param resolved.timeSigDenominator - Resolved time signature denominator
 * @returns Note update result, or null if notes were not modified
 */
function resolveNoteResult(
  params: ProcessSingleClipUpdateParams,
  {
    isAudioClip,
    clipContext,
    timeSigNumerator,
    timeSigDenominator,
  }: {
    isAudioClip: boolean;
    clipContext: ClipContext;
    timeSigNumerator: number;
    timeSigDenominator: number;
  },
): NoteUpdateResult | null {
  const {
    clip,
    clipIndex,
    clipCount,
    notationString,
    transformString,
    preTransformString,
    duplicateLoop,
  } = params;

  if (duplicateLoop && !isAudioClip) {
    return handleDuplicateLoopWithEdits({
      clip,
      notationString,
      transformString,
      preTransformString,
      timeSigNumerator,
      timeSigDenominator,
      clipIndex,
      clipCount,
    });
  }

  // Handle note updates (transforms already applied for audio clips above)
  const noteUpdateResult = handleNoteUpdates(
    clip,
    isAudioClip ? undefined : notationString,
    isAudioClip ? undefined : transformString,
    isAudioClip ? undefined : preTransformString,
    timeSigNumerator,
    timeSigDenominator,
    clipContext,
  );

  return duplicateLoop ? handleDuplicateLoop(clip) : noteUpdateResult;
}

/**
 * Apply audio-clip-only updates: params, transforms, and the preTransforms warn.
 * Audio clips have no MIDI notes, so preTransforms is unconditionally ignored.
 * @param clip - The audio clip to update
 * @param clipContext - Clip-level context for transform variables
 * @param params - The full update params (audio fields are consumed)
 */
function handleAudioClipUpdate(
  clip: LiveAPI,
  clipContext: ClipContext,
  params: ProcessSingleClipUpdateParams,
): void {
  const { gainDb, pitchShift, warpMode, warping, transformString } = params;

  setAudioParameters(clip, { gainDb, pitchShift, warpMode, warping });
  applyAudioTransforms(clip, transformString, clipContext);

  if (params.preTransformString != null) {
    console.warn("preTransforms parameter ignored for audio clips");
  }
}
