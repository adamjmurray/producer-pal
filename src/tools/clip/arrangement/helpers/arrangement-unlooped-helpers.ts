// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/v8-max-console.ts";
import {
  createAudioClipInSession,
  createShortenedClipInHolding,
  moveClipFromHolding,
} from "#src/tools/shared/arrangement/arrangement-tiling.ts";
import type { TilingContext } from "#src/tools/shared/arrangement/arrangement-tiling.ts";
import { setClipMarkersWithLoopingWorkaround } from "#src/tools/shared/clip-marker-helpers.ts";
import type {
  ArrangementContext,
  ClipIdResult,
} from "./arrangement-operations-helpers.ts";

const EPSILON = 0.001;

/**
 * Lengthen a warped unlooped audio clip by setting loop_end (in content beats).
 * Unlike unwarped clips, Ableton does NOT auto-clamp loop_end at the file boundary
 * for warped clips, so we detect the boundary via a session clip and clamp manually.
 * @param clip - The warped audio clip
 * @param track - Track containing the clip
 * @param arrangementLengthBeats - Target arrangement length in beats
 * @param currentArrangementLength - Current arrangement length in beats
 * @param clipStartMarker - Clip's start_marker position
 */
function lengthenWarpedUnloopedAudio(
  clip: LiveAPI,
  track: LiveAPI,
  arrangementLengthBeats: number,
  currentArrangementLength: number,
  clipStartMarker: number,
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
    console.warn(
      `Cannot lengthen unlooped audio clip — no additional file content ` +
        `(${totalContentFromStart.toFixed(1)} beats available, ` +
        `${currentArrangementLength} currently shown)`,
    );

    return;
  }

  // Cap effective target to available file content
  const effectiveTarget = Math.min(
    arrangementLengthBeats,
    totalContentFromStart,
  );

  if (effectiveTarget < arrangementLengthBeats - EPSILON) {
    console.warn(
      `Unlooped audio clip capped at file content boundary ` +
        `(${totalContentFromStart.toFixed(1)} beats available, ` +
        `${arrangementLengthBeats} requested)`,
    );
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
 */
function lengthenUnwarpedAudio(
  clip: LiveAPI,
  arrangementLengthBeats: number,
  currentArrangementLength: number,
  currentEndTime: number,
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
    console.warn(
      `Cannot lengthen unlooped audio clip — no additional file content ` +
        `(${currentDurationSec.toFixed(1)}s shown, at file boundary)`,
    );
  } else if (actualArrangementLength < arrangementLengthBeats - EPSILON) {
    console.warn(
      `Unlooped audio clip capped at file content boundary ` +
        `(${actualArrangementLength.toFixed(1)} beats achieved, ` +
        `${arrangementLengthBeats} requested)`,
    );
  }
}

interface HandleUnloopedLengtheningArgs {
  clip: LiveAPI;
  isAudioClip: boolean;
  arrangementLengthBeats: number;
  currentArrangementLength: number;
  currentEndTime: number;
  clipStartMarker: number;
  track: LiveAPI;
  context: ArrangementContext;
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
 * @param options.context - Tool execution context
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
  context,
}: HandleUnloopedLengtheningArgs): ClipIdResult[] {
  const updatedClips: ClipIdResult[] = [];

  // MIDI clip handling - tile with chunks matching the current arrangement length
  // Each tile shows a different portion of the clip content
  if (!isAudioClip) {
    const tileSize = currentArrangementLength;
    const currentEndMarker = clip.getProperty("end_marker") as number;
    const targetEndMarker = clipStartMarker + arrangementLengthBeats;

    // Extend source clip's end_marker to target (only if extending, never shrink)
    if (targetEndMarker > currentEndMarker) {
      clip.set("end_marker", targetEndMarker);
    }

    updatedClips.push({ id: clip.id });

    // Create tiles for remaining space
    let currentPosition = currentEndTime;
    let currentContentOffset = clipStartMarker + currentArrangementLength;
    const holdingAreaStart = context.holdingAreaStartBeats;

    while (
      currentPosition <
      currentEndTime +
        (arrangementLengthBeats - currentArrangementLength) -
        EPSILON
    ) {
      const remainingSpace =
        currentEndTime +
        (arrangementLengthBeats - currentArrangementLength) -
        currentPosition;
      const tileLengthNeeded = Math.min(tileSize, remainingSpace);
      const isPartialTile = tileSize - tileLengthNeeded > EPSILON;

      const tileStartMarker = currentContentOffset;
      const tileEndMarker = tileStartMarker + tileLengthNeeded;

      let tileClip: LiveAPI;

      if (isPartialTile) {
        // Partial tiles use holding area to avoid overwriting subsequent clips
        const { holdingClipId } = createShortenedClipInHolding(
          clip,
          track,
          tileLengthNeeded,
          holdingAreaStart as number,
          true, // isMidiClip
          context as TilingContext,
        );

        tileClip = moveClipFromHolding(holdingClipId, track, currentPosition);
      } else {
        // Full tiles use direct duplication
        const duplicateResult = track.call(
          "duplicate_clip_to_arrangement",
          `id ${clip.id}`,
          currentPosition,
        ) as string;

        tileClip = LiveAPI.from(duplicateResult);
      }

      // Set markers using looping workaround
      setClipMarkersWithLoopingWorkaround(tileClip, {
        loopStart: tileStartMarker,
        loopEnd: tileEndMarker,
        startMarker: tileStartMarker,
        endMarker: tileEndMarker,
      });

      updatedClips.push({ id: tileClip.id });

      currentPosition += tileLengthNeeded;
      currentContentOffset += tileLengthNeeded;
    }

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
    );
  } else {
    lengthenUnwarpedAudio(
      clip,
      arrangementLengthBeats,
      currentArrangementLength,
      currentEndTime,
    );
  }

  return updatedClips;
}
