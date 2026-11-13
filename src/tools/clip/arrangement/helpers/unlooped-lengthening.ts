// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { abletonBeatsToDuration } from "#src/notation/barbeat/time/barbeat-time.ts";
import {
  createAudioClipInSession,
  removeSessionClip,
} from "#src/tools/shared/arrangement/helpers/scratch-clips.ts";
import { songMeter } from "#src/tools/shared/validation/helpers/song-meter.ts";
import {
  markClipLanded,
  noteClipReason,
  refuseClipWork,
  type ClipReasons,
} from "#src/tools/clip/update/helpers/entries/clip-reasons.ts";
import { type ClipIdResult } from "./arrangement-length-changes.ts";
import { audioClipSampleSeconds } from "#src/tools/clip/helpers/audio-clip-timing.ts";
import { SAME_TIME_EPSILON } from "#src/shared/config.ts";

/** Why a clip that should have grown stopped short, with nothing in its way. */
export const LIVE_STOPPED_IT = "Live stopped the clip there";

/** An unlooped audio clip can only show what its file holds. */
const NO_MORE_CONTENT = "the audio file has no more content to show";

interface HandleUnloopedLengtheningArgs {
  clip: LiveAPI;
  isAudioClip: boolean;
  arrangementLengthBeats: number;
  currentArrangementLength: number;
  currentEndTime: number;
  track: LiveAPI;
  /** Empties the lane up to where the clip will end, so it can grow there. */
  clearAhead: (targetEnd: number) => void;
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
 * @param options.track - The LiveAPI track object
 * @param options.clearAhead - Empties the lane up to a target end, in beats
 * @param options.reasons - What each clip has to say beyond its result
 * @returns The clip when it was resized, or empty when it couldn't grow
 */
export function handleUnloopedLengthening({
  clip,
  isAudioClip,
  arrangementLengthBeats,
  currentArrangementLength,
  currentEndTime,
  track,
  clearAhead,
  reasons,
}: HandleUnloopedLengtheningArgs): ClipIdResult[] {
  const clipStartMarker = clip.getProperty("start_marker") as number;
  const clipStartTime = currentEndTime - currentArrangementLength;
  // Live stops a growing clip at the next one, so clear up to where it'll end.
  const clearTo = (spanBeats: number): void =>
    clearAhead(clipStartTime + spanBeats);

  // MIDI clip handling — set loop_end to extend arrangement length directly
  if (!isAudioClip) {
    clearTo(arrangementLengthBeats);

    const currentEndMarker = clip.getProperty("end_marker") as number;
    const targetEndMarker = clipStartMarker + arrangementLengthBeats;

    // Extend end_marker so notes are visible in the extended region
    if (targetEndMarker > currentEndMarker) {
      clip.set("end_marker", targetEndMarker);
    }

    // Set loop_end to extend arrangement length
    const loopStart = clip.getProperty("loop_start") as number;

    clip.set("loop_end", loopStart + arrangementLengthBeats);

    // Clearing leaves nothing to stop it, so this is Live refusing the span.
    const landed = (clip.getProperty("end_time") as number) - clipStartTime;

    if (landed < arrangementLengthBeats - SAME_TIME_EPSILON) {
      noteLandedShort(reasons, clip.id, landed, LIVE_STOPPED_IT);
    }

    return [{ id: clip.id }];
  }

  // Audio: the clip can only grow as far as its file reaches.
  const isWarped = (clip.getProperty("warping") as number) === 1;
  const clipEndMarkerBeats = clip.getProperty("end_marker") as number;
  const contentLength = clipEndMarkerBeats - clipStartMarker;

  // Zero-content clips have nothing to show
  if (contentLength <= SAME_TIME_EPSILON) {
    refuseClipWork(
      reasons,
      clip.id,
      "arrangementLength unchanged: the clip shows no audio to lengthen",
    );

    return [];
  }

  const grew = isWarped
    ? lengthenWarpedUnloopedAudio(
        clip,
        track,
        arrangementLengthBeats,
        currentArrangementLength,
        clipStartMarker,
        clearTo,
        reasons,
      )
    : lengthenUnwarpedAudio(
        clip,
        arrangementLengthBeats,
        currentArrangementLength,
        clipStartTime,
        clearTo,
        reasons,
      );

  // A clip that didn't grow isn't reported as resized, so the refusal stands.
  return grew ? [{ id: clip.id }] : [];
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
 * @param clearTo - Empties the lane up to a span from the clip's start
 * @param reasons - What each clip has to say beyond its result
 * @returns Whether the clip grew
 */
function lengthenWarpedUnloopedAudio(
  clip: LiveAPI,
  track: LiveAPI,
  arrangementLengthBeats: number,
  currentArrangementLength: number,
  clipStartMarker: number,
  clearTo: (spanBeats: number) => void,
  reasons: ClipReasons,
): boolean {
  const filePath = clip.getProperty("file_path") as string;

  // Create session clip with minimal loop_end (1) to detect file content boundary
  // without extending end_marker past the actual file content
  const reportScratch = (message: string): void =>
    noteClipReason(reasons, clip.id, message);
  const session = createAudioClipInSession(track, 1, filePath, reportScratch);

  // end_marker on the session clip stays at the file's natural content length
  // in the warped beat grid (createAudioClipInSession sets loop_end but not end_marker)
  let fileContentBoundary: number;

  // Removed even if the read throws: the scratch clip would otherwise stay,
  // and its scene with it.
  try {
    fileContentBoundary = session.clip.getProperty("end_marker") as number;
  } finally {
    removeSessionClip(session, reportScratch);
  }

  const totalContentFromStart = fileContentBoundary - clipStartMarker;

  // No additional content beyond what's already shown — skip entirely
  if (totalContentFromStart <= currentArrangementLength + SAME_TIME_EPSILON) {
    noteNothingToShow(reasons, clip.id);

    return false;
  }

  // Cap effective target to available file content
  const effectiveTarget = Math.min(
    arrangementLengthBeats,
    totalContentFromStart,
  );

  if (effectiveTarget < arrangementLengthBeats - SAME_TIME_EPSILON) {
    noteLandedShort(reasons, clip.id, effectiveTarget, NO_MORE_CONTENT);
  }

  clearTo(effectiveTarget);

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

  return true;
}

/**
 * Lengthen an unwarped audio clip by setting loop_end (in seconds).
 * Ableton auto-clamps to the file boundary if the target exceeds the sample length.
 * @param clip - The unwarped audio clip
 * @param arrangementLengthBeats - Target arrangement length in beats
 * @param currentArrangementLength - Current arrangement length in beats
 * @param clipStartTime - Where the clip starts, in beats
 * @param clearTo - Empties the lane up to a span from the clip's start
 * @param reasons - What each clip has to say beyond its result
 * @returns Whether the clip grew
 */
function lengthenUnwarpedAudio(
  clip: LiveAPI,
  arrangementLengthBeats: number,
  currentArrangementLength: number,
  clipStartTime: number,
  clearTo: (spanBeats: number) => void,
  reasons: ClipReasons,
): boolean {
  const loopStart = clip.getProperty("loop_start") as number;
  const loopEnd = clip.getProperty("loop_end") as number;
  const currentDurationSec = loopEnd - loopStart;

  // Derive beats-per-second ratio from the clip's current values
  const beatsPerSecond = currentArrangementLength / currentDurationSec;
  const targetDurationSec = arrangementLengthBeats / beatsPerSecond;
  const targetLoopEnd = loopStart + targetDurationSec;
  // Clear only as far as the file lets it grow, when its length is known.
  const sampleSeconds = audioClipSampleSeconds(clip);
  const reachBeats =
    sampleSeconds > 0
      ? (sampleSeconds - loopStart) * beatsPerSecond
      : arrangementLengthBeats;

  clearTo(Math.min(arrangementLengthBeats, reachBeats));
  clip.set("loop_end", targetLoopEnd);

  // Read back the span to check what Live allowed
  const actualArrangementLength =
    (clip.getProperty("end_time") as number) - clipStartTime;

  if (actualArrangementLength <= currentArrangementLength + SAME_TIME_EPSILON) {
    noteNothingToShow(reasons, clip.id);

    return false;
  }

  if (actualArrangementLength < arrangementLengthBeats - SAME_TIME_EPSILON) {
    noteLandedShort(reasons, clip.id, actualArrangementLength, NO_MORE_CONTENT);
  }

  return true;
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
 * Note that the clip grew, but short of the length asked for.
 * @param reasons - What each clip has to say, added to
 * @param clipId - The clip that grew
 * @param landedBeats - The arrangement length it reached, in beats
 * @param why - Why it stopped there
 */
export function noteLandedShort(
  reasons: ClipReasons,
  clipId: string,
  landedBeats: number,
  why: string,
): void {
  const { numerator, denominator } = songMeter();

  markClipLanded(reasons, clipId);
  noteClipReason(
    reasons,
    clipId,
    `arrangementLength landed at ${abletonBeatsToDuration(landedBeats, numerator, denominator)}: ${why}`,
  );
}
