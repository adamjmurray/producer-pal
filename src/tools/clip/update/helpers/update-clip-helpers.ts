// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { formatNotation } from "#src/notation/barbeat/barbeat-format-notation.ts";
import { interpretNotation } from "#src/notation/barbeat/interpreter/barbeat-interpreter.ts";
import { type ClipContext } from "#src/notation/transform/transform-evaluator-helpers.ts";
import { applyTransforms } from "#src/notation/transform/transform-evaluator.ts";
import * as console from "#src/shared/v8-max-console.ts";
import { type NoteUpdateResult } from "#src/tools/clip/helpers/clip-result-helpers.ts";
import { MAX_CLIP_BEATS } from "#src/tools/constants.ts";
import { getPlayableNoteCount } from "#src/tools/shared/clip-notes.ts";
import { verifyColorQuantization } from "#src/tools/shared/color-verification-helpers.ts";
import {
  applyAudioTransforms,
  setAudioParameters,
  handleWarpMarkerOperation,
} from "./update-clip-audio-helpers.ts";
import { handleQuantization } from "./update-clip-quantization-helpers.ts";
import { handlePositionOperations } from "./update-clip-session-helpers.ts";
import {
  calculateBeatPositions,
  getTimeSignature,
} from "./update-clip-timing-helpers.ts";
import {
  applyTransformsToExistingNotes,
  buildClipContext,
} from "./update-clip-transform-helpers.ts";

interface ClipResult {
  id: string;
  noteCount?: number;
  transformed?: number;
}

interface ClipPropsToSet {
  name?: string;
  color?: string;
  signature_numerator?: number | null;
  signature_denominator?: number | null;
  looping?: boolean;
  loop_start?: number;
  loop_end?: number;
  start_marker?: number;
  end_marker?: number;
  [key: string]: string | number | boolean | null | undefined;
}

/**
 * Add loop-related properties in correct order to avoid Live API errors.
 * Order: loop_end (if expanding) -> loop_start -> start_marker -> loop_end (normal)
 * @param propsToSet - Properties object to modify
 * @param setEndFirst - Whether to set loop_end before loop_start
 * @param startBeats - Start position in beats
 * @param endBeats - End position in beats
 * @param startMarkerBeats - Start marker position in beats
 * @param looping - Whether looping is enabled
 */
function addLoopProperties(
  propsToSet: ClipPropsToSet,
  setEndFirst: boolean,
  startBeats: number | null,
  endBeats: number | null,
  startMarkerBeats: number | null,
  looping?: boolean,
): void {
  // When expanding (setEndFirst), set loop_end first
  if (setEndFirst && endBeats != null && looping !== false) {
    propsToSet.loop_end = endBeats;
  }

  // Set loop_start before start_marker
  if (startBeats != null && looping !== false) {
    propsToSet.loop_start = startBeats;
  }

  // Set start_marker after loop region is established
  if (startMarkerBeats != null) {
    propsToSet.start_marker = startMarkerBeats;
  }

  // Set loop_end after loop_start in normal case
  if (!setEndFirst && endBeats != null && looping !== false) {
    propsToSet.loop_end = endBeats;
  }
}

interface BuildClipPropertiesArgs {
  name?: string;
  color?: string;
  timeSignature?: string;
  timeSigNumerator: number;
  timeSigDenominator: number;
  startMarkerBeats: number | null;
  looping?: boolean;
  isLooping: boolean;
  startBeats: number | null;
  endBeats: number | null;
  currentLoopEnd: number | null;
}

/**
 * Build properties map for setAll
 * @param args - Property building arguments
 * @param args.name - Clip name
 * @param args.color - Clip color
 * @param args.timeSignature - Time signature string
 * @param args.timeSigNumerator - Time signature numerator
 * @param args.timeSigDenominator - Time signature denominator
 * @param args.startMarkerBeats - Start marker position in beats
 * @param args.looping - Whether looping is enabled
 * @param args.isLooping - Current looping state
 * @param args.startBeats - Start position in beats
 * @param args.endBeats - End position in beats
 * @param args.currentLoopEnd - Current loop end position in beats
 * @returns Properties object ready for clip.setAll()
 */
