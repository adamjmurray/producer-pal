import { formatNotation } from "#src/notation/barbeat/barbeat-format-notation.ts";
import { interpretNotation } from "#src/notation/barbeat/interpreter/barbeat-interpreter.ts";
import {
  barBeatDurationToAbletonBeats,
  barBeatToAbletonBeats,
} from "#src/notation/barbeat/time/barbeat-time.ts";
import { applyModulations } from "#src/notation/modulation/modulation-evaluator.ts";
import * as console from "#src/shared/v8-max-console.ts";
import { MAX_CLIP_BEATS } from "#src/tools/constants.ts";
import { verifyColorQuantization } from "#src/tools/shared/color-verification-helpers.ts";
import { parseTimeSignature } from "#src/tools/shared/utils.ts";
import { handleArrangementOperations } from "./update-clip-arrangement-helpers.ts";
import {
  setAudioParameters,
  handleWarpMarkerOperation,
} from "./update-clip-audio-helpers.ts";
import { handleQuantization } from "./update-clip-quantization-helpers.ts";

interface ClipResult {
  id: string;
  noteCount?: number;
}

interface BeatPositions {
  startBeats: number | null;
  endBeats: number | null;
  firstStartBeats: number | null;
  startMarkerBeats: number | null;
}

interface CalculateBeatPositionsArgs {
  start?: string;
  length?: string;
  firstStart?: string;
  timeSigNumerator: number;
  timeSigDenominator: number;
  clip: LiveAPI;
  isLooping: boolean;
}

/**
 * Calculate beat positions from bar|beat notation
 * @param args - Calculation arguments
 * @param args.start - Start position in bar|beat notation
 * @param args.length - Length in bar|beat notation
 * @param args.firstStart - First start position in bar|beat notation
 * @param args.timeSigNumerator - Time signature numerator
 * @param args.timeSigDenominator - Time signature denominator
 * @param args.clip - The clip to read defaults from
 * @param args.isLooping - Whether clip is looping
 * @returns Beat positions
 */
