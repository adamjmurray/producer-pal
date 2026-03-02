// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { errorMessage } from "#src/shared/error-utils.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/v8-max-console.ts";
import {
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
  LIVE_API_WARP_MODE_BEATS,
  LIVE_API_WARP_MODE_COMPLEX,
  LIVE_API_WARP_MODE_PRO,
  LIVE_API_WARP_MODE_REPITCH,
  LIVE_API_WARP_MODE_REX,
  LIVE_API_WARP_MODE_TEXTURE,
  LIVE_API_WARP_MODE_TONES,
  WARP_MODE,
} from "#src/tools/constants.ts";
import { validateIdType } from "#src/tools/shared/validation/id-validation.ts";

/** Result type for resolveClip - either found clip or null response for empty slot */
export type ResolveClipResult =
  | { found: true; clip: LiveAPI }
  | { found: false; emptySlotResponse: EmptySlotResponse };

interface EmptySlotResponse {
  id: null;
  type: null;
  name: null;
  trackIndex: number;
  sceneIndex: number;
}

/**
 * Resolve clip from either clipId or trackIndex/sceneIndex
 * @param clipId - Clip ID if provided
 * @param trackIndex - Track index (required if clipId not provided)
 * @param sceneIndex - Scene index (required if clipId not provided)
 * @returns Object with either found clip or empty slot response
 */
export function resolveClip(
  clipId: string | null,
  trackIndex: number | null,
  sceneIndex: number | null,
): ResolveClipResult {
  if (clipId != null) {
    return { found: true, clip: validateIdType(clipId, "clip", "readClip") };
  }

  // Validate track exists
  const track = LiveAPI.from(livePath.track(trackIndex as number));

  if (!track.exists()) {
    throw new Error(`trackIndex ${trackIndex} does not exist`);
  }

  // Validate scene exists
  const scene = LiveAPI.from(livePath.scene(sceneIndex as number));

  if (!scene.exists()) {
    throw new Error(`sceneIndex ${sceneIndex} does not exist`);
  }

  // Track and scene exist - check if clip slot has a clip
  const clip = LiveAPI.from(
    livePath
      .track(trackIndex as number)
      .clipSlot(sceneIndex as number)
      .clip(),
  );

  if (!clip.exists()) {
    return {
      found: false,
      emptySlotResponse: {
        id: null,
        type: null,
        name: null,
        trackIndex: trackIndex as number,
        sceneIndex: sceneIndex as number,
      },
    };
  }

  return { found: true, clip };
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
      return;
    }

    const warpMarkersData = JSON.parse(warpMarkersJson);

    const mapMarker = (marker: WarpMarkerData): WarpMarker => ({
      sampleTime: marker.sample_time,
      beatTime: marker.beat_time,
    });

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
  } catch (error) {
    // Fail gracefully - clip might not support warp markers or format might be unexpected
    console.warn(
      `Failed to read warp markers for clip ${clip.id}: ${errorMessage(error)}`,
    );
  }
}

/**
 * Check if a track's instrument is a Drum Rack.
 * Iterates devices to skip MIDI effects that may precede the instrument.
 * @param trackIndex - Track index (0-based)
 * @returns True if the first instrument device is a Drum Rack
 */
export function isDrumRackTrack(trackIndex: number): boolean {
  const track = LiveAPI.from(livePath.track(trackIndex));
  const devices = track.getChildren("devices");

  for (const device of devices) {
    if (device.getProperty("type") === LIVE_API_DEVICE_TYPE_INSTRUMENT) {
      return (device.getProperty("can_have_drum_pads") as number) > 0;
    }
  }

  return false;
}
