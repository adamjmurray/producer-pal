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
    const targetEndMarker = clipStartMarker + arrangementLengthBeats;

    // Extend source clip's end_marker to target
    clip.set("end_marker", targetEndMarker);
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

  // Audio clip handling
  // Note: We don't try to detect hidden content - just attempt to extend
  // and let Live handle it (fills with silence if audio runs out)
  const isWarped = (clip.getProperty("warping") as number) === 1;
  let clipStartMarkerBeats: number;

  if (isWarped) {
    clipStartMarkerBeats = clipStartMarker;
  } else {
    const liveSet = LiveAPI.from("live_set");
    const tempo = liveSet.getProperty("tempo") as number;

    clipStartMarkerBeats = clipStartMarker * (tempo / 60);
  }

  const visibleContentEnd = clipStartMarkerBeats + currentArrangementLength;
  const targetEndMarker = clipStartMarkerBeats + arrangementLengthBeats;

  // Always attempt to reveal - calculate based on requested length
  const remainingToReveal = arrangementLengthBeats - currentArrangementLength;
  const newStartMarker = visibleContentEnd;
  const newEndMarker = newStartMarker + remainingToReveal;

  // For warped clips, extend source clip's end_marker so duplicate inherits extended content bounds
  if (isWarped) {
    clip.set("end_marker", targetEndMarker);
  }

  const revealedClip = revealAudioContentAtPosition(
    clip,
    track,
    newStartMarker,
    newEndMarker,
    currentEndTime,
    context,
  );

  updatedClips.push({ id: clip.id });
  updatedClips.push({ id: revealedClip.id });

  return updatedClips;
}