function buildClipPropertiesToSet({
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
}: BuildClipPropertiesArgs): ClipPropsToSet {
  // Must expand loop_end BEFORE setting loop_start when new start >= old end
  // (otherwise Live rejects with "Cannot set LoopStart behind LoopEnd")
  const setEndFirst =
    isLooping &&
    startBeats != null &&
    endBeats != null &&
    currentLoopEnd != null
      ? startBeats >= currentLoopEnd
      : false;

  const propsToSet: ClipPropsToSet = {
    name: name,
    color: color,
    signature_numerator: timeSignature != null ? timeSigNumerator : null,
    signature_denominator: timeSignature != null ? timeSigDenominator : null,
    looping: looping,
  };

  // Set loop properties for looping clips (order matters!)
  if (isLooping || looping == null) {
    addLoopProperties(
      propsToSet,
      setEndFirst,
      startBeats,
      endBeats,
      startMarkerBeats,
      looping,
    );
  } else if (startMarkerBeats != null) {
    // Non-looping clip - just set start_marker
    propsToSet.start_marker = startMarkerBeats;
  }

  // Set end_marker for non-looping clips
  if ((!isLooping || looping === false) && endBeats != null) {
    propsToSet.end_marker = endBeats;
  }

  return propsToSet;
}

/**
 * Handle note updates (merge or replace)
 * @param clip - The clip to update
 * @param notationString - The notation string to apply
 * @param transformString - Transform expressions to apply to notes
 * @param noteUpdateMode - 'merge' or 'replace'
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @param clipContext - Clip-level context for transform variables
 * @returns Note update result, or null if notes not modified
 */
function handleNoteUpdates(
  clip: LiveAPI,
  notationString: string | undefined,
  transformString: string | undefined,
  noteUpdateMode: string,
  timeSigNumerator: number,
  timeSigDenominator: number,
  clipContext: ClipContext,
): NoteUpdateResult | null {
  // Only skip if BOTH are null
  if (notationString == null && transformString == null) {
    return null;
  }

  // Handle transforms-only case (no notes parameter provided)
  if (notationString == null) {
    // transformString must be defined here (we returned above if both are null)
    return applyTransformsToExistingNotes(
      clip,
      transformString as string,
      timeSigNumerator,
      timeSigDenominator,
      clipContext,
    );
  }

  let combinedNotationString = notationString;

  if (noteUpdateMode === "merge") {
    // In merge mode, prepend existing notes as bar|beat notation
    const existingNotesResult = JSON.parse(
      clip.call("get_notes_extended", 0, 128, 0, MAX_CLIP_BEATS) as string,
    );
    const existingNotes = existingNotesResult?.notes ?? [];

    if (existingNotes.length > 0) {
      const existingNotationString = formatNotation(existingNotes, {
        timeSigNumerator,
        timeSigDenominator,
      });

      combinedNotationString = `${existingNotationString} ${notationString}`;
    }
  }

  const notes = interpretNotation(combinedNotationString, {
    timeSigNumerator,
    timeSigDenominator,
  });

  // Apply transforms to notes if provided
  const transformed = applyTransforms(
    notes,
    transformString,
    timeSigNumerator,
    timeSigDenominator,
    clipContext,
  );

  // Remove all notes and add new notes
  clip.call("remove_notes_extended", 0, 128, 0, MAX_CLIP_BEATS);

  if (notes.length > 0) {
    clip.call("add_new_notes", { notes });
  }

  return { noteCount: getPlayableNoteCount(clip), transformed };
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
  quantizeSwing?: number;
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
 * @param params.quantizeSwing - Swing amount 0-1
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
    quantizeSwing,
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
    quantizeSwing,
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
