// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Shared helpers for arrangement clip tiling operations.
 * These functions handle the complex logic of shortening, moving, and tiling
 * arrangement clips using the holding area technique.
 */

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { assertDefined, toLiveApiId } from "#src/tools/shared/utils.ts";

export interface TilingContext {
  /** Path to silence WAV file for audio clip operations */
  silenceWavPath: string;
}

interface SessionClipResult {
  clip: LiveAPI;
  slot: LiveAPI;
}

interface HoldingClipResult {
  holdingClipId: string;
  holdingClip: LiveAPI;
}

interface TileClipOptions {
  /** Whether to adjust pre-roll on subsequent tiles */
  adjustPreRoll?: boolean;
  /** Content offset in beats to start tiling from */
  startOffset?: number;
  /** Arrangement length per tile (defaults to clip content length) */
  tileLength?: number | null;
}

interface CreatedClip {
  id: string;
}

/**
 * Creates an audio clip in session view with controlled length.
 * Uses session view because create_audio_clip in arrangement doesn't support length control.
 *
 * @param track - LiveAPI track instance
 * @param targetLength - Desired clip length in beats
 * @param audioFilePath - Path to audio WAV file (can be silence.wav or actual audio)
 * @returns The created clip and slot in session view
 */
export function createAudioClipInSession(
  track: LiveAPI,
  targetLength: number,
  audioFilePath: string,
): SessionClipResult {
  const liveSet = LiveAPI.from(livePath.liveSet);
  let sceneIds = liveSet.getChildIds("scenes");
  const lastSceneId = assertDefined(sceneIds.at(-1), "last scene ID");
  const lastScene = LiveAPI.from(lastSceneId);

  // Check if last scene is empty, if not create a new one
  const isEmpty = lastScene.getProperty("is_empty") === 1;
  let workingSceneId = lastSceneId;

  if (!isEmpty) {
    const newSceneResult = liveSet.call("create_scene", sceneIds.length) as
      | string[]
      | string;

    // LiveAPI.call returns an array like ["id", "833"], join it with space to match getChildIds format
    workingSceneId = Array.isArray(newSceneResult)
      ? newSceneResult.join(" ")
      : newSceneResult;
    // Refresh scene IDs after creating new scene
    sceneIds = liveSet.getChildIds("scenes");
  }

  // Get track index to find corresponding clip slot
  const trackIndex = track.trackIndex as number;
  const sceneIndex = sceneIds.indexOf(workingSceneId);

  // Create clip in session slot with audio file
  const slot = LiveAPI.from(livePath.track(trackIndex).clipSlot(sceneIndex));

  // create_audio_clip requires a file path
  slot.call("create_audio_clip", audioFilePath);

  // Get the created clip by reconstructing the path
  const clip = LiveAPI.from(
    livePath.track(trackIndex).clipSlot(sceneIndex).clip(),
  );

  // Enable warping and looping, then set length via loop_end
  clip.set("warping", 1);
  clip.set("looping", 1);
  clip.set("loop_end", targetLength);

  // Return both clip and slot for cleanup
  return { clip, slot };
}

/**
 * Creates and immediately deletes a temp clip at a position.
 * Used to trim adjacent clips via Ableton's overlap behavior.
 * For MIDI: creates directly in arrangement. For audio: creates in session then duplicates.
 * @param track - LiveAPI track instance
 * @param position - Position to create temp clip at
 * @param length - Length of temp clip in beats
 * @param isMidiClip - Whether the track is MIDI (true) or audio (false)
 * @param context - Context object with silenceWavPath for audio clips
 */
export function createAndDeleteTempClip(
  track: LiveAPI,
  position: number,
  length: number,
  isMidiClip: boolean,
  context: TilingContext,
): void {
  if (isMidiClip) {
    const tempResult = track.call("create_midi_clip", position, length) as [
      string,
      string | number,
    ];
    const tempClip = LiveAPI.from(tempResult);

    track.call("delete_clip", toLiveApiId(tempClip.id));
  } else {
    const { clip: sessionClip, slot } = createAudioClipInSession(
      track,
      length,
      context.silenceWavPath,
    );

    const tempResult = track.call(
      "duplicate_clip_to_arrangement",
      toLiveApiId(sessionClip.id),
      position,
    ) as [string, string | number];
    const tempClip = LiveAPI.from(tempResult);

    slot.call("delete_clip");
    track.call("delete_clip", toLiveApiId(tempClip.id));
  }
}

/**
 * Creates a shortened copy of a clip in the holding area.
 * Uses the temp clip shortening technique to achieve the target length.
 *
 * @param sourceClip - LiveAPI clip instance to duplicate
 * @param track - LiveAPI track instance
 * @param targetLength - Desired clip length in beats
 * @param holdingAreaStart - Start position of holding area in beats
 * @param isMidiClip - Whether the clip is MIDI (true) or audio (false)
 * @param context - Context object with silenceWavPath for audio clips
 * @returns Holding clip ID and instance
 */
