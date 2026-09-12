// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { errorMessage } from "#src/shared/error-utils.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  LIVE_API_WARP_MODE_BEATS,
  LIVE_API_WARP_MODE_COMPLEX,
  LIVE_API_WARP_MODE_PRO,
  LIVE_API_WARP_MODE_REPITCH,
  LIVE_API_WARP_MODE_REX,
  LIVE_API_WARP_MODE_TEXTURE,
  LIVE_API_WARP_MODE_TONES,
  WARP_MODE,
} from "#src/tools/constants.ts";
import { audioClipTiming } from "#src/tools/clip/helpers/audio-clip-timing.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";

export interface RegionBeats {
  /** Playable region start in beats */
  startBeats: number;
  /** Playable region end in beats */
  endBeats: number;
  /** Start marker in beats, which differs from startBeats on a looping clip */
  startMarkerBeats: number;
}

/**
 * Read a clip's playable region in beats.
 *
 * MIDI markers are always beats. Audio markers are beats only while the clip is
 * warped and switch to seconds when it is not, so audio goes through
 * `audioClipTiming` to be converted and clamped to the sample.
 *
 * @param clip - LiveAPI clip object
 * @param isAudioClip - Whether the clip is an audio clip
 * @param isLooping - Whether the clip is looping
 * @returns The region and start marker in beats
 */
export function clipRegionBeats(
  clip: LiveAPI,
  isAudioClip: boolean,
  isLooping: boolean,
): RegionBeats {
  if (isAudioClip) {
    const { startBeats, endBeats, firstStartBeats } = audioClipTiming(clip);

    return { startBeats, endBeats, startMarkerBeats: firstStartBeats };
  }

  const startMarkerBeats = clip.getProperty("start_marker") as number;

  return {
    startBeats: isLooping
      ? (clip.getProperty("loop_start") as number)
      : startMarkerBeats,
    endBeats: isLooping
      ? (clip.getProperty("loop_end") as number)
      : (clip.getProperty("end_marker") as number),
    startMarkerBeats,
  };
}

interface WarpMarker {
  sampleTime: number;
  beatTime: number;
}

interface WarpMarkerData {
  sample_time: number;
  beat_time: number;
}

/** Mapping of Live API warp modes to friendly names */
export const WARP_MODE_MAPPING: Record<number, string> = {
  [LIVE_API_WARP_MODE_BEATS]: WARP_MODE.BEATS,
  [LIVE_API_WARP_MODE_TONES]: WARP_MODE.TONES,
  [LIVE_API_WARP_MODE_TEXTURE]: WARP_MODE.TEXTURE,
  [LIVE_API_WARP_MODE_REPITCH]: WARP_MODE.REPITCH,
  [LIVE_API_WARP_MODE_COMPLEX]: WARP_MODE.COMPLEX,
  [LIVE_API_WARP_MODE_REX]: WARP_MODE.REX,
  [LIVE_API_WARP_MODE_PRO]: WARP_MODE.PRO,
};

/**
 * Process warp markers for an audio clip
 * @param clip - LiveAPI clip object
 * @returns Array of warp markers or undefined
 */
export function processWarpMarkers(clip: LiveAPI): WarpMarker[] | undefined {
  try {
    const warpMarkersJson = clip.getProperty("warp_markers") as string;

    if (!warpMarkersJson || warpMarkersJson === "") {
      return undefined;
    }

    const warpMarkersData = JSON.parse(warpMarkersJson);

    // Handle both possible structures: direct array or nested in warp_markers property
    if (Array.isArray(warpMarkersData)) {
      return warpMarkersData.map(mapMarker);
    }

    if (
      warpMarkersData.warp_markers &&
      Array.isArray(warpMarkersData.warp_markers)
    ) {
      return warpMarkersData.warp_markers.map(mapMarker);
    }

    return undefined;
  } catch (error) {
    // Fail gracefully - clip might not support warp markers or format might be unexpected
    console.warn(
      `Failed to read warp markers for clip ${targetLabel(clip)}: ${errorMessage(error)}`,
    );

    return undefined;
  }
}

/**
 * Convert one raw Live warp marker into the shape read-clip reports.
 * @param marker - Raw marker as parsed from the clip's warp_markers JSON
 * @returns The marker with sample and beat times renamed
 */
function mapMarker(marker: WarpMarkerData): WarpMarker {
  return {
    sampleTime: marker.sample_time,
    beatTime: marker.beat_time,
  };
}
