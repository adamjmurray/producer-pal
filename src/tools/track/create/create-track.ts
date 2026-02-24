// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/v8-max-console.ts";
import { MAX_AUTO_CREATED_TRACKS } from "#src/tools/constants.ts";
import { assertDefined } from "#src/tools/shared/utils.ts";

interface CreateTrackArgs {
  trackIndex?: number;
  count?: number;
  name?: string;
  color?: string;
  type?: "midi" | "audio" | "return";
  mute?: boolean;
  solo?: boolean;
  arm?: boolean;
}

interface CreatedTrackResult {
  id: string;
  trackIndex?: number;
  returnTrackIndex?: number;
}

/**
 * Create a single track via Live API
 * @param liveSet - Live set object
 * @param type - Track type (midi, audio, return)
 * @param currentIndex - Current index for midi/audio tracks
 * @returns Track ID
 */
function createSingleTrack(
  liveSet: LiveAPI,
  type: string,
  currentIndex: number,
): string {
  let result;

  if (type === "return") {
    result = liveSet.call("create_return_track");
  } else if (type === "midi") {
    result = liveSet.call("create_midi_track", currentIndex);
  } else {
    result = liveSet.call("create_audio_track", currentIndex);
  }

  // Live API returns ["id", "123"]
  return assertDefined((result as string[])[1], "track id from result");
}

/**
 * Build track name with optional numbering
 * @param baseName - Base name for the track
 * @param count - Total number of tracks being created
 * @param index - Current track index in the batch
 * @param parsedNames - Comma-separated names (when count > 1)
 * @returns Track name
 */
function buildTrackName(
  baseName: string | undefined,
  index: number,
  parsedNames: string[] | null = null,
): string | undefined {
  if (baseName == null) return;

  // If we have parsed names from comma-separated input
  if (parsedNames != null) {
    if (index < parsedNames.length) {
      return parsedNames[index];
    }

    // No name for tracks beyond the comma-separated list
    return;
  }

  return baseName;
}

/**
 * Get color for a specific track index, cycling through parsed colors
 * @param color - Original color string
 * @param index - Current track index
 * @param parsedColors - Comma-separated colors (when count > 1)
 * @returns Color for this track
 */
function getColorForIndex(
  color: string | undefined,
  index: number,
  parsedColors: string[] | null,
): string | undefined {
  if (color == null) return;
  if (parsedColors == null) return color;

  return parsedColors[index % parsedColors.length];
}

/**
 * Parse comma-separated string when count > 1
 * @param value - Input string that may contain commas
 * @param count - Number of tracks being created
 * @returns Array of trimmed values, or null if not applicable
 */
function parseCommaSeparated(
  value: string | undefined,
  count: number,
): string[] | null {
  if (count <= 1 || !value?.includes(",")) {
    return null;
  }

  return value.split(",").map((v) => v.trim());
}

/**
 * Validate track creation parameters
 * @param count - Number of tracks to create
 * @param type - Track type
 * @param trackIndex - Track index
 * @param effectiveTrackIndex - Effective track index
 */
function validateTrackCreation(
  count: number,
  type: string,
  trackIndex: number | undefined,
  effectiveTrackIndex: number,
): void {
  if (count < 1) {
    throw new Error("createTrack failed: count must be at least 1");
  }

  if (type === "return" && trackIndex != null) {
    console.warn(
      "createTrack: trackIndex is ignored for return tracks (always added at end)",
    );
  }

  if (
    type !== "return" &&
    effectiveTrackIndex >= 0 &&
    effectiveTrackIndex + count > MAX_AUTO_CREATED_TRACKS
  ) {
    throw new Error(
      `createTrack failed: creating ${count} tracks at index ${effectiveTrackIndex} would exceed the maximum allowed tracks (${MAX_AUTO_CREATED_TRACKS})`,
    );
  }
}

/**
 * Calculate result index based on track type and creation mode
 * @param type - Track type
 * @param effectiveTrackIndex - Effective track index (-1 for append)
 * @param baseTrackCount - Base count before creation
 * @param loopIndex - Current loop index
 * @returns Result index
 */
function calculateResultIndex(
  type: string,
  effectiveTrackIndex: number,
  baseTrackCount: number,
  loopIndex: number,
): number {
  if (type === "return" || effectiveTrackIndex === -1) {
    return baseTrackCount + loopIndex;
  }

  return effectiveTrackIndex + loopIndex;
}

/**
 * Get base track count before creation for result index calculation
 * @param liveSet - Live set object
 * @param type - Track type
 * @param effectiveTrackIndex - Effective track index
 * @returns Base track count
 */
function getBaseTrackCount(
  liveSet: LiveAPI,
  type: string,
  effectiveTrackIndex: number,
): number {
  if (type === "return") {
    return liveSet.getChildIds("return_tracks").length;
  }

  if (effectiveTrackIndex === -1) {
    return liveSet.getChildIds("tracks").length;
  }

  return 0;
}

/**
 * Creates new tracks at the specified index
 * @param args - The track parameters
 * @param args.trackIndex - Track index (0-based, -1 or omit to append)
 * @param args.count - Number of tracks to create
 * @param args.name - Base name for the tracks
 * @param args.color - Color for the tracks (CSS format: hex)
 * @param args.type - Type of tracks ("midi", "audio", or "return")
 * @param args.mute - Mute state for the tracks
 * @param args.solo - Solo state for the tracks
 * @param args.arm - Arm state for the tracks
 * @param _context - Internal context object (unused)
 * @returns Single track object when count=1, array when count>1
 */
export function createTrack(
  {
    trackIndex,
    count = 1,
    name,
    color,
    type = "midi",
    mute,
    solo,
    arm,
  }: CreateTrackArgs = {},
  _context: Partial<ToolContext> = {},
): CreatedTrackResult | CreatedTrackResult[] {
  const effectiveTrackIndex = trackIndex ?? -1;

  validateTrackCreation(count, type, trackIndex, effectiveTrackIndex);

  const liveSet = LiveAPI.from(livePath.liveSet);
  const baseTrackCount = getBaseTrackCount(liveSet, type, effectiveTrackIndex);
  const createdTracks: CreatedTrackResult[] = [];
  let currentIndex = effectiveTrackIndex;

  const parsedNames = parseCommaSeparated(name, count);
  const parsedColors = parseCommaSeparated(color, count);

  for (let i = 0; i < count; i++) {
    const trackId = createSingleTrack(liveSet, type, currentIndex);
    const track = LiveAPI.from(`id ${trackId}`);

    track.setAll({
      name: buildTrackName(name, i, parsedNames),
      color: getColorForIndex(color, i, parsedColors),
      mute,
      solo,
      arm,
    });

    const resultIndex = calculateResultIndex(
      type,
      effectiveTrackIndex,
      baseTrackCount,
      i,
    );

    createdTracks.push(
      type === "return"
        ? { id: trackId, returnTrackIndex: resultIndex }
        : { id: trackId, trackIndex: resultIndex },
    );

    // For subsequent midi/audio tracks with explicit index, increment since tracks shift right
    if (type !== "return" && effectiveTrackIndex !== -1) {
      currentIndex++;
    }
  }

  // Return single object if count=1, array if count>1
  return count === 1
    ? assertDefined(createdTracks[0], "created track")
    : createdTracks;
}