function calculateBeatPositions({
  start,
  length,
  firstStart,
  timeSigNumerator,
  timeSigDenominator,
  clip,
  isLooping,
}: CalculateBeatPositionsArgs): BeatPositions {
  let startBeats: number | null = null;
  let endBeats: number | null = null;
  let firstStartBeats: number | null = null;
  let startMarkerBeats: number | null = null;

  // Convert start to beats if provided
  if (start != null) {
    startBeats = barBeatToAbletonBeats(
      start,
      timeSigNumerator,
      timeSigDenominator,
    );
  }

  // Calculate end from start + length
  if (length != null) {
    const lengthBeats = barBeatDurationToAbletonBeats(
      length,
      timeSigNumerator,
      timeSigDenominator,
    );

    // If start not provided, read current value from clip
    if (startBeats == null) {
      if (isLooping) {
        startBeats = clip.getProperty("loop_start") as number;
      } else {
        // For non-looping clips, derive from end_marker - length
        const currentEndMarker = clip.getProperty("end_marker") as number;
        const currentStartMarker = clip.getProperty("start_marker") as number;

        startBeats = currentEndMarker - lengthBeats;

        // Sanity check: warn if derived start doesn't match start_marker
        if (Math.abs(startBeats - currentStartMarker) > 0.001) {
          console.error(
            `Warning: Derived start (${startBeats}) differs from current start_marker (${currentStartMarker})`,
          );
        }
      }
    }

    endBeats = startBeats + lengthBeats;
  }

  // Handle firstStart for looping clips
  if (firstStart != null && isLooping) {
    firstStartBeats = barBeatToAbletonBeats(
      firstStart,
      timeSigNumerator,
      timeSigDenominator,
    );
  }

  // Determine start_marker value (must be < end_marker content boundary)
  const endMarker = clip.getProperty("end_marker") as number;

  if (firstStartBeats != null && firstStartBeats < endMarker) {
    startMarkerBeats = firstStartBeats;
  } else if (startBeats != null && startBeats < endMarker) {
    startMarkerBeats = startBeats;
  }

  return { startBeats, endBeats, firstStartBeats, startMarkerBeats };
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
 * @param modulationString - Modulation expressions to apply to notes
 * @param noteUpdateMode - 'merge' or 'replace'
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @returns Final note count, or null if notes not modified
 */
function handleNoteUpdates(
  clip: LiveAPI,
  notationString: string | undefined,
  modulationString: string | undefined,
  noteUpdateMode: string,
  timeSigNumerator: number,
  timeSigDenominator: number,
): number | null {
  if (notationString == null) {
    return null;
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

  // Apply modulations to notes if provided
  applyModulations(
    notes,
    modulationString,
    timeSigNumerator,
    timeSigDenominator,
  );

  // Remove all notes and add new notes
  clip.call("remove_notes_extended", 0, 128, 0, MAX_CLIP_BEATS);

  if (notes.length > 0) {
    clip.call("add_new_notes", { notes });
  }

  // Query actual note count within playback region
  const lengthBeats = clip.getProperty("length") as number;
  const actualNotesResult = JSON.parse(
    clip.call("get_notes_extended", 0, 128, 0, lengthBeats) as string,
  );

  return actualNotesResult?.notes?.length ?? 0;
}

interface TimeSignature {
  timeSigNumerator: number;
  timeSigDenominator: number;
}

/**
 * Get time signature values from parameter or clip
 * @param timeSignature - Time signature string from params
 * @param clip - The clip to read defaults from
 * @returns Time signature values
 */
function getTimeSignature(
  timeSignature: string | undefined,
  clip: LiveAPI,
): TimeSignature {
  if (timeSignature != null) {
    const parsed = parseTimeSignature(timeSignature);

    return {
      timeSigNumerator: parsed.numerator,
      timeSigDenominator: parsed.denominator,
    };
  }

  return {
    timeSigNumerator: clip.getProperty("signature_numerator") as number,
    timeSigDenominator: clip.getProperty("signature_denominator") as number,
  };
}

export interface ProcessSingleClipUpdateParams {
  clip: LiveAPI;
  notationString?: string;
  modulationString?: string;
  noteUpdateMode: string;
  name?: string;
  color?: string;
  timeSignature?: string;
  start?: string;
  length?: string;
  firstStart?: string;
  looping?: boolean;
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
  quantizePitch?: number;
  arrangementLengthBeats?: number | null;
  arrangementStartBeats?: number | null;
  context: Partial<ToolContext>;
  updatedClips: ClipResult[];
  tracksWithMovedClips: Map<number, number>;
}

/**
 * Process a single clip update
 * @param params - Parameters object containing all update parameters
 * @param params.clip - The clip to update
 * @param params.notationString - Musical notation string
 * @param params.modulationString - Modulation expressions to apply
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
    notationString,
    modulationString,
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
  } = params;

  const { timeSigNumerator, timeSigDenominator } = getTimeSignature(
    timeSignature,
    clip,
  );
  let finalNoteCount: number | null = null;

  // Determine looping state
  const isLooping = looping ?? (clip.getProperty("looping") as number) > 0;

  // Handle firstStart warning for non-looping clips
  if (firstStart != null && !isLooping) {
    console.error(
      "Warning: firstStart parameter ignored for non-looping clips",
    );
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

  // Audio-specific parameters
  const isAudioClip = (clip.getProperty("is_audio_clip") as number) > 0;

  if (isAudioClip) {
    setAudioParameters(clip, { gainDb, pitchShift, warpMode, warping });
  }

  // Handle note updates
  finalNoteCount = handleNoteUpdates(
    clip,
    notationString,
    modulationString,
    noteUpdateMode,
    timeSigNumerator,
    timeSigDenominator,
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

  // Handle arrangement operations (move FIRST, then length)
  handleArrangementOperations({
    clip,
    isAudioClip,
    arrangementStartBeats,
    arrangementLengthBeats,
    tracksWithMovedClips,
    context,
    updatedClips,
    finalNoteCount,
  });
}
