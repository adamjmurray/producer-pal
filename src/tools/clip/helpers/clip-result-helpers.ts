// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  barBeatToAbletonBeats,
  durationToAbletonBeats,
  validateBarBeatPosition,
} from "#src/notation/barbeat/time/barbeat-time.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { slotPath } from "#src/tools/shared/validation/object-path-helpers.ts";

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

export interface NoteUpdateResult {
  noteCount: number;
  transformed?: number;
}

export interface ClipResult {
  id: string;
  noteCount?: number;
  transformed?: number;
  /** Where the clip is, as a path. Pastes back into any path/toPath param. */
  path?: string;
}

/**
 * Validate and parse arrangement parameters
 * @param arrangementStart - Bar|beat position for arrangement clip start
 * @param arrangementLength - Duration (`Nbar`, `n<fraction>`, or `Nbar+n<fraction>`) for arrangement span
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

  const liveSet = LiveAPI.from(livePath.liveSet);
  const numerator = liveSet.getProperty("signature_numerator") as number;
  const denominator = liveSet.getProperty("signature_denominator") as number;

  result.songTimeSigNumerator = numerator;
  result.songTimeSigDenominator = denominator;

  if (arrangementStart != null) {
    // Validate the standalone position first so a 0-indexed/zero-bar
    // arrangement start gets the 1-indexing steer (matching create-clip), not a
    // silent pre-origin beat.
    validateBarBeatPosition(arrangementStart);
    result.arrangementStartBeats = barBeatToAbletonBeats(
      arrangementStart,
      numerator,
      denominator,
    );
  }

  if (arrangementLength != null) {
    const lengthBeats = durationToAbletonBeats(
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
 * Build clip result object with optional note stats
 * @param clipId - The clip ID
 * @param noteResult - Optional note update result with count and transformed
 * @param slot - Optional slot position to include in result
 * @param slot.trackIndex - Track index
 * @param slot.sceneIndex - Scene index
 * @returns Result object with id and optionally noteCount/transformed
 */
export function buildClipResultObject(
  clipId: string,
  noteResult: NoteUpdateResult | null,
  slot?: { trackIndex: number; sceneIndex: number },
): ClipResult {
  const result: ClipResult = { id: clipId };

  if (noteResult != null) {
    result.noteCount = noteResult.noteCount;

    if (noteResult.transformed != null) {
      result.transformed = noteResult.transformed;
    }
  }

  if (slot != null) {
    result.path = slotPath(slot.trackIndex, slot.sceneIndex);
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
      `scene "s${sceneIndex}" is out of range: scenes auto-create only through "s${maxAutoCreatedScenes - 1}"`,
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
    livePath.track(trackIndex).clipSlot(sceneIndex),
  );

  if (clipSlot.getProperty("has_clip")) {
    throw new Error(
      `a clip already exists at ${slotPath(trackIndex, sceneIndex)}`,
    );
  }

  return clipSlot;
}
