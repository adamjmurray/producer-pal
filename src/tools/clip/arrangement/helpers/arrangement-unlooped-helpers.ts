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
 * Tile audio content to fill remaining space
 * @param params - Tiling parameters
 * @param params.clip - Source clip to tile from
 * @param params.track - Track to place tiles on
 * @param params.clipStartMarkerBeats - Start marker in beats
 * @param params.clipEndMarkerBeats - End marker in beats
 * @param params.currentEndTime - Current end time of arrangement
 * @param params.currentArrangementLength - Current arrangement length
 * @param params.arrangementLengthBeats - Target arrangement length
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
  context,
}: {
  clip: LiveAPI;
  track: LiveAPI;
  clipStartMarkerBeats: number;
  clipEndMarkerBeats: number;
  currentEndTime: number;
  currentArrangementLength: number;
  arrangementLengthBeats: number;
  context: ArrangementContext;
}): ClipIdResult[] {
  const updatedClips: ClipIdResult[] = [];
  let currentPosition = currentEndTime;
  let currentContentOffset = clipStartMarkerBeats + currentArrangementLength;
  const tileSize = currentArrangementLength;

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

    // If we've run out of content, loop back to the start
    if (currentContentOffset >= clipEndMarkerBeats) {
      currentContentOffset = clipStartMarkerBeats;
    }

    // Calculate how much content is available from current offset to end of clip
    const availableContent = clipEndMarkerBeats - currentContentOffset;
    const actualTileLength = Math.min(tileLengthNeeded, availableContent);

    const tileStartMarker = currentContentOffset;
    const tileEndMarker = tileStartMarker + actualTileLength;

    const revealedClip = revealAudioContentAtPosition(
      clip,
      track,
      tileStartMarker,
      tileEndMarker,
      currentPosition,
      context,
    );

    updatedClips.push({ id: revealedClip.id });

    currentPosition += actualTileLength;
    currentContentOffset += actualTileLength;
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

  // Audio clip handling - tile with chunks matching the current arrangement length
  // Each tile shows a different portion of the audio content
  const isWarped = (clip.getProperty("warping") as number) === 1;
  let clipStartMarkerBeats: number;
  let clipEndMarkerBeats: number;

  if (isWarped) {
    clipStartMarkerBeats = clipStartMarker;
    clipEndMarkerBeats = clip.getProperty("end_marker") as number;
  } else {
    const liveSet = LiveAPI.from("live_set");
    const tempo = liveSet.getProperty("tempo") as number;

    clipStartMarkerBeats = clipStartMarker * (tempo / 60);
    clipEndMarkerBeats =
      (clip.getProperty("end_marker") as number) * (tempo / 60);
  }

  const targetEndMarker = clipStartMarkerBeats + arrangementLengthBeats;

  // For warped clips, extend source clip's end_marker so it can show more content
  if (isWarped) {
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
    context,
  });

  updatedClips.push(...tiles);

  return updatedClips;
}
