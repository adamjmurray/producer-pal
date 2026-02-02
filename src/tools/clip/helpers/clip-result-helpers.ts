import {
  barBeatDurationToAbletonBeats,
  barBeatToAbletonBeats,
} from "#src/notation/barbeat/time/barbeat-time.ts";
import * as console from "#src/shared/v8-max-console.ts";
import { MAX_AUTO_CREATED_SCENES } from "#src/tools/constants.ts";
import { parseSongTimeSignature } from "#src/tools/shared/live-set-helpers.ts";

export interface MidiNote {
  pitch: number;
  start_time: number;
  duration: number;
  velocity: number;
}

export interface ArrangementParams {
  songTimeSigNumerator: number | null;
  songTimeSigDenominator: number | null;
  arrangementStartBeats: number | null;
  arrangementLengthBeats: number | null;
}

export interface ClipResult {
  id: string;
  noteCount?: number;
}

/**
 * Validate and parse arrangement parameters
 * @param arrangementStart - Bar|beat position for arrangement clip start
 * @param arrangementLength - Bar:beat duration for arrangement span
 * @returns Parsed parameters
 */
export function validateAndParseArrangementParams(
  arrangementStart?: string,
  arrangementLength?: string,
): ArrangementParams {
  const result: ArrangementParams = {
    songTimeSigNumerator: null,
    songTimeSigDenominator: null,
    arrangementStartBeats: null,
    arrangementLengthBeats: null,
  };

  if (arrangementStart == null && arrangementLength == null) {
    return result;
  }

  const songTimeSig = parseSongTimeSignature();
  const { numerator, denominator } = songTimeSig;

  result.songTimeSigNumerator = numerator;
  result.songTimeSigDenominator = denominator;

  if (arrangementStart != null) {
    result.arrangementStartBeats = barBeatToAbletonBeats(
      arrangementStart,
      numerator,
      denominator,
    );
  }

  if (arrangementLength != null) {
    const lengthBeats = barBeatDurationToAbletonBeats(
      arrangementLength,
      numerator,
      denominator,
    );

    if (lengthBeats <= 0) {
      throw new Error("arrangementLength must be greater than 0");
    }

    result.arrangementLengthBeats = lengthBeats;
  }

  return result;
}

/**
 * Build clip result object with optional noteCount
 * @param clipId - The clip ID
 * @param noteCount - Optional final note count
 * @returns Result object with id and optionally noteCount
 */
export function buildClipResultObject(
  clipId: string,
  noteCount: number | null,
): ClipResult {
  const result: ClipResult = { id: clipId };

  if (noteCount != null) {
    result.noteCount = noteCount;
  }

  return result;
}

/**
 * Emit warnings for clips moved to same track position
 * @param arrangementStartBeats - Whether arrangement start was set
 * @param tracksWithMovedClips - Map of trackIndex to clip count
 */
export function emitArrangementWarnings(
  arrangementStartBeats: number | null,
  tracksWithMovedClips: Map<number, number>,
): void {
  if (arrangementStartBeats == null) {
    return;
  }

  for (const [trackIndex, count] of tracksWithMovedClips.entries()) {
    if (count > 1) {
      console.warn(
        `${count} clips on track ${trackIndex} moved to the same position - later clips will overwrite earlier ones`,
      );
    }
  }
}

/**
 * Prepare a session clip slot, auto-creating scenes if needed
 * @param trackIndex - Track index (0-based)
 * @param sceneIndex - Target scene index (0-based)
 * @param liveSet - LiveAPI liveSet object
 * @param maxAutoCreatedScenes - Maximum number of scenes allowed
 * @returns The clip slot ready for clip creation
 */
export function prepareSessionClipSlot(
  trackIndex: number,
  sceneIndex: number,
  liveSet: LiveAPI,
  maxAutoCreatedScenes: number,
): LiveAPI {
  if (sceneIndex >= maxAutoCreatedScenes) {
    throw new Error(
      `sceneIndex ${sceneIndex} exceeds the maximum allowed value of ${
        MAX_AUTO_CREATED_SCENES - 1
      }`,
    );
  }

  const currentSceneCount = liveSet.getChildIds("scenes").length;

  if (sceneIndex >= currentSceneCount) {
    const scenesToCreate = sceneIndex - currentSceneCount + 1;

    for (let j = 0; j < scenesToCreate; j++) {
      liveSet.call("create_scene", -1);
    }
  }

  const clipSlot = LiveAPI.from(
    `live_set tracks ${trackIndex} clip_slots ${sceneIndex}`,
  );

  if (clipSlot.getProperty("has_clip")) {
    throw new Error(
      `a clip already exists at track ${trackIndex}, clip slot ${sceneIndex}`,
    );
  }

  return clipSlot;
}
