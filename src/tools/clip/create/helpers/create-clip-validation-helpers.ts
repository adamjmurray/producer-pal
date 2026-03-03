// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { timeSigToAbletonBeatsPerBar } from "#src/notation/barbeat/time/barbeat-time.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { type MidiNote } from "#src/tools/clip/helpers/clip-result-helpers.ts";

/**
 * Infers the view from position parameters
 * @param sceneIndices - Parsed scene indices
 * @param arrangementStarts - Parsed arrangement start positions
 * @returns Inferred view: "session" or "arrangement"
 */
export function inferView(
  sceneIndices: number[],
  arrangementStarts: string[],
): "session" | "arrangement" {
  const hasScene = sceneIndices.length > 0;
  const hasArrangement = arrangementStarts.length > 0;

  if (hasScene && hasArrangement) {
    throw new Error(
      "createClip failed: cannot specify both sceneIndex and arrangementStart",
    );
  }

  if (!hasScene && !hasArrangement) {
    throw new Error(
      "createClip failed: sceneIndex or arrangementStart is required",
    );
  }

  return hasScene ? "session" : "arrangement";
}

/**
 * Validates createClip parameters
 * @param notes - MIDI notes notation string
 * @param sampleFile - Audio file path
 */
export function validateCreateClipParams(
  notes: string | null,
  sampleFile: string | null,
): void {
  // Cannot specify both sampleFile and notes
  if (sampleFile && notes) {
    throw new Error(
      "createClip failed: cannot specify both sampleFile and notes - audio clips cannot contain MIDI notes",
    );
  }
}

/**
 * Calculates the clip length based on notes and parameters
 * @param endBeats - End position in beats
 * @param notes - Array of MIDI notes
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @returns Calculated clip length in beats
 */
export function calculateClipLength(
  endBeats: number | null,
  notes: MidiNote[],
  timeSigNumerator: number,
  timeSigDenominator: number,
): number {
  if (endBeats != null) {
    // Use calculated end position
    return endBeats;
  } else if (notes.length > 0) {
    // Find the latest note start time (not end time)
    const lastNoteStartTimeAbletonBeats = Math.max(
      ...notes.map((note) => note.start_time),
    );

    // Calculate Ableton beats per bar for this time signature
    const abletonBeatsPerBar = timeSigToAbletonBeatsPerBar(
      timeSigNumerator,
      timeSigDenominator,
    );

    // Round up to the next full bar, ensuring at least 1 bar
    // Add a small epsilon to handle the case where note starts exactly at bar boundary
    return (
      Math.ceil((lastNoteStartTimeAbletonBeats + 0.0001) / abletonBeatsPerBar) *
      abletonBeatsPerBar
    );
  }

  // Empty clip, use 1 bar minimum
  return timeSigToAbletonBeatsPerBar(timeSigNumerator, timeSigDenominator);
}

/**
 * Handles automatic playback for session clips
 * @param auto - Auto playback mode (play-scene or play-clip)
 * @param view - View type
 * @param sceneIndices - Array of scene indices
 * @param trackIndex - Track index
 */
export function handleAutoPlayback(
  auto: string | null,
  view: string,
  sceneIndices: number[],
  trackIndex: number,
): void {
  if (!auto || view !== "session" || sceneIndices.length === 0) {
    return;
  }

  switch (auto) {
    case "play-scene": {
      // Launch the first scene for synchronization
      // Length checked above: sceneIndices.length > 0
      const firstSceneIndex = sceneIndices[0] as number;
      const scene = LiveAPI.from(livePath.scene(firstSceneIndex));

      if (!scene.exists()) {
        throw new Error(
          `createClip auto="play-scene" failed: scene at sceneIndex=${firstSceneIndex} does not exist`,
        );
      }

      scene.call("fire");
      break;
    }

    case "play-clip":
      // Fire individual clips at each scene index
      for (const sceneIndex of sceneIndices) {
        const clipSlot = LiveAPI.from(
          livePath.track(trackIndex).clipSlot(sceneIndex),
        );

        clipSlot.call("fire");
      }

      break;

    default:
      throw new Error(
        `createClip failed: unknown auto value "${auto}". Expected "play-scene" or "play-clip"`,
      );
  }
}
