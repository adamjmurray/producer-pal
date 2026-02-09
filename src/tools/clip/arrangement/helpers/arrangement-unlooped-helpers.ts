// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { revealAudioContentAtPosition } from "#src/tools/shared/arrangement/arrangement-audio-helpers.ts";
import {
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
 * Tile audio content to fill remaining space.
 * Warped clips: progressive tiling (each tile shows next sequential content portion).
 * Unwarped clips: wrapping tiling (tiles repeat from start, audio file is finite).
 * @param params - Tiling parameters
 * @param params.clip - Source clip to tile from
 * @param params.track - Track to place tiles on
 * @param params.clipStartMarkerBeats - Start marker in beats
 * @param params.clipEndMarkerBeats - End marker in beats (original, pre-extension)
 * @param params.currentEndTime - Current end time of arrangement
 * @param params.currentArrangementLength - Current arrangement length
 * @param params.arrangementLengthBeats - Target arrangement length
 * @param params.isWarped - Whether the clip is warped (progressive) or unwarped (wrapping)
 * @param params.context - Arrangement context
 * @returns Array of revealed clip IDs
 */
function tileAudioContent({
  clip,
  track,
  clipStartMarkerBeats,
  clipEndMarkerBeats,
  currentEndTime,
  currentArrangementLength,
  arrangementLengthBeats,
  isWarped,
  context,
}: {
  clip: LiveAPI;
  track: LiveAPI;
  clipStartMarkerBeats: number;
  clipEndMarkerBeats: number;
  currentEndTime: number;
  currentArrangementLength: number;
  arrangementLengthBeats: number;
  isWarped: boolean;
  context: ArrangementContext;
}): ClipIdResult[] {
  const updatedClips: ClipIdResult[] = [];

  const contentLength = clipEndMarkerBeats - clipStartMarkerBeats;

  // Guard against zero-length content which would cause an infinite loop
  if (contentLength <= 0) {
    return updatedClips;
  }

  // Scale factor: arrangement beats per content beat.
  // For warped clips this is 1.0. For unwarped clips, arrangement length differs
  // from content length because unwarped audio plays at its native sample rate.
  const scaleFactor = currentArrangementLength / contentLength;

  let currentPosition = currentEndTime;
  // Warped: progressive (content advances beyond original end_marker, which was extended).
  // Unwarped: wrap back to start (audio file has finite content, tiles repeat).
  let currentContentOffset = clipEndMarkerBeats;
  const tileArrangementSize = currentArrangementLength;
  const targetEnd =
    currentEndTime + (arrangementLengthBeats - currentArrangementLength);

  while (currentPosition < targetEnd - EPSILON) {
    // Unwarped clips: wrap content back to start (finite audio file)
    if (!isWarped && currentContentOffset >= clipEndMarkerBeats) {
      currentContentOffset = clipStartMarkerBeats;
    }

    const remainingArrangement = targetEnd - currentPosition;
    const tileArrangementNeeded = Math.min(
      tileArrangementSize,
      remainingArrangement,
    );
    const tileContentNeeded = tileArrangementNeeded / scaleFactor;

    const tileStartMarker = currentContentOffset;
    const tileEndMarker = tileStartMarker + tileContentNeeded;

    const revealedClip = revealAudioContentAtPosition(
      clip,
      track,
      tileStartMarker,
      tileEndMarker,
      currentPosition,
      context,
      tileArrangementNeeded,
    );

    updatedClips.push({ id: revealedClip.id });

    currentPosition += tileArrangementNeeded;
    currentContentOffset += tileContentNeeded;
  }

  return updatedClips;
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
  const clipStartMarkerBeats = clipStartMarker;
  const clipEndMarkerBeats = clip.getProperty("end_marker") as number;

  const targetEndMarker = clipStartMarkerBeats + arrangementLengthBeats;

  // For warped clips, extend source clip's end_marker so it can show more content
  // Only extend, never shrink (preserve existing content boundary)
  if (isWarped && targetEndMarker > clipEndMarkerBeats) {
    clip.set("end_marker", targetEndMarker);
  }

  updatedClips.push({ id: clip.id });

  // Create tiles for remaining space
  const tiles = tileAudioContent({
    clip,
    track,
    clipStartMarkerBeats,
    clipEndMarkerBeats,
    currentEndTime,
    currentArrangementLength,
    arrangementLengthBeats,
    isWarped,
    context,
  });

  updatedClips.push(...tiles);

  return updatedClips;
}
