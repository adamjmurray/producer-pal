// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  barBeatDurationToAbletonBeats,
  barBeatToAbletonBeats,
} from "#src/notation/barbeat/time/barbeat-time.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/v8-max-console.ts";
import {
  prepareSessionClipSlot,
  type MidiNote,
} from "#src/tools/clip/helpers/clip-result-helpers.ts";
import { MAX_AUTO_CREATED_SCENES } from "#src/tools/constants.ts";
import { buildIndexedName } from "#src/tools/shared/utils.ts";
import {
  parseSceneIndexList as parseSceneIndexListBase,
  parseArrangementStartList,
} from "#src/tools/shared/validation/position-parsing.ts";
import {
  createAudioArrangementClip,
  createAudioSessionClip,
} from "./create-clip-audio-helpers.ts";
import {
  buildClipProperties,
  buildClipResult,
} from "./create-clip-result-helpers.ts";

// Re-export for use by create-clip.js
export { parseArrangementStartList };

/**
 * Parses scene indices with createClip-specific error message
 * @param input - Comma-separated scene indices
 * @returns Array of scene indices
 */
export function parseSceneIndexList(input: string | null): number[] {
  try {
    return parseSceneIndexListBase(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    throw new Error(`createClip failed: ${message}`);
  }
}

/**
 * Builds a clip name based on count and iteration index
 * @param name - Base clip name
 * @param count - Total number of clips being created
 * @param i - Current iteration index (0-based)
 * @returns Generated clip name
 */
export function buildClipName(
  name: string | null,
  count: number,
  i: number,
): string | undefined {
  return buildIndexedName(name, count, i);
}

export interface TimingParameters {
  arrangementStartBeats: number | null;
  startBeats: number | null;
  firstStartBeats: number | null;
  endBeats: number | null;
}

/**
 * Converts bar|beat timing parameters to Ableton beats
 * @param arrangementStart - Arrangement start position in bar|beat format
 * @param start - Loop start position in bar|beat format
 * @param firstStart - First playback start position in bar|beat format
 * @param length - Clip length in bar|beat duration format
 * @param looping - Whether the clip is looping
 * @param timeSigNumerator - Clip time signature numerator
 * @param timeSigDenominator - Clip time signature denominator
 * @param songTimeSigNumerator - Song time signature numerator
 * @param songTimeSigDenominator - Song time signature denominator
 * @returns Converted timing parameters in beats
 */
export function convertTimingParameters(
  arrangementStart: string | null,
  start: string | null,
  firstStart: string | null,
  length: string | null,
  looping: boolean | null,
  timeSigNumerator: number,
  timeSigDenominator: number,
  songTimeSigNumerator: number,
  songTimeSigDenominator: number,
): TimingParameters {
  // Convert bar|beat timing parameters to Ableton beats
  const arrangementStartBeats =
    arrangementStart != null
      ? barBeatToAbletonBeats(
          arrangementStart,
          songTimeSigNumerator,
          songTimeSigDenominator,
        )
      : null;
  const startBeats =
    start != null
      ? barBeatToAbletonBeats(start, timeSigNumerator, timeSigDenominator)
      : null;
  const firstStartBeats =
    firstStart != null
      ? barBeatToAbletonBeats(firstStart, timeSigNumerator, timeSigDenominator)
      : null;

  // Handle firstStart warning for non-looping clips
  if (firstStart != null && looping === false) {
    console.warn("firstStart parameter ignored for non-looping clips");
  }

  // Convert length parameter to end position
  let endBeats: number | null = null;

  if (length != null) {
    const lengthBeats = barBeatDurationToAbletonBeats(
      length,
      timeSigNumerator,
      timeSigDenominator,
    );
    const startOffsetBeats = startBeats ?? 0;

    endBeats = startOffsetBeats + lengthBeats;
  }

  return { arrangementStartBeats, startBeats, firstStartBeats, endBeats };
}

interface SessionClipResult {
  clip: LiveAPI;
  sceneIndex: number;
}

/**
 * Creates a session clip in a clip slot, auto-creating scenes if needed
 * @param trackIndex - Track index (0-based)
 * @param sceneIndex - Target scene index (0-based)
 * @param clipLength - Clip length in beats
 * @param liveSet - LiveAPI live_set object
 * @param maxAutoCreatedScenes - Maximum scenes allowed
 * @returns Object with clip and sceneIndex
 */
function createSessionClip(
  trackIndex: number,
  sceneIndex: number,
  clipLength: number,
  liveSet: LiveAPI,
  maxAutoCreatedScenes: number,
): SessionClipResult {
  const clipSlot = prepareSessionClipSlot(
    trackIndex,
    sceneIndex,
    liveSet,
    maxAutoCreatedScenes,
  );

  clipSlot.call("create_clip", clipLength);

  return {
    clip: LiveAPI.from(`${clipSlot.path} clip`),
    sceneIndex,
  };
}

interface ArrangementClipResult {
  clip: LiveAPI;
  arrangementStartBeats: number | null;
}

/**
 * Creates an arrangement clip on a track
 * @param trackIndex - Track index (0-based)
 * @param arrangementStartBeats - Starting position in beats
 * @param clipLength - Clip length in beats
 * @returns Object with clip and arrangementStartBeats
 */
function createArrangementClip(
  trackIndex: number,
  arrangementStartBeats: number | null,
  clipLength: number,
): ArrangementClipResult {
  const track = LiveAPI.from(livePath.track(trackIndex));
  const newClipResult = track.call(
    "create_midi_clip",
    arrangementStartBeats,
    clipLength,
  ) as string;
  const clip = LiveAPI.from(newClipResult);

  if (!clip.exists()) {
    throw new Error("failed to create Arrangement clip");
  }

  return { clip, arrangementStartBeats };
}

/**
 * Processes one clip creation at a specific position
 * @param view - View type (session or arrangement)
 * @param trackIndex - Track index
 * @param sceneIndex - Scene index for session clips (explicit position)
 * @param arrangementStartBeats - Arrangement start in beats (explicit position)
 * @param arrangementStart - Arrangement start in bar|beat format (for result)
 * @param clipLength - Clip length in beats
 * @param liveSet - LiveAPI live_set object
 * @param startBeats - Loop start in beats
 * @param endBeats - Loop end in beats
 * @param firstStartBeats - First playback start in beats
 * @param looping - Whether the clip is looping
 * @param clipName - Clip name
 * @param color - Clip color
 * @param timeSigNumerator - Clip time signature numerator
 * @param timeSigDenominator - Clip time signature denominator
 * @param notationString - Original notation string
 * @param notes - Array of MIDI notes
 * @param length - Original length parameter
 * @param sampleFile - Audio file path (for audio clips)
 * @returns Clip result for this iteration
 */
export function processClipIteration(
  view: string,
  trackIndex: number,
  sceneIndex: number | null,
  arrangementStartBeats: number | null,
  arrangementStart: string | null,
  clipLength: number,
  liveSet: LiveAPI,
  startBeats: number | null,
  endBeats: number | null,
  firstStartBeats: number | null,
  looping: boolean | null,
  clipName: string | undefined,
  color: string | null,
  timeSigNumerator: number,
  timeSigDenominator: number,
  notationString: string | null,
  notes: MidiNote[],
  length: string | null,
  sampleFile: string | null,
): object {
  let clip: LiveAPI;
  let currentSceneIndex: number | undefined;

  if (sampleFile) {
    // Audio clip creation
    if (view === "session") {
      // sceneIndex is guaranteed to be valid for session view (validated in calling code)
      const validSceneIndex = sceneIndex as number;
      const result = createAudioSessionClip(
        trackIndex,
        validSceneIndex,
        sampleFile,
        liveSet,
        MAX_AUTO_CREATED_SCENES,
      );

      clip = result.clip;
      currentSceneIndex = result.sceneIndex;
    } else {
      // Arrangement view
      const result = createAudioArrangementClip(
        trackIndex,
        arrangementStartBeats,
        sampleFile,
      );

      clip = result.clip;
    }

    // For audio clips: only set name and color (no looping, timing, or notes)
    const propsToSet: Record<string, unknown> = {};

    if (clipName) propsToSet.name = clipName;
    if (color != null) propsToSet.color = color;

    if (Object.keys(propsToSet).length > 0) {
      clip.setAll(propsToSet);
    }
  } else {
    // MIDI clip creation
    if (view === "session") {
      // sceneIndex is guaranteed to be valid for session view (validated in calling code)
      const validSceneIndex = sceneIndex as number;
      const result = createSessionClip(
        trackIndex,
        validSceneIndex,
        clipLength,
        liveSet,
        MAX_AUTO_CREATED_SCENES,
      );

      clip = result.clip;
      currentSceneIndex = result.sceneIndex;
    } else {
      // Arrangement view
      const result = createArrangementClip(
        trackIndex,
        arrangementStartBeats,
        clipLength,
      );

      clip = result.clip;
    }

    const propsToSet = buildClipProperties(
      startBeats,
      endBeats,
      firstStartBeats,
      looping,
      clipName,
      color,
      timeSigNumerator,
      timeSigDenominator,
      clipLength,
    );

    clip.setAll(propsToSet);

    // v0 notes already filtered by applyV0Deletions in interpretNotation
    if (notes.length > 0) {
      clip.call("add_new_notes", { notes });
    }
  }

  return buildClipResult(
    clip,
    trackIndex,
    view,
    currentSceneIndex,
    arrangementStart,
    notationString,
    notes,
    length,
    timeSigNumerator,
    timeSigDenominator,
    sampleFile,
  );
}
