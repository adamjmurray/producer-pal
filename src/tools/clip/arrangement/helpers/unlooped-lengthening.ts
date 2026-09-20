// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { abletonBeatsToDuration } from "#src/notation/barbeat/time/barbeat-time.ts";
import { createAudioClipInSession } from "#src/tools/shared/arrangement/helpers/arrangement-tiling-clips.ts";
import { songMeter } from "#src/tools/shared/validation/helpers/song-meter.ts";
import {
  markClipLanded,
  noteClipReason,
  refuseClipWork,
  type ClipReasons,
} from "#src/tools/clip/update/helpers/entries/clip-reasons.ts";
import { type ClipIdResult } from "./arrangement-length-changes.ts";

const EPSILON = 0.001;

/** An unlooped audio clip can only show what its file holds. */
const NO_MORE_CONTENT = "the audio file has no more content to show";

interface HandleUnloopedLengtheningArgs {
  clip: LiveAPI;
  isAudioClip: boolean;
  arrangementLengthBeats: number;
  currentArrangementLength: number;
  currentEndTime: number;
  clipStartMarker: number;
  track: LiveAPI;
  /** What each clip has to say beyond its result. */
  reasons: ClipReasons;
}

/**
 * Handle unlooped clip lengthening
 * @param options - Parameters object
 * @param options.clip - The LiveAPI clip object
 * @param options.isAudioClip - Whether the clip is an audio clip
 * @param options.arrangementLengthBeats - Target length in beats
 * @param options.currentArrangementLength - Current length in beats
 * @param options.currentEndTime - Current end time in beats
 * @param options.clipStartMarker - Clip start marker position
 * @param options.track - The LiveAPI track object
 * @param options.reasons - What each clip has to say beyond its result
 * @returns Array of updated clip info
 */
export function handleUnloopedLengthening({
  clip,
  isAudioClip,
  arrangementLengthBeats,
  currentArrangementLength,
  currentEndTime,
  clipStartMarker,
  track,
  reasons,
}: HandleUnloopedLengtheningArgs): ClipIdResult[] {
  const updatedClips: ClipIdResult[] = [];

  // MIDI clip handling — set loop_end to extend arrangement length directly
  if (!isAudioClip) {
    const currentEndMarker = clip.getProperty("end_marker") as number;
    const targetEndMarker = clipStartMarker + arrangementLengthBeats;

    // Extend end_marker so notes are visible in the extended region
    if (targetEndMarker > currentEndMarker) {
      clip.set("end_marker", targetEndMarker);
    }

    // Set loop_end to extend arrangement length
    const loopStart = clip.getProperty("loop_start") as number;

    clip.set("loop_end", loopStart + arrangementLengthBeats);

    updatedClips.push({ id: clip.id });

    return updatedClips;
  }

  // Audio clip handling - tile with chunks matching the current arrangement length
  // Each tile shows a different portion of the audio content
  // Markers are in the audio file's beat grid for both warped and unwarped clips
  const isWarped = (clip.getProperty("warping") as number) === 1;
  const clipEndMarkerBeats = clip.getProperty("end_marker") as number;
  const contentLength = clipEndMarkerBeats - clipStartMarker;

  // Zero-content clips have nothing to tile
  if (contentLength <= EPSILON) {
    updatedClips.push({ id: clip.id });

    return updatedClips;
  }

  updatedClips.push({ id: clip.id });

  if (isWarped) {
    lengthenWarpedUnloopedAudio(
      clip,
      track,
      arrangementLengthBeats,
      currentArrangementLength,
      clipStartMarker,
      reasons,
    );
  } else {
    lengthenUnwarpedAudio(
      clip,
      arrangementLengthBeats,
      currentArrangementLength,
      currentEndTime,
      reasons,
    );
  }

  return updatedClips;
}

// --- Helpers below main exports ---

/**
 * Lengthen a warped unlooped audio clip by setting loop_end (in content beats).
 * Unlike unwarped clips, Ableton does NOT auto-clamp loop_end at the file boundary
 * for warped clips, so we detect the boundary via a session clip and clamp manually.
 * @param clip - The warped audio clip
 * @param track - Track containing the clip
 * @param arrangementLengthBeats - Target arrangement length in beats
 * @param currentArrangementLength - Current arrangement length in beats
 * @param clipStartMarker - Clip's start_marker position
 * @param reasons - What each clip has to say beyond its result
 */
