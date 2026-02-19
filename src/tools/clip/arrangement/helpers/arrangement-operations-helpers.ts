// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  createAudioClipInSession,
  tileClipToRange,
  type TilingContext,
} from "#src/tools/shared/arrangement/arrangement-tiling.ts";
import { toLiveApiId } from "#src/tools/shared/utils.ts";
import { handleUnloopedLengthening } from "./arrangement-unlooped-helpers.ts";

export interface ArrangementContext {
  holdingAreaStartBeats?: number;
  silenceWavPath?: string;
}

export interface ClipIdResult {
  id: string;
}

interface TileWithContextOptions {
  adjustPreRoll: boolean;
  startOffset?: number;
  tileLength?: number;
}

/**
 * Wrapper for tileClipToRange with type casts for ArrangementContext
 * @param clip - Source clip
 * @param track - Track to tile on
 * @param position - Start position
 * @param length - Length to tile
 * @param ctx - Context with holding area info
 * @param options - Tiling options
 * @returns Array of tiled clip info
 */
function tileWithContext(
  clip: LiveAPI,
  track: LiveAPI,
  position: number,
  length: number,
  ctx: ArrangementContext,
  options: TileWithContextOptions,
): ClipIdResult[] {
  return tileClipToRange(
    clip,
    track,
    position,
    length,
    ctx.holdingAreaStartBeats as number,
    ctx as TilingContext,
    options,
  );
}

interface HandleArrangementLengtheningArgs {
  clip: LiveAPI;
  isAudioClip: boolean;
  arrangementLengthBeats: number;
  currentArrangementLength: number;
  currentStartTime: number;
  currentEndTime: number;
  context: ArrangementContext;
}

/**
 * Handle lengthening of arrangement clips via tiling or content exposure
 * @param options - Parameters object
 * @param options.clip - The LiveAPI clip object to lengthen
 * @param options.isAudioClip - Whether the clip is an audio clip
 * @param options.arrangementLengthBeats - Target length in beats
 * @param options.currentArrangementLength - Current length in beats
 * @param options.currentStartTime - Current start time in beats
 * @param options.currentEndTime - Current end time in beats
 * @param options.context - Tool execution context with holding area info
 * @returns Array of updated clip info
 */
export function handleArrangementLengthening({
  clip,
  isAudioClip,
  arrangementLengthBeats,
  currentArrangementLength,
  currentStartTime,
  currentEndTime,
  context,
}: HandleArrangementLengtheningArgs): ClipIdResult[] {
  const updatedClips: ClipIdResult[] = [];

  const isLooping = (clip.getProperty("looping") as number) > 0;
  const clipLoopStart = clip.getProperty("loop_start") as number;
  const clipLoopEnd = clip.getProperty("loop_end") as number;
  const clipStartMarker = clip.getProperty("start_marker") as number;
  const clipEndMarker = clip.getProperty("end_marker") as number;

  // For unlooped clips, use end_marker - start_marker (actual playback length)
  // For looped clips, use loop region
  const clipLength = isLooping
    ? clipLoopEnd - clipLoopStart
    : clipEndMarker - clipStartMarker;

  // Get track for clip operations
  const trackIndex = clip.trackIndex;

  if (trackIndex == null) {
    throw new Error(
      `updateClip failed: could not determine trackIndex for clip ${clip.id}`,
    );
  }

  const track = LiveAPI.from(livePath.track(trackIndex));

  // Handle unlooped clips separately from looped clips
  if (!isLooping) {
    return handleUnloopedLengthening({
      clip,
      isAudioClip,
      arrangementLengthBeats,
      currentArrangementLength,
      currentEndTime,
      clipStartMarker,
      track,
    });
  }

  // Branch: expose hidden content vs tiling (looped clips only)
  if (arrangementLengthBeats < clipLength) {
    // Expose hidden content by tiling with start_marker offsets
    const currentOffset = clipStartMarker - clipLoopStart;
    const remainingLength = arrangementLengthBeats - currentArrangementLength;
    const tiledClips = tileWithContext(
      clip,
      track,
      currentEndTime,
      remainingLength,
      context,
      {
        adjustPreRoll: false,
        startOffset: currentOffset + currentArrangementLength,
        tileLength: currentArrangementLength,
      },
    );

    updatedClips.push({ id: clip.id });
    updatedClips.push(...tiledClips);
  } else {
    // Lengthening via tiling
    const currentOffset = clipStartMarker - clipLoopStart;
    const totalContentLength = clipLoopEnd - clipStartMarker;
    const tiledClips = createLoopedClipTiles({
      clip,
      isAudioClip,
      arrangementLengthBeats,
      currentArrangementLength,
      currentStartTime,
      currentEndTime,
      totalContentLength,
      currentOffset,
      track,
      context,
    });

    updatedClips.push({ id: clip.id });
    updatedClips.push(...tiledClips);
  }

  return updatedClips;
}

