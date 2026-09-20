// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type ClipContext } from "#src/notation/transform/helpers/transform-context.ts";
import { withClipWarningLabel } from "#src/notation/transform/transform-warning-label.ts";
import { type Notation } from "#src/shared/notation.ts";
import {
  markerBeats,
  markerBeatsPerUnit,
  markerClampSeconds,
} from "#src/tools/clip/helpers/audio-clip-timing.ts";
import { type NoteUpdateResult } from "#src/tools/clip/helpers/clip-results.ts";
import { landedColor } from "#src/tools/shared/helpers/landed-color.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";
import {
  applyAudioTransforms,
  forceWarpForLooping,
  setAudioParameters,
  handleWarpMarkerOperation,
} from "../audio-updates.ts";
import {
  handleDuplicateLoop,
  handleDuplicateLoopWithEdits,
  handleNoteUpdates,
  handleQuantization,
} from "../notes/note-updates.ts";
import { buildClipPropertiesToSet } from "../clip-properties-to-set.ts";
import {
  type ClipReasons,
  ignoreClipParams,
  noteClipColor,
} from "../entries/clip-reasons.ts";
import { type MoveGroup } from "../arrangement/update-clip-move-groups.ts";
import { handlePositionOperations } from "../move/position-operations.ts";
import { type ClipPath } from "#src/tools/shared/validation/helpers/object-paths.ts";
import {
  calculateBeatPositions,
  getTimeSignature,
} from "../clip-beat-positions.ts";
import { buildClipContext, hasNoteEdits } from "../notes/note-transforms.ts";

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
  /** Destination tracks the batch has already resolved, keyed by track index. */
  destinationTracks?: Map<number, LiveAPI>;
  context: Partial<ToolContext>;
  updatedClips: ClipResult[];
  movedClipGroups: Map<string, MoveGroup>;
  /** What each clip has to say beyond its result, for the clip's own entry. */
  reasons: ClipReasons;
}

