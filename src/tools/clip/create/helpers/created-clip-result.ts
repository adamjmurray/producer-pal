// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { abletonBeatsToDuration } from "#src/notation/barbeat/time/barbeat-time.ts";
import { audioClipTiming } from "#src/tools/clip/helpers/audio-clip-timing.ts";
import { getClipNoteCount } from "#src/tools/shared/clip/clip-notes.ts";
import { slotPath } from "#src/tools/shared/validation/helpers/object-path-helpers.ts";
import { objectPathForApi } from "#src/tools/shared/validation/object-path-for-api.ts";

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
  /** Where the clip is: "t0/s3" in the session, "t0[5|1]" or "t0/l0[5|1]" in
   * the arrangement. Pastes straight back into any path/toPath param. */
  path?: string;
  noteCount?: number;
  transformed?: number;
  length?: string;
  /** Audio clips only: whether Live is time-stretching the sample */
  warping?: boolean;
}

/**
 * Builds the result object for a created clip
 * @param clip - LiveAPI clip object
 * @param trackIndex - Track index
 * @param view - View type (session or arrangement)
 * @param sceneIndex - Scene index for session clips
 * @param notationString - Original notation string
 * @param length - Original length parameter
 * @param timeSigNumerator - Clip time signature numerator
 * @param timeSigDenominator - Clip time signature denominator
 * @param sampleFile - Audio file path (for audio clips)
 * @param transformedCount - Number of notes matched by transform selectors
 * @returns Clip result object
 */
export function buildClipResult(
  clip: LiveAPI,
  trackIndex: number,
  view: string,
  sceneIndex: number | undefined,
  notationString: string | null,
  length: string | null,
  timeSigNumerator: number,
  timeSigDenominator: number,
  sampleFile: string | null,
  transformedCount?: number,
): ClipResultObject {
  const clipResult: ClipResultObject = {
    id: clip.id,
  };

  // An arrangement path carries where the clip starts, so nothing else
  // reports it.
  clipResult.path =
    view === "session"
      ? slotPath(trackIndex, sceneIndex as number)
      : objectPathForApi(clip);

  // For MIDI clips: report the count Live actually stored (read back), not the
  // interpreted-input count. Live can drop/merge overlapping same-pitch notes
  // during add_new_notes, so input length can over-report. Mirrors update-clip.
  if (notationString != null) {
    clipResult.noteCount = getClipNoteCount(clip);

    if (transformedCount != null) {
      clipResult.transformed = transformedCount;
    }

    // Include calculated length if it wasn't provided as input parameter
    if (length == null) {
      const actualClipLength = clip.getProperty("length") as number;

      clipResult.length = abletonBeatsToDuration(
        actualClipLength,
        timeSigNumerator,
        timeSigDenominator,
      );
    }
  }

  // For audio clips: report the warp state Live settled on plus the region it
  // covers. `Clip.length` is not used — on an unwarped session clip Live
  // reports the length it would have if still warped (see audioClipTiming).
  if (sampleFile) {
    const timing = audioClipTiming(clip);

    clipResult.warping = timing.warping;
    clipResult.length = abletonBeatsToDuration(
      timing.endBeats - timing.startBeats,
      timeSigNumerator,
      timeSigDenominator,
    );
  }

  return clipResult;
}