interface CreateLoopedClipTilesArgs {
  clip: LiveAPI;
  isAudioClip: boolean;
  arrangementLengthBeats: number;
  currentArrangementLength: number;
  currentStartTime: number;
  currentEndTime: number;
  totalContentLength: number;
  currentOffset: number;
  track: LiveAPI;
  context: ArrangementContext;
}

/**
 * Create tiles for looped clips
 * @param options - Parameters object
 * @param options.clip - The LiveAPI clip object
 * @param options.isAudioClip - Whether the clip is an audio clip
 * @param options.arrangementLengthBeats - Target length in beats
 * @param options.currentArrangementLength - Current length in beats
 * @param options.currentStartTime - Current start time in beats
 * @param options.currentEndTime - Current end time in beats
 * @param options.totalContentLength - Total content length in beats
 * @param options.currentOffset - Current offset from loop start
 * @param options.track - The LiveAPI track object
 * @param options.context - Tool execution context
 * @returns Array of tiled clip info
 */
function createLoopedClipTiles({
  clip,
  isAudioClip,
  arrangementLengthBeats,
  currentArrangementLength,
  currentStartTime,
  currentEndTime,
  totalContentLength,
  currentOffset,
  track,
  context,
}: CreateLoopedClipTilesArgs): ClipIdResult[] {
  const updatedClips: ClipIdResult[] = [];

  // If clip not showing full content, tile with start_marker offsets
  if (currentArrangementLength < totalContentLength) {
    const remainingLength = arrangementLengthBeats - currentArrangementLength;
    const tiledClips = tileWithContext(
      clip,
      track,
      currentEndTime,
      remainingLength,
      context,
      {
        adjustPreRoll: true,
        startOffset: currentOffset + currentArrangementLength,
        tileLength: currentArrangementLength,
      },
    );

    updatedClips.push(...tiledClips);

    return updatedClips;
  }

  // If current arrangement length > total content length, shorten first then tile
  if (currentArrangementLength > totalContentLength) {
    let newEndTime = currentStartTime + totalContentLength;
    const tempClipLength = currentEndTime - newEndTime;

    // Validation
    if (newEndTime + tempClipLength !== currentEndTime) {
      throw new Error(
        `Shortening validation failed: calculation error in temp clip bounds`,
      );
    }

    // Create temp clip to truncate
    truncateWithTempClip({
      track,
      isAudioClip,
      position: newEndTime,
      length: tempClipLength,
      silenceWavPath: context.silenceWavPath as string,
    });

    newEndTime = currentStartTime + totalContentLength;
    const firstTileLength = newEndTime - currentStartTime;
    const remainingSpace = arrangementLengthBeats - firstTileLength;
    const tiledClips = tileWithContext(
      clip,
      track,
      newEndTime,
      remainingSpace,
      context,
      {
        adjustPreRoll: true,
        tileLength: firstTileLength,
      },
    );

    updatedClips.push(...tiledClips);

    return updatedClips;
  }

  // Tile the properly-sized clip
  const firstTileLength = currentEndTime - currentStartTime;
  const remainingSpace = arrangementLengthBeats - firstTileLength;
  const tiledClips = tileWithContext(
    clip,
    track,
    currentEndTime,
    remainingSpace,
    context,
    {
      adjustPreRoll: true,
      tileLength: firstTileLength,
    },
  );

  updatedClips.push(...tiledClips);

  return updatedClips;
}

