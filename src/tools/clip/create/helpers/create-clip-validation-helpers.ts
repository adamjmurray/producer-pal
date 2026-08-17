// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { timeSigToAbletonBeatsPerBar } from "#src/notation/barbeat/time/barbeat-time.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { type MidiNote } from "#src/tools/clip/helpers/clip-result-helpers.ts";
import { warnIgnoredParams } from "#src/tools/clip/helpers/warn-ignored-params.ts";
import { type SlotPosition } from "#src/tools/shared/validation/position-parsing.ts";
import { type ClipDestinations } from "./create-clip-destination-helpers.ts";

/**
 * Validates that the call named somewhere to put a clip
 * @param destinations - Resolved session slots and arrangement positions
 */
export function validatePositions(destinations: ClipDestinations): void {
  if (
    destinations.sessionSlots.length === 0 &&
    destinations.arrangementPositions.length === 0
  ) {
    throw new Error(
      'createClip failed: path is required — "t0/s1" for a session slot, or "t0" with arrangementStart for the arrangement',
    );
  }
}

/**
 * Validates that every track the call targets exists
 * @param destinations - Resolved session slots and arrangement positions
 */
export function validateDestinationTracks(
  destinations: ClipDestinations,
): void {
  const trackIndices = [
    ...destinations.sessionSlots.map((slot) => slot.trackIndex),
    ...destinations.arrangementPositions.map((position) => position.trackIndex),
  ];

  for (const trackIndex of new Set(trackIndices)) {
    const track = LiveAPI.from(livePath.track(trackIndex));

    if (!track.exists()) {
      throw new Error(`createClip failed: track ${trackIndex} does not exist`);
    }
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
      "createClip failed: cannot specify both sampleFile and notes - audio clips cannot contain MIDI notes",
    );
  }
}

/**
 * Warn about MIDI-only parameters supplied alongside a sampleFile. An audio
 * clip's region comes from the sample, so these are ignored rather than
 * applied — say so instead of silently dropping them.
 * @param sampleFile - Audio file path, or null for a MIDI clip
 * @param params - Candidate parameters, keyed by their tool argument name
 */
export function warnMidiOnlyAudioParams(
  sampleFile: string | null,
  params: Record<string, unknown>,
): void {
  if (sampleFile == null) return;

  warnIgnoredParams(params, "audio clips - the sample defines the clip region");
}

/**
 * Warn about audio-only parameters supplied without a sampleFile.
 * @param sampleFile - Audio file path, or null for a MIDI clip
 * @param params - Candidate parameters, keyed by their tool argument name
 */
export function warnAudioOnlyMidiParams(
  sampleFile: string | null,
  params: Record<string, unknown>,
): void {
  if (sampleFile != null) return;

  warnIgnoredParams(params, "MIDI clips");
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
 * @param sessionSlots - Array of session slot positions
 */
export function handleAutoPlayback(
  auto: string | null,
  view: string,
  sessionSlots: SlotPosition[],
): void {
  if (!auto || view !== "session" || sessionSlots.length === 0) {
    return;
  }

  switch (auto) {
    case "play-scene": {
      // Launch the first scene for synchronization
      // Length checked above: sessionSlots.length > 0
      const firstSlot = sessionSlots[0] as SlotPosition;
      const scene = LiveAPI.from(livePath.scene(firstSlot.sceneIndex));

      if (!scene.exists()) {
        throw new Error(
          `createClip auto="play-scene" failed: no scene at "s${firstSlot.sceneIndex}"`,
        );
      }

      scene.call("fire");
      break;
    }

    case "play-clip":
      // Fire individual clips at each slot position
      for (const slot of sessionSlots) {
        const clipSlot = LiveAPI.from(
          livePath.track(slot.trackIndex).clipSlot(slot.sceneIndex),
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