export function createShortenedClipInHolding(
  sourceClip: LiveAPI,
  track: LiveAPI,
  targetLength: number,
  holdingAreaStart: number,
  isMidiClip: boolean,
  context: TilingContext,
): HoldingClipResult {
  // Store clip ID to prevent object staleness issues
  // sourceClip.id returns just the numeric ID string (e.g., "547")
  const sourceClipId = sourceClip.id;

  // Duplicate source clip to holding area
  const holdingResult = track.call(
    "duplicate_clip_to_arrangement",
    toLiveApiId(sourceClipId),
    holdingAreaStart,
  ) as [string, string | number];
  const holdingClip = LiveAPI.from(holdingResult);

  // Shorten holding clip to target length using temp clip technique
  const holdingClipEnd = holdingClip.getProperty("end_time") as number;
  const newHoldingEnd = holdingAreaStart + targetLength;
  const tempLength = holdingClipEnd - newHoldingEnd;

  // Only create temp clip if there's actually something to truncate
  // Use small epsilon to handle floating-point precision
  const EPSILON = 0.001;

  if (tempLength > EPSILON) {
    createAndDeleteTempClip(
      track,
      newHoldingEnd,
      tempLength,
      isMidiClip,
      context,
    );
  }

  return {
    holdingClipId: holdingClip.id,
    holdingClip,
  };
}

/**
 * Moves a clip from the holding area to a target position.
 * Duplicates the holding clip to the target, then cleans up the holding clip.
 *
 * @param holdingClipId - ID of clip in holding area
 * @param track - LiveAPI track instance
 * @param targetPosition - Target position in beats
 * @returns The moved clip (LiveAPI instance)
 */
export function moveClipFromHolding(
  holdingClipId: string,
  track: LiveAPI,
  targetPosition: number,
): LiveAPI {
  // Duplicate holding clip to target position
  const finalResult = track.call(
    "duplicate_clip_to_arrangement",
    toLiveApiId(holdingClipId),
    targetPosition,
  ) as string;
  const movedClip = LiveAPI.from(finalResult);

  // Clean up holding area
  track.call("delete_clip", toLiveApiId(holdingClipId));

  return movedClip;
}

/**
 * Adjusts a clip's pre-roll by setting start_marker to loop_start and shortening.
 * Only performs adjustment if the clip has pre-roll (start_marker < loop_start).
 *
 * @param clip - LiveAPI clip instance
 * @param track - LiveAPI track instance
 * @param isMidiClip - Whether the clip is MIDI (true) or audio (false)
 * @param context - Context object with silenceWavPath for audio clips
 */
export function adjustClipPreRoll(
  clip: LiveAPI,
  track: LiveAPI,
  isMidiClip: boolean,
  context: TilingContext,
): void {
  const startMarker = clip.getProperty("start_marker") as number;
  const loopStart = clip.getProperty("loop_start") as number;

  // Only adjust if clip has pre-roll
  if (startMarker < loopStart) {
    // Set start_marker to loop_start
    clip.set("start_marker", loopStart);

    // Shorten clip by the pre-roll amount
    const preRollLength = loopStart - startMarker;
    const clipEnd = clip.getProperty("end_time") as number;
    const newClipEnd = clipEnd - preRollLength;
    const tempClipLength = clipEnd - newClipEnd;

    createAndDeleteTempClip(
      track,
      newClipEnd,
      tempClipLength,
      isMidiClip,
      context,
    );
  }
}

/**
 * Creates a partial tile of a clip at a target position.
 * Combines: create shortened clip in holding → move to target → optionally adjust pre-roll.
 *
 * @param sourceClip - LiveAPI clip instance to tile
 * @param track - LiveAPI track instance
 * @param targetPosition - Target position in beats
 * @param partialLength - Length of partial tile in beats
 * @param holdingAreaStart - Start position of holding area in beats
 * @param isMidiClip - Whether the clip is MIDI (true) or audio (false)
 * @param context - Context object with silenceWavPath for audio clips
 * @param adjustPreRoll - Whether to adjust pre-roll on the created tile
 * @param contentOffset - Content offset in beats for start_marker
 * @returns The created partial tile clip (LiveAPI instance)
 */
export function createPartialTile(
  sourceClip: LiveAPI,
  track: LiveAPI,
  targetPosition: number,
  partialLength: number,
  holdingAreaStart: number,
  isMidiClip: boolean,
  context: TilingContext,
  adjustPreRoll = true,
  contentOffset = 0,
): LiveAPI {
  // Create shortened clip in holding area
  const { holdingClipId } = createShortenedClipInHolding(
    sourceClip,
    track,
    partialLength,
    holdingAreaStart,
    isMidiClip,
    context,
  );

  // Move from holding to target position
  const partialTile = moveClipFromHolding(holdingClipId, track, targetPosition);

  // Set start_marker to show correct portion of clip content
  const clipLoopStart = sourceClip.getProperty("loop_start") as number;
  const clipLoopEnd = sourceClip.getProperty("loop_end") as number;
  const clipLength = clipLoopEnd - clipLoopStart;
  const tileStartMarker = clipLoopStart + (contentOffset % clipLength);

  partialTile.set("start_marker", tileStartMarker);

  // Optionally adjust pre-roll
  if (adjustPreRoll) {
    adjustClipPreRoll(partialTile, track, isMidiClip, context);
  }

  return partialTile;
}

