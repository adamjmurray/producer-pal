// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

export interface ClipPropsToSet {
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

export interface BuildClipPropertiesArgs {
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
export function buildClipPropertiesToSet({
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