interface HandleArrangementShorteningArgs {
  clip: LiveAPI;
  isAudioClip: boolean;
  arrangementLengthBeats: number;
  currentStartTime: number;
  currentEndTime: number;
  context: ArrangementContext;
}

/**
 * Handle arrangement clip shortening
 * @param options - Parameters object
 * @param options.clip - The LiveAPI clip object to shorten
 * @param options.isAudioClip - Whether the clip is an audio clip
 * @param options.arrangementLengthBeats - Target length in beats
 * @param options.currentStartTime - Current start time in beats
 * @param options.currentEndTime - Current end time in beats
 * @param options.context - Tool execution context
 */
export function handleArrangementShortening({
  clip,
  isAudioClip,
  arrangementLengthBeats,
  currentStartTime,
  currentEndTime,
  context,
}: HandleArrangementShorteningArgs): void {
  const newEndTime = currentStartTime + arrangementLengthBeats;
  const tempClipLength = currentEndTime - newEndTime;

  // Validation
  if (newEndTime + tempClipLength !== currentEndTime) {
    throw new Error(
      `Internal error: temp clip boundary calculation failed for clip ${clip.id}`,
    );
  }

  // Get track
  const trackIndex = clip.trackIndex;

  if (trackIndex == null) {
    throw new Error(
      `updateClip failed: could not determine trackIndex for clip ${clip.id}`,
    );
  }

  const track = LiveAPI.from(livePath.track(trackIndex));

  // Create temporary clip to truncate
  truncateWithTempClip({
    track,
    isAudioClip,
    position: newEndTime,
    length: tempClipLength,
    silenceWavPath: context.silenceWavPath as string,
    setupAudioClip: (tempClip: LiveAPI) => {
      // Re-apply warping and looping to arrangement clip
      tempClip.set("warping", 1);
      tempClip.set("looping", 1);
      tempClip.set("loop_end", tempClipLength);
    },
  });
}

interface TruncateWithTempClipArgs {
  track: LiveAPI;
  isAudioClip: boolean;
  position: number;
  length: number;
  silenceWavPath: string;
  setupAudioClip?: ((tempClip: LiveAPI) => void) | null;
}

/**
 * Creates and immediately deletes a temporary clip to truncate arrangement clips
 * @param options - Truncation options
 * @param options.track - Track to create temp clip on
 * @param options.isAudioClip - Whether to create audio or MIDI clip
 * @param options.position - Position for temp clip
 * @param options.length - Length of temp clip
 * @param options.silenceWavPath - Path to silence WAV (for audio clips)
 * @param options.setupAudioClip - Optional callback to setup audio temp clip
 */
function truncateWithTempClip({
  track,
  isAudioClip,
  position,
  length,
  silenceWavPath,
  setupAudioClip = null,
}: TruncateWithTempClipArgs): void {
  if (isAudioClip) {
    const { clip: sessionClip, slot } = createAudioClipInSession(
      track,
      length,
      silenceWavPath,
    );
    const tempResult = track.call(
      "duplicate_clip_to_arrangement",
      toLiveApiId(sessionClip.id),
      position,
    ) as string;
    const tempClip = LiveAPI.from(tempResult);

    if (setupAudioClip) {
      setupAudioClip(tempClip);
    }

    slot.call("delete_clip");
    track.call("delete_clip", toLiveApiId(tempClip.id));
  } else {
    const tempClipResult = track.call(
      "create_midi_clip",
      position,
      length,
    ) as string;
    const tempClip = LiveAPI.from(tempClipResult);

    track.call("delete_clip", toLiveApiId(tempClip.id));
  }
}
