// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type ClipContext } from "#src/notation/transform/helpers/transform-evaluator-helpers.ts";
import { withClipWarningLabel } from "#src/notation/transform/transform-warning-label.ts";
import { type Notation } from "#src/shared/notation.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  markerBeats,
  markerBeatsPerUnit,
  markerClampSeconds,
} from "#src/tools/clip/helpers/audio-clip-timing.ts";
import { type NoteUpdateResult } from "#src/tools/clip/helpers/clip-result-helpers.ts";
import { warnIgnoredParams } from "#src/tools/clip/helpers/warn-ignored-params.ts";
import { verifyColorQuantization } from "#src/tools/shared/color-verification-helpers.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";
import {
  applyAudioTransforms,
  forceWarpForLooping,
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
import { type MoveGroup } from "./arrangement/update-clip-move-groups.ts";
import { handlePositionOperations } from "./update-clip-session-helpers.ts";
import { type ClipPath } from "#src/tools/shared/validation/helpers/object-path-helpers.ts";
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
  /** Where this clip moves, from toPath (or the deprecated toSlot). */
  destination?: ClipPath | null;
  destinationParam: "toPath" | "toSlot";
  nonSurvivorClipIds?: Set<string> | null;
  context: Partial<ToolContext>;
  updatedClips: ClipResult[];
  movedClipGroups: Map<string, MoveGroup>;
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
 * @param params.movedClipGroups - Tally of clips landing on each lane and position
 */
export function processSingleClipUpdate(
  params: ProcessSingleClipUpdateParams,
): void {
  // The transform evaluators warn per clip but have no LiveAPI to name it with,
  // so the label comes from here. Everything inside is synchronous, which is
  // what makes a scope safe to use instead of a parameter.
  withClipWarningLabel(`clip ${targetLabel(params.clip)}`, () =>
    updateOneClip(params),
  );
}

/**
 * Apply one clip's update, with transform warnings already labelled.
 * @param params - The full single-clip update params
 */
function updateOneClip(params: ProcessSingleClipUpdateParams): void {
  const {
    clip,
    clipIndex,
    clipCount,
    notationString,
    timeSignature,
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
    movedClipGroups,
  } = params;

  const { timeSigNumerator, timeSigDenominator } = getTimeSignature(
    timeSignature,
    clip,
  );

  const isAudioClip = (clip.getProperty("is_audio_clip") as number) > 0;

  if (isAudioClip) {
    // Before the region write, because `warping` changes what the region write
    // means: it picks the unit the markers are in, forces `looping` off, and
    // switching it off resets end_marker to the whole file — which would erase
    // a start/length requested in the same call.
    setAudioParameters(clip, {
      gainDb,
      pitchShift,
      warpMode,
      warping,
      looping,
    });
    forceWarpForLooping(clip, looping, warping);
  } else {
    warnIgnoredParams(
      { gainDb, pitchShift, warpMode, warping },
      `MIDI clip ${targetLabel(clip)}`,
    );
  }

  // Determine looping state. Read `wasLooping` here, after the audio params:
  // switching warp off forces looping off, and that counts as the before state.
  const wasLooping = (clip.getProperty("looping") as number) > 0;
  const isLooping = looping ?? wasLooping;

  // Handle firstStart warning for non-looping clips
  if (firstStart != null && !isLooping) {
    console.warn(
      `firstStart parameter ignored for non-looping clip ${targetLabel(clip)}`,
    );
  }

  writeClipProperties(params, {
    timeSigNumerator,
    timeSigDenominator,
    isLooping,
    wasLooping,
  });

  // Build context for transform variables (clip.*, bar.*)
  // prettier-ignore
  const clipContext = buildClipContext(clip, clipIndex, clipCount, timeSigNumerator, timeSigDenominator);

  if (isAudioClip) {
    handleAudioClipUpdate(clip, clipContext, params);

    // Audio clips can't hold MIDI notes. Warn-and-skip rather than letting the
    // note write throw (mirrors create-clip's guard) so a multi-clip batch
    // keeps going. Transforms are still applied above by handleAudioClipUpdate.
    if (notationString != null) {
      console.warn(
        `notes parameter ignored for audio clip ${targetLabel(clip)}`,
      );
    }
  }

  const noteResult = resolveNoteResult(params, {
    isAudioClip,
    clipContext,
    timeSigNumerator,
    timeSigDenominator,
    notation: context.notation,
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

  // Handle position operations (a move from toPath, or arrangement start/length)
  handlePositionOperations({
    clip,
    isAudioClip,
    destination: params.destination,
    destinationParam: params.destinationParam,
    arrangementStartBeats: params.arrangementStartBeats,
    arrangementLengthBeats: params.arrangementLengthBeats,
    movedClipGroups,
    context,
    updatedClips,
    noteResult,
    isNonSurvivor: params.nonSurvivorClipIds?.has(clip.id) ?? false,
  });
}

/**
 * Write the clip's name, color, meter, and loop region.
 *
 * Runs BEFORE duplicateLoop (see the caller), so the two compose: the region
 * selects a portion, then Live's native duplicate_loop doubles exactly that.
 *
 * @param params - The full single-clip update params
 * @param resolved - Derived per-clip values not present on params
 * @param resolved.timeSigNumerator - Resolved time signature numerator
 * @param resolved.timeSigDenominator - Resolved time signature denominator
 * @param resolved.isLooping - The clip's looping state after this update
 * @param resolved.wasLooping - The clip's looping state before this update
 */
function writeClipProperties(
  params: ProcessSingleClipUpdateParams,
  {
    timeSigNumerator,
    timeSigDenominator,
    isLooping,
    wasLooping,
  }: {
    timeSigNumerator: number;
    timeSigDenominator: number;
    isLooping: boolean;
    wasLooping: boolean;
  },
): void {
  const {
    clip,
    name,
    color,
    timeSignature,
    start,
    length,
    firstStart,
    looping,
  } = params;
  const markerScale = {
    beatsPerMarkerUnit: markerBeatsPerUnit(clip),
    markerClampSeconds: markerClampSeconds(clip),
  };

  // Includes the end_marker bounds check for start_marker
  const { startBeats, endBeats, startMarkerBeats } = calculateBeatPositions({
    start,
    length,
    firstStart,
    timeSigNumerator,
    timeSigDenominator,
    clip,
    isLooping,
    wasLooping,
    ...markerScale,
  });

  // Both ends: loop_start and start_marker are bounded by different properties,
  // and one call can write both.
  const readMarker = (property: string) =>
    markerBeats(clip, property, markerScale);

  clip.setAll(
    buildClipPropertiesToSet({
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
      currentLoopEnd: readMarker("loop_end"),
      currentEndMarker: readMarker("end_marker"),
      beatsPerMarkerUnit: markerScale.beatsPerMarkerUnit,
    }),
  );

  if (color != null) {
    verifyColorQuantization(clip, color);
  }
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
 * @param resolved.notation - Global notation setting the notes string is written in (or undefined)
 * @returns Note update result, or null if notes were not modified
 */
function resolveNoteResult(
  params: ProcessSingleClipUpdateParams,
  {
    isAudioClip,
    clipContext,
    timeSigNumerator,
    timeSigDenominator,
    notation,
  }: {
    isAudioClip: boolean;
    clipContext: ClipContext;
    timeSigNumerator: number;
    timeSigDenominator: number;
    notation: Notation | undefined;
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
      notation,
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
    notation,
  );

  return duplicateLoop ? handleDuplicateLoop(clip) : noteUpdateResult;
}

/**
 * Apply audio-clip-only updates: transforms and the preTransforms warn. The
 * audio parameters ran earlier, before the region write — see the call site.
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
  applyAudioTransforms(clip, params.transformString, clipContext);

  if (params.preTransformString != null) {
    console.warn(
      `preTransforms parameter ignored for audio clip ${targetLabel(clip)}`,
    );
  }
}