/**
 * Process a single clip update: its audio params, properties, notes, and then
 * wherever the call sends it.
 * @param params - Every value one clip's update reads, and the collectors it
 *   writes to — see {@link ProcessSingleClipUpdateParams}
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
    transformString,
    preTransformString,
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
    reasons,
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
    forceWarpForLooping(clip, reasons, looping, warping);
  } else {
    ignoreAudioParams(clip.id, reasons, params);
  }

  // Determine looping state. Read `wasLooping` here, after the audio params:
  // switching warp off forces looping off, and that counts as the before state.
  const wasLooping = (clip.getProperty("looping") as number) > 0;
  const isLooping = looping ?? wasLooping;

  if (firstStart != null && !isLooping) {
    ignoreClipParams(
      reasons,
      clip.id,
      ["firstStart"],
      "firstStart ignored: the clip is not looping",
    );
  }

  writeClipProperties(params, {
    timeSigNumerator,
    timeSigDenominator,
    isLooping,
    wasLooping,
  });

  // Context for transform variables (clip.*, bar.*). Built only when the call
  // edits notes, because building it reads the Live Set's scale and nothing
  // else uses it — a batch of renames would otherwise read the scale per clip.
  // prettier-ignore
  const clipContext = hasNoteEdits(notationString, transformString, preTransformString)
    ? buildClipContext(clip, clipIndex, clipCount, timeSigNumerator, timeSigDenominator)
    : undefined;

  if (isAudioClip) {
    handleAudioClipUpdate(clip, clipContext, params);

    // Audio clips can't hold MIDI notes. Say so on the clip's entry rather than
    // letting the note write throw (mirrors create-clip's guard), so a
    // multi-clip batch keeps going. Transforms still ran above.
    if (notationString != null) {
      ignoreClipParams(
        reasons,
        clip.id,
        ["notes"],
        "notes ignored: the clip is audio",
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
  handleQuantization(clip, reasons, {
    quantize,
    quantizeGrid,
    quantizePitch,
  });

  // Handle warp marker operations
  if (warpOp != null) {
    handleWarpMarkerOperation(
      clip,
      reasons,
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
    destinationTracks: params.destinationTracks,
    context,
    updatedClips,
    noteResult,
    reasons,
    isNonSurvivor: params.nonSurvivorClipIds?.has(clip.id) ?? false,
  });
}

/**
 * Write the clip's name, color, meter, and loop region.
 *
 * Runs BEFORE duplicateLoop (see the caller). start/length can't reach here
 * alongside it — they pick what gets doubled, so the combination is refused up
 * front (ADR-0040) — but firstStart can, and it sets the playback marker
 * without moving the region.
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
    reasons,
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
    reasons,
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
    noteClipColor(reasons, clip.id, landedColor(clip, color));
  }
}

/**
 * Resolve the clip's note update: notes/transforms/preTransforms and the loop
 * double. duplicateLoop on a MIDI clip runs its own pipeline (preTransforms edit
 * the source, Live doubles the loop, then notes/transforms apply across the full
 * doubled clip). Audio clips take the normal path, where handleDuplicateLoop
 * refuses it on the clip's own entry (no MIDI to double) and audio transforms
 * were already applied in handleAudioClipUpdate.
 * @param params - The full single-clip update params
 * @param resolved - Derived per-clip values not present on params
 * @param resolved.isAudioClip - Whether the clip is an audio clip
 * @param resolved.clipContext - Clip-level context for transform variables, undefined when the call edits no notes
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
    clipContext: ClipContext | undefined;
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
    reasons,
  } = params;

  if (duplicateLoop && !isAudioClip) {
    return handleDuplicateLoopWithEdits({
      clip,
      reasons,
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
    reasons,
    isAudioClip ? undefined : notationString,
    isAudioClip ? undefined : transformString,
    isAudioClip ? undefined : preTransformString,
    timeSigNumerator,
    timeSigDenominator,
    clipContext,
    notation,
  );

  return duplicateLoop ? handleDuplicateLoop(clip, reasons) : noteUpdateResult;
}

/**
 * Apply audio-clip-only updates: the transforms, and the reason preTransforms
 * leaves on the entry. The audio parameters ran earlier, before the region
 * write — see the call site. Audio clips have no MIDI notes, so preTransforms
 * is unconditionally ignored.
 * @param clip - The audio clip to update
 * @param clipContext - Clip-level context for transform variables, undefined when the call sends no transforms
 * @param params - The full update params (audio fields are consumed)
 */
function handleAudioClipUpdate(
  clip: LiveAPI,
  clipContext: ClipContext | undefined,
  params: ProcessSingleClipUpdateParams,
): void {
  applyAudioTransforms(clip, params.transformString, clipContext);

  if (params.preTransformString != null) {
    ignoreClipParams(
      params.reasons,
      clip.id,
      ["preTransforms"],
      "preTransforms ignored: the clip is audio",
    );
  }
}

/** The audio-only params, as one update-clip call sent them. */
type ClipAudioParams = Pick<
  ClipAudioWarpQuantizeParams,
  "gainDb" | "pitchShift" | "warpMode" | "warping"
>;

/**
 * Say on a MIDI clip's entry that the audio-only params it was sent did
 * nothing. Only the ones the call actually sent are named, and `warping` counts
 * here because a MIDI clip has no sample to warp.
 * @param clipId - The MIDI clip, by the id the call found it at
 * @param reasons - What each clip has to say beyond its result, added to
 * @param audio - The audio-only params, as the call sent them
 * @param audio.gainDb - Requested gain in decibels
 * @param audio.pitchShift - Requested pitch shift in semitones
 * @param audio.warpMode - Requested warp mode
 * @param audio.warping - Requested warp state
 */
function ignoreAudioParams(
  clipId: string,
  reasons: ClipReasons,
  { gainDb, pitchShift, warpMode, warping }: ClipAudioParams,
): void {
  const sent = [
    gainDb != null ? "gainDb" : null,
    pitchShift != null ? "pitchShift" : null,
    warpMode != null ? "warpMode" : null,
    warping != null ? "warping" : null,
  ].filter((param) => param != null);

  if (sent.length === 0) {
    return;
  }

  ignoreClipParams(
    reasons,
    clipId,
    sent,
    `${sent.join("/")} ignored: the clip is MIDI`,
  );
}
