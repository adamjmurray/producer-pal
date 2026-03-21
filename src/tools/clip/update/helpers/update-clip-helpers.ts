// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/v8-max-console.ts";
import { type NoteUpdateResult } from "#src/tools/clip/helpers/clip-result-helpers.ts";
import { verifyColorQuantization } from "#src/tools/shared/color-verification-helpers.ts";
import {
  applyAudioTransforms,
  setAudioParameters,
  handleWarpMarkerOperation,
} from "./update-clip-audio-helpers.ts";
import { handleNoteUpdates } from "./update-clip-notes-helpers.ts";
import { buildClipPropertiesToSet } from "./update-clip-properties-helpers.ts";
import { handleQuantization } from "./update-clip-quantization-helpers.ts";
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
  noteUpdateMode: string;
  name?: string;
  color?: string;
  timeSignature?: string;
  start?: string;
  length?: string;
  firstStart?: string;
  looping?: boolean;
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
 * @param params.transformString - Transform expressions to apply
 * @param params.noteUpdateMode - Note update mode (merge or replace)
 * @param params.name - Clip name
 * @param params.color - Clip color
 * @param params.timeSignature - Time signature
 * @param params.start - Start position
 * @param params.length - Clip length
 * @param params.firstStart - First start position
 * @param params.looping - Looping enabled
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
    quantizePitch,
    context,
    updatedClips,
    tracksWithMovedClips,
  } = params;

  const { timeSigNumerator, timeSigDenominator } = getTimeSignature(
    timeSignature,
    clip,
  );

  let noteResult: NoteUpdateResult | null = null;

  // Determine looping state
  const isLooping = looping ?? (clip.getProperty("looping") as number) > 0;

  // Handle firstStart warning for non-looping clips
  if (firstStart != null && !isLooping) {
    console.warn("firstStart parameter ignored for non-looping clips");
  }

  // Calculate beat positions (includes end_marker bounds check for start_marker)
  const { startBeats, endBeats, startMarkerBeats } = calculateBeatPositions({
    start,
    length,
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
  const isAudioClip = (clip.getProperty("is_audio_clip") as number) > 0;
  // prettier-ignore
  const clipContext = buildClipContext(clip, clipIndex, clipCount, timeSigNumerator, timeSigDenominator);

  if (isAudioClip) {
    setAudioParameters(clip, { gainDb, pitchShift, warpMode, warping });
    applyAudioTransforms(clip, transformString, clipContext);
  }

  // Handle note updates (transforms already applied for audio clips above)
  noteResult = handleNoteUpdates(
    clip,
    notationString,
    isAudioClip ? undefined : transformString,
    noteUpdateMode,
    timeSigNumerator,
    timeSigDenominator,
    clipContext,
  );

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
