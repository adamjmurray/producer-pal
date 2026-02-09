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
 * Tile warped audio content using progressive tiling.
 * Each tile shows the next sequential content portion (content offset advances).
 * Scale factor is 1.0 for warped clips (1 content beat = 1 arrangement beat).
 * @param params - Tiling parameters
 * @param params.clip - Source clip to tile from
 * @param params.track - Track to place tiles on
 * @param params.tileContentStart - Content offset where tiling begins (arrangement end in content space)
 * @param params.currentEndTime - Current end time of arrangement
 * @param params.currentArrangementLength - Current arrangement length
 * @param params.arrangementLengthBeats - Target arrangement length
 * @param params.context - Arrangement context
 * @returns Array of revealed clip IDs
 */
function tileWarpedAudioContent({
  clip,
  track,
  tileContentStart,
  currentEndTime,
  currentArrangementLength,
  arrangementLengthBeats,
  context,
}: {
  clip: LiveAPI;
  track: LiveAPI;
  tileContentStart: number;
  currentEndTime: number;
  currentArrangementLength: number;
  arrangementLengthBeats: number;
  context: ArrangementContext;
}): ClipIdResult[] {
  const updatedClips: ClipIdResult[] = [];
  let currentPosition = currentEndTime;
  let currentContentOffset = tileContentStart;
  const tileArrangementSize = currentArrangementLength;
  const targetEnd =
    currentEndTime + (arrangementLengthBeats - currentArrangementLength);

  while (currentPosition < targetEnd - EPSILON) {
    const remainingArrangement = targetEnd - currentPosition;
    const tileSize = Math.min(tileArrangementSize, remainingArrangement);

    const revealedClip = revealAudioContentAtPosition(
      clip,
      track,
      currentContentOffset,
      currentContentOffset + tileSize,
      currentPosition,
      context,
    );

    updatedClips.push({ id: revealedClip.id });
    currentPosition += tileSize;
    currentContentOffset += tileSize;
  }

  return updatedClips;
}

/**
 * Tile unwarped audio content using progressive tiling via revealAudioContentAtPosition.
 * Each tile shows the next sequential content portion. Arrangement lengths are determined
 * by Ableton when unwarping (native sample rate playback), so tiles may have different
 * arrangement lengths from the source clip. The last tile is shortened if needed.
 * @param params - Tiling parameters
 * @param params.clip - Source clip to tile from
 * @param params.track - Track to place tiles on
 * @param params.tileContentStart - Content offset where tiling begins (file beat grid)
 * @param params.contentLength - Content length per tile (file beats)
 * @param params.currentEndTime - Current end time of arrangement
 * @param params.currentArrangementLength - Current arrangement length
 * @param params.arrangementLengthBeats - Target arrangement length
 * @param params.context - Arrangement context
 * @returns Array of revealed clip IDs
 */
function tileUnwarpedAudioContent({
  clip,
  track,
  tileContentStart,
  contentLength,
  currentEndTime,
  currentArrangementLength,
  arrangementLengthBeats,
  context,
}: {
  clip: LiveAPI;
  track: LiveAPI;
  tileContentStart: number;
  contentLength: number;
  currentEndTime: number;
  currentArrangementLength: number;
  arrangementLengthBeats: number;
  context: ArrangementContext;
}): ClipIdResult[] {
  const updatedClips: ClipIdResult[] = [];
  let currentPosition = currentEndTime;
  let currentContentOffset = tileContentStart;
  const tileContentSize = contentLength;
  const targetEnd =
    currentEndTime + (arrangementLengthBeats - currentArrangementLength);
  // Source content markers for wrapping fallback
  const sourceContentStart = tileContentStart - contentLength;

  // Phase 1: Progressive tiling — reveal next sequential content portion.
  // Each tile shows a different part of the audio file.
  while (currentPosition < targetEnd - EPSILON) {
    const remainingArrangement = targetEnd - currentPosition;
    const revealedClip = revealAudioContentAtPosition(
      clip,
      track,
      currentContentOffset,
      currentContentOffset + tileContentSize,
      currentPosition,
      context,
      remainingArrangement,
    );

    const revealedEnd = revealedClip.getProperty("end_time") as number;
    const tileArrangementLength = revealedEnd - currentPosition;

    // Zero-length tile means content is exhausted beyond the audio file.
    // Delete the empty clip and fall through to wrapping.
    if (tileArrangementLength <= EPSILON) {
      track.call("delete_clip", `id ${revealedClip.id}`);
      break;
    }

    updatedClips.push({ id: revealedClip.id });
    currentPosition += tileArrangementLength;
    currentContentOffset += tileContentSize;
  }

  // Phase 2: Wrapping — repeat source content for remaining space.
  // Uses source markers [clipStartMarker, clipEndMarkerBeats] so Ableton
  // produces the correct native-speed arrangement length (not trimmed).
  while (currentPosition < targetEnd - EPSILON) {
    const remainingArrangement = targetEnd - currentPosition;
    const wrappedClip = revealAudioContentAtPosition(
      clip,
      track,
      sourceContentStart,
      sourceContentStart + tileContentSize,
      currentPosition,
      context,
      remainingArrangement,
    );

    const wrappedEnd = wrappedClip.getProperty("end_time") as number;
    const wrappedLength = wrappedEnd - currentPosition;

    // Zero-length wrapping tile — content cannot be played. Clean up and stop.
    if (wrappedLength <= EPSILON) {
      track.call("delete_clip", `id ${wrappedClip.id}`);
      break;
    }

    updatedClips.push({ id: wrappedClip.id });
    currentPosition += wrappedLength;
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
  const clipEndMarkerBeats = clip.getProperty("end_marker") as number;
  const contentLength = clipEndMarkerBeats - clipStartMarker;

  // Zero-content clips have nothing to tile
  if (contentLength <= EPSILON) {
    updatedClips.push({ id: clip.id });

    return updatedClips;
  }

  // For warped clips, extend source clip's end_marker so it can show more content.
  // targetEndMarker = start_marker + target: ensures content covers all progressive
  // tiles starting from the arrangement boundary (start_marker + currentLength).
  if (isWarped) {
    const targetEndMarker = clipStartMarker + arrangementLengthBeats;

    if (targetEndMarker > clipEndMarkerBeats) {
      clip.set("end_marker", targetEndMarker);
    }
  }

  updatedClips.push({ id: clip.id });

  // Tiling starts from where content ends in file beat space.
  // Warped: content = arrangement, so start_marker + arrangementLength.
  // Unwarped: content ends at end_marker (file beats ≠ arrangement beats).
  const tileContentStart = isWarped
    ? clipStartMarker + currentArrangementLength
    : clipEndMarkerBeats;

  // Create tiles for remaining space
  const tiles = isWarped
    ? tileWarpedAudioContent({
        clip,
        track,
        tileContentStart,
        currentEndTime,
        currentArrangementLength,
        arrangementLengthBeats,
        context,
      })
    : tileUnwarpedAudioContent({
        clip,
        track,
        tileContentStart,
        contentLength,
        currentEndTime,
        currentArrangementLength,
        arrangementLengthBeats,
        context,
      });

  updatedClips.push(...tiles);

  return updatedClips;
}
