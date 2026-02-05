// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { abletonBeatsToBarBeatDuration } from "#src/notation/barbeat/time/barbeat-time.ts";
import type { MidiNote } from "#src/tools/clip/helpers/clip-result-helpers.ts";

export interface ClipPropertiesToSet {
  [key: string]: unknown; // Required for setAll() compatibility with Record<string, unknown>
  start_marker: number;
  loop_start: number;
  loop_end: number;
  end_marker: number;
  playing_position?: number;
  name?: string;
  color?: string;
  looping?: number;
  signature_numerator?: number;
  signature_denominator?: number;
}

/**
 * Builds the properties object to set on a clip
 * @param startBeats - Loop start position in beats
 * @param endBeats - Loop end position in beats
 * @param firstStartBeats - First playback start position in beats
 * @param looping - Whether the clip is looping
 * @param clipName - Clip name
 * @param color - Clip color in hex format
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @param clipLength - Default clip length in beats (used when endBeats not specified)
 * @returns Clip properties to set
 */
export function buildClipProperties(
  startBeats: number | null,
  endBeats: number | null,
  firstStartBeats: number | null,
  looping: boolean | null,
  clipName: string | undefined,
  color: string | null,
  timeSigNumerator: number,
  timeSigDenominator: number,
  clipLength: number,
): ClipPropertiesToSet {
  const propsToSet: ClipPropertiesToSet = {
    start_marker: startBeats ?? 0,
    loop_start: startBeats ?? 0,
    loop_end: 0,
    end_marker: 0,
  };

  // Set start_marker and loop_start is handled above

  // Set loop_end and end_marker
  // Use clipLength as default when endBeats not specified
  // Note: loop_end must be > loop_start (Live API constraint)
  const effectiveEnd = endBeats ?? clipLength;

  propsToSet.loop_end = effectiveEnd;
  propsToSet.end_marker = effectiveEnd;

  // Set playing_position (firstStart) only for looping clips
  if (looping && firstStartBeats != null) {
    propsToSet.playing_position = firstStartBeats;
  }

  // Optional properties
  if (clipName) {
    propsToSet.name = clipName;
  }

  if (color != null) {
    propsToSet.color = color;
  }

  if (looping != null) {
    propsToSet.looping = looping ? 1 : 0;
  }

  propsToSet.signature_numerator = timeSigNumerator;
  propsToSet.signature_denominator = timeSigDenominator;

  return propsToSet;
}

export interface ClipResultObject {
  id: string;
  trackIndex: number;
  sceneIndex?: number;
  arrangementStart?: string | null;
  noteCount?: number;
  length?: string;
}

/**
 * Builds the result object for a created clip
 * @param clip - LiveAPI clip object
 * @param trackIndex - Track index
 * @param view - View type (session or arrangement)
 * @param sceneIndex - Scene index for session clips
 * @param arrangementStart - Arrangement start in bar|beat format (explicit position)
 * @param notationString - Original notation string
 * @param notes - Array of MIDI notes
 * @param length - Original length parameter
 * @param timeSigNumerator - Clip time signature numerator
 * @param timeSigDenominator - Clip time signature denominator
 * @param sampleFile - Audio file path (for audio clips)
 * @returns Clip result object
 */
export function buildClipResult(
  clip: LiveAPI,
  trackIndex: number,
  view: string,
  sceneIndex: number | undefined,
  arrangementStart: string | null,
  notationString: string | null,
  notes: MidiNote[],
  length: string | null,
  timeSigNumerator: number,
  timeSigDenominator: number,
  sampleFile: string | null,
): ClipResultObject {
  const clipResult: ClipResultObject = {
    id: clip.id,
    trackIndex,
  };

  // Add view-specific properties
  if (view === "session") {
    clipResult.sceneIndex = sceneIndex;
  } else {
    clipResult.arrangementStart = arrangementStart;
  }

  // For MIDI clips: include noteCount if notes were provided
  if (notationString != null) {
    clipResult.noteCount = notes.length;

    // Include calculated length if it wasn't provided as input parameter
    if (length == null) {
      const actualClipLength = clip.getProperty("length") as number;

      clipResult.length = abletonBeatsToBarBeatDuration(
        actualClipLength,
        timeSigNumerator,
        timeSigDenominator,
      );
    }
  }

  // For audio clips: include actual clip length from Live API
  if (sampleFile) {
    const actualClipLength = clip.getProperty("length") as number;

    clipResult.length = abletonBeatsToBarBeatDuration(
      actualClipLength,
      timeSigNumerator,
      timeSigDenominator,
    );
  }

  return clipResult;
}