function lengthenWarpedUnloopedAudio(
  clip: LiveAPI,
  track: LiveAPI,
  arrangementLengthBeats: number,
  currentArrangementLength: number,
  clipStartMarker: number,
  reasons: ClipReasons,
): void {
  const filePath = clip.getProperty("file_path") as string;

  // Create session clip with minimal loop_end (1) to detect file content boundary
  // without extending end_marker past the actual file content
  const { clip: sessionClip, slot } = createAudioClipInSession(
    track,
    1,
    filePath,
  );

  // end_marker on the session clip stays at the file's natural content length
  // in the warped beat grid (createAudioClipInSession sets loop_end but not end_marker)
  const fileContentBoundary = sessionClip.getProperty("end_marker") as number;

  slot.call("delete_clip");

  const totalContentFromStart = fileContentBoundary - clipStartMarker;

  // No additional content beyond what's already shown — skip entirely
  if (totalContentFromStart <= currentArrangementLength + EPSILON) {
    noteNothingToShow(reasons, clip.id);

    return;
  }

  // Cap effective target to available file content
  const effectiveTarget = Math.min(
    arrangementLengthBeats,
    totalContentFromStart,
  );

  if (effectiveTarget < arrangementLengthBeats - EPSILON) {
    noteCappedAt(reasons, clip.id, effectiveTarget);
  }

  // For warped clips: loop_end is in content beats, 1:1 with arrangement beats
  const loopStart = clip.getProperty("loop_start") as number;
  const targetLoopEnd = loopStart + effectiveTarget;

  clip.set("loop_end", targetLoopEnd);

  // Also extend end_marker to match (end_marker isn't auto-extended on warped clips)
  const targetEndMarker = clipStartMarker + effectiveTarget;
  const currentEndMarker = clip.getProperty("end_marker") as number;

  if (targetEndMarker > currentEndMarker) {
    clip.set("end_marker", targetEndMarker);
  }
}

/**
 * Lengthen an unwarped audio clip by setting loop_end (in seconds).
 * Ableton auto-clamps to the file boundary if the target exceeds the sample length.
 * @param clip - The unwarped audio clip
 * @param arrangementLengthBeats - Target arrangement length in beats
 * @param currentArrangementLength - Current arrangement length in beats
 * @param currentEndTime - Current end time in beats
 * @param reasons - What each clip has to say beyond its result
 */
function lengthenUnwarpedAudio(
  clip: LiveAPI,
  arrangementLengthBeats: number,
  currentArrangementLength: number,
  currentEndTime: number,
  reasons: ClipReasons,
): void {
  const loopStart = clip.getProperty("loop_start") as number;
  const loopEnd = clip.getProperty("loop_end") as number;
  const currentDurationSec = loopEnd - loopStart;

  // Derive beats-per-second ratio from the clip's current values
  const beatsPerSecond = currentArrangementLength / currentDurationSec;
  const targetDurationSec = arrangementLengthBeats / beatsPerSecond;
  const targetLoopEnd = loopStart + targetDurationSec;

  clip.set("loop_end", targetLoopEnd);

  // Read back end_time to check achieved arrangement length
  const newEndTime = clip.getProperty("end_time") as number;
  const clipStartTime = currentEndTime - currentArrangementLength;
  const actualArrangementLength = newEndTime - clipStartTime;

  if (actualArrangementLength <= currentArrangementLength + EPSILON) {
    noteNothingToShow(reasons, clip.id);
  } else if (actualArrangementLength < arrangementLengthBeats - EPSILON) {
    noteCappedAt(reasons, clip.id, actualArrangementLength);
  }
}

/**
 * Note that the file ran out before the clip could grow at all, so
 * arrangementLength did nothing.
 * @param reasons - What each clip has to say, added to
 * @param clipId - The clip that couldn't grow
 */
function noteNothingToShow(reasons: ClipReasons, clipId: string): void {
  refuseClipWork(
    reasons,
    clipId,
    `arrangementLength unchanged: ${NO_MORE_CONTENT}`,
  );
}

/**
 * Note that the clip grew, but only as far as the file reaches.
 * @param reasons - What each clip has to say, added to
 * @param clipId - The clip that grew
 * @param landedBeats - The arrangement length it reached, in beats
 */
function noteCappedAt(
  reasons: ClipReasons,
  clipId: string,
  landedBeats: number,
): void {
  const { numerator, denominator } = songMeter();

  markClipLanded(reasons, clipId);
  noteClipReason(
    reasons,
    clipId,
    `arrangementLength landed at ${abletonBeatsToDuration(landedBeats, numerator, denominator)}: ${NO_MORE_CONTENT}`,
  );
}