/**
 * Tiles a clip across a range by creating full tiles and a partial final tile.
 * High-level orchestrator that handles the complete tiling operation.
 *
 * @param sourceClip - LiveAPI clip instance to tile
 * @param track - LiveAPI track instance
 * @param startPosition - Start position for tiling in beats
 * @param totalLength - Total length to fill with tiles in beats
 * @param holdingAreaStart - Start position of holding area in beats
 * @param context - Context object with silenceWavPath for audio clips
 * @param options - Configuration options
 * @param options.adjustPreRoll - Whether to adjust pre-roll on subsequent tiles
 * @param options.startOffset - Content offset in beats to start tiling from
 * @param options.tileLength - Arrangement length per tile (defaults to clip content length)
 * @returns Array of created clip objects with id property
 */
export function tileClipToRange(
  sourceClip: LiveAPI,
  track: LiveAPI,
  startPosition: number,
  totalLength: number,
  holdingAreaStart: number,
  context: TilingContext,
  {
    adjustPreRoll = true,
    startOffset = 0,
    tileLength = null,
  }: TileClipOptions = {},
): CreatedClip[] {
  const createdClips: CreatedClip[] = [];

  // Store clip ID and track index before loop to prevent object staleness issues
  const sourceClipId = sourceClip.id;
  const trackIndex = sourceClip.trackIndex;

  // Detect if clip is MIDI or audio for proper clip creation method
  const isMidiClip = sourceClip.getProperty("is_midi_clip") === 1;

  // Get clip loop length for tiling
  const clipLoopStart = sourceClip.getProperty("loop_start") as number;
  const clipLoopEnd = sourceClip.getProperty("loop_end") as number;
  const clipLength = clipLoopEnd - clipLoopStart;

  // Safety mechanism: Ensure end_marker is set to loop_end before tiling
  // This prevents "invalid syntax" errors when setting start_marker on duplicates
  // (start_marker cannot exceed end_marker)
  const currentEndMarker = sourceClip.getProperty("end_marker") as number;

  if (currentEndMarker !== clipLoopEnd) {
    sourceClip.set("end_marker", clipLoopEnd);
  }

  // Determine arrangement length per tile (defaults to clip content length)
  const arrangementTileLength = tileLength ?? clipLength;

  // Calculate tiling requirements based on arrangement tile length
  const fullTiles = Math.floor(totalLength / arrangementTileLength);
  const remainder = totalLength % arrangementTileLength;

  // Track content offset for setting start_marker on each tile
  let currentContentOffset = startOffset;

  // Create full tiles
  let currentPosition = startPosition;

  for (let i = 0; i < fullTiles; i++) {
    // Create fresh track object for each iteration to avoid staleness issues
    const freshTrack = LiveAPI.from(livePath.track(trackIndex as number));

    // Full tiles ALWAYS use simple duplication (regardless of arrangementTileLength vs clipLength)
    const result = freshTrack.call(
      "duplicate_clip_to_arrangement",
      toLiveApiId(sourceClipId),
      currentPosition,
    ) as [string, string | number];

    const tileClip = LiveAPI.from(result);
    const clipId = tileClip.id;

    // Recreate LiveAPI object with fresh reference
    const freshClip = LiveAPI.from(toLiveApiId(clipId));

    // Set start_marker to show correct portion of clip content
    let tileStartMarker = clipLoopStart + (currentContentOffset % clipLength);

    // Wrap start_marker if it would equal or exceed loop_end
    if (tileStartMarker >= clipLoopEnd) {
      tileStartMarker = clipLoopStart;
    }

    // Try setting on fresh clip object
    freshClip.set("start_marker", tileStartMarker);

    // Adjust pre-roll for subsequent tiles if requested
    if (adjustPreRoll) {
      adjustClipPreRoll(freshClip, freshTrack, isMidiClip, context);
    }

    createdClips.push({ id: clipId });
    currentPosition += arrangementTileLength; // Space tiles at arrangement intervals
    currentContentOffset += arrangementTileLength; // Advance through content
  }

  // Handle partial final tile if remainder exists
  if (remainder > 0.001) {
    const partialTile = createPartialTile(
      sourceClip,
      track,
      currentPosition,
      remainder,
      holdingAreaStart,
      isMidiClip,
      context,
      adjustPreRoll,
      currentContentOffset,
    );

    createdClips.push({ id: partialTile.id });
  }

  return createdClips;
}
