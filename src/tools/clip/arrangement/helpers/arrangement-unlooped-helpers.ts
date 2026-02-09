// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/v8-max-console.ts";
import { revealAudioContentAtPosition } from "#src/tools/shared/arrangement/arrangement-audio-helpers.ts";
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

interface WarpedTilingResult {
  tiles: ClipIdResult[];
  effectiveTarget: number;
}

/**
 * Tile warped audio content using session-based clip creation.
 * Creates a single tile covering the remaining arrangement space. Uses the session
 * holding area to control arrangement length, since arrangement clip end_time is
 * immutable after creation (cannot be extended by setting end_marker).
 *
 * Returns null if the audio file has no additional content to reveal.
 * When the file has content but not enough for the full target, caps to the
 * available content and emits a warning.
 * @param params - Tiling parameters
 * @param params.clip - Source clip to get audio file from
 * @param params.track - Track to place tile on
 * @param params.tileContentStart - Content offset where tiling begins
 * @param params.currentEndTime - Current end time of arrangement
 * @param params.currentArrangementLength - Current arrangement length
 * @param params.arrangementLengthBeats - Target arrangement length
 * @param params.clipStartMarker - Source clip's start_marker for boundary check
 * @returns Tiles and effective target, or null to skip lengthening
 */
function tileWarpedAudioContent({
  clip,
  track,
  tileContentStart,
  currentEndTime,
  currentArrangementLength,
  arrangementLengthBeats,
  clipStartMarker,
}: {
  clip: LiveAPI;
  track: LiveAPI;
  tileContentStart: number;
  currentEndTime: number;
  currentArrangementLength: number;
  arrangementLengthBeats: number;
  clipStartMarker: number;
}): WarpedTilingResult | null {
  if (arrangementLengthBeats - currentArrangementLength <= EPSILON) {
    return { tiles: [], effectiveTarget: arrangementLengthBeats };
  }

  const filePath = clip.getProperty("file_path") as string;

  // Create session clip with minimal loop_end (1) to avoid extending end_marker
  // beyond the file boundary. The actual loop markers are set after detection.
  const { clip: sessionClip, slot } = createAudioClipInSession(
    track,
    1,
    filePath,
  );

  // Read file content boundary from session clip's default end_marker
  // (createAudioClipInSession sets loop_end but not end_marker, so end_marker
  // remains at the file's natural content length in the warped beat grid)
  const fileContentBoundary = sessionClip.getProperty("end_marker") as number;
  const totalContentFromStart = fileContentBoundary - clipStartMarker;

  // No additional content beyond what's already shown — skip entirely
  if (totalContentFromStart <= currentArrangementLength + EPSILON) {
    console.warn(
      `Cannot lengthen unlooped audio clip — no additional file content ` +
        `(${totalContentFromStart.toFixed(1)} beats available, ` +
        `${currentArrangementLength} currently shown)`,
    );
    slot.call("delete_clip");

    return null;
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

  const remainingLength = effectiveTarget - currentArrangementLength;
  const tileContentEnd = tileContentStart + remainingLength;

  // Set content markers to show the correct audio portion
  sessionClip.set("loop_end", tileContentEnd);
  sessionClip.set("loop_start", tileContentStart);
  sessionClip.set("end_marker", tileContentEnd);
  sessionClip.set("start_marker", tileContentStart);

  // Duplicate to arrangement — inherits session clip's arrangement length
  const result = track.call(
    "duplicate_clip_to_arrangement",
    `id ${sessionClip.id}`,
    currentEndTime,
  ) as string;
  const tileClip = LiveAPI.from(result);

  // Unloop the arrangement clip (source was unlooped, tile should match)
  tileClip.set("looping", 0);

  // Clean up session clip
  slot.call("delete_clip");

  return { tiles: [{ id: tileClip.id }], effectiveTarget };
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

  updatedClips.push({ id: clip.id });

  if (isWarped) {
    // Warped: content = arrangement, so tiling starts at start_marker + arrLength
    const tileContentStart = clipStartMarker + currentArrangementLength;
    const result = tileWarpedAudioContent({
      clip,
      track,
      tileContentStart,
      currentEndTime,
      currentArrangementLength,
      arrangementLengthBeats,
      clipStartMarker,
    });

    // null means no additional file content to reveal — skip lengthening
    if (result == null) {
      return updatedClips;
    }

    // Extend source clip's end_marker so it can show more content.
    // Uses effectiveTarget which may be capped to file content boundary.
    const { tiles, effectiveTarget } = result;
    const targetEndMarker = clipStartMarker + effectiveTarget;

    if (targetEndMarker > clipEndMarkerBeats) {
      clip.set("end_marker", targetEndMarker);
    }

    updatedClips.push(...tiles);
  } else {
    // Unwarped: content ends at end_marker (file beats ≠ arrangement beats)
    const tileContentStart = clipEndMarkerBeats;
    const tiles = tileUnwarpedAudioContent({
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
  }

  return updatedClips;
}
