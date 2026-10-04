// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { timeSigToAbletonBeatsPerBar } from "#src/notation/barbeat/time/barbeat-time.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { type MidiNote } from "#src/tools/clip/helpers/clip-results.ts";
import {
  type ArrangementTrack,
  takeLanesBlocker,
} from "#src/tools/shared/arrangement/helpers/take-lanes.ts";
import { clipCopyBlocker } from "#src/tools/shared/clip/copy-clip-to-slot.ts";
import { type ClipSlotPosition } from "#src/tools/shared/validation/position-parsing.ts";
import { type ClipDestinations } from "./create-clip-destinations.ts";

const AUTO_ACTIONS = new Set(["play-scene", "play-clip"]);

/**
 * Validates that the call named somewhere to put a clip
 * @param destinations - Resolved clip slots and arrangement positions
 */
export function validatePositions(destinations: ClipDestinations): void {
  if (
    destinations.clipSlots.length === 0 &&
    destinations.arrangementPositions.length === 0
  ) {
    throw new Error(
      'path is required — "t0/s1" for a clip slot, or "t0[5|1]" for the arrangement',
    );
  }
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
      "cannot specify both sampleFile and notes - audio clips cannot contain MIDI notes",
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
 * Refuses an `auto` value this tool has no action for, before anything is made.
 * @param auto - The auto param, or null
 * @throws Error when the value isn't a known action
 */
export function refuseUnknownAuto(auto: string | null): void {
  if (auto != null && auto !== "" && !AUTO_ACTIONS.has(auto)) {
    throw new Error(
      `unknown auto value "${auto}". Expected "play-scene" or "play-clip"`,
    );
  }
}

/**
 * Says why a destination's track won't take the clip planned there.
 * @param clipIsMidi - Whether the clip is MIDI
 * @param destination - The track, and the take lane if one was named
 * @param track - The destination track
 * @returns The reason, or null when the track takes the clip
 */
export function createClipBlocker(
  clipIsMidi: boolean,
  destination: ArrangementTrack,
  track: LiveAPI | undefined,
): string | null {
  const { trackIndex, takeLane } = destination;
  const laneBlocker =
    takeLane != null && track != null
      ? takeLanesBlocker(track, trackIndex)
      : null;

  return laneBlocker ?? clipCopyBlocker(clipIsMidi, trackIndex, track);
}

/**
 * Launches what the call made in the session, the way `auto` asks.
 * @param auto - Auto playback mode (play-scene or play-clip)
 * @param slots - The clip slots that got a clip, in call order, never empty
 * @throws Error when the scene to launch isn't there
 */
export function launchCreatedClips(
  auto: string,
  slots: ClipSlotPosition[],
): void {
  if (auto === "play-scene") {
    // The first slot's scene launches, for synchronization
    const { sceneIndex } = slots[0] as ClipSlotPosition;
    const scene = LiveAPI.from(livePath.scene(sceneIndex));

    if (!scene.exists()) {
      throw new Error(`play-scene failed: no scene at "s${sceneIndex}"`);
    }

    scene.call("fire");

    return;
  }

  for (const { trackIndex, sceneIndex } of slots) {
    LiveAPI.from(livePath.track(trackIndex).clipSlot(sceneIndex)).call("fire");
  }
}
