// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { errorMessage } from "#src/shared/error-utils.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
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
import { validateIdType } from "#src/tools/shared/validation/id-validation.ts";
import { parseObjectPath } from "#src/tools/shared/validation/object-path.ts";
import {
  namedHiddenPath,
  requireSessionSlot,
  slotPath,
} from "#src/tools/shared/validation/object-path-helpers.ts";
import { parseSlot } from "#src/tools/shared/validation/position-parsing.ts";
import { namedParam } from "#src/tools/shared/utils.ts";

/** Result type for resolveClip - either found clip or null response for empty slot */
export type ResolveClipResult =
  | { found: true; clip: LiveAPI }
  | { found: false; emptySlotResponse: EmptySlotResponse };

interface EmptySlotResponse {
  id: null;
  type: null;
  name: null;
  path: string;
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
    throw new Error(`no track at "t${trackIndex}"`);
  }

  // Validate scene exists
  const scene = LiveAPI.from(livePath.scene(sceneIndex as number));

  if (!scene.exists()) {
    throw new Error(`no scene at "s${sceneIndex}"`);
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
        path: slotPath(trackIndex as number, sceneIndex as number),
      },
    };
  }

  return { found: true, clip };
}

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
      `Failed to read warp markers for clip ${clip.id}: ${errorMessage(error)}`,
    );

    return undefined;
  }
}

/**
 * Check if a track contains a Drum Rack anywhere in its device tree.
 * A Drum Rack nested inside instrument rack chains (at any depth, in any chain)
 * still puts the track in drum mode, so the whole tree is searched recursively.
 * @param trackIndex - Track index (0-based)
 * @returns True if any device (including nested rack devices) is a Drum Rack
 */
export function isDrumRackTrack(trackIndex: number): boolean {
  return isDrumRackForTrack(LiveAPI.from(livePath.track(trackIndex)));
}

/**
 * Drum-mode check for a track object already in hand. Batch readers that walk N
 * clips of one track call this once instead of paying a full device-tree walk
 * per clip via {@link isDrumRackTrack}.
 * @param track - LiveAPI track object
 * @returns True if any device (including nested rack devices) is a Drum Rack
 */
export function isDrumRackForTrack(track: LiveAPI): boolean {
  return devicesContainDrumRack(track.getChildren("devices"));
}

/**
 * Recursively search a device list for a Drum Rack, descending into rack chains.
 * @param devices - LiveAPI device objects to inspect
 * @returns True if a Drum Rack is found in the list or any nested chain
 */
function devicesContainDrumRack(devices: LiveAPI[]): boolean {
  for (const device of devices) {
    if ((device.getProperty("can_have_drum_pads") as number) > 0) {
      return true;
    }

    if ((device.getProperty("can_have_chains") as number) > 0) {
      for (const chain of device.getChildren("chains")) {
        if (devicesContainDrumRack(chain.getChildren("devices"))) {
          return true;
        }
      }
    }
  }

  return false;
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

/** The read-clip params that say which clip to read. */
interface ClipLocationArgs {
  path?: string | null;
  slot?: string | null;
  clipId?: string | null;
  trackIndex?: number | null;
  sceneIndex?: number | null;
}

interface ClipLocation {
  clipId: string | null;
  trackIndex: number | null;
  sceneIndex: number | null;
}

/**
 * Resolve clip location from args. `path` wins, then the deprecated `slot`,
 * then the trackIndex/sceneIndex pair — which doubles as the hidden alias and
 * as how batch readers pass indices they already parsed.
 * @param args - The location params as read-clip received them
 * @returns Resolved clipId, trackIndex, and sceneIndex
 */
export function resolveClipLocation(args: ClipLocationArgs): ClipLocation {
  const clipId = namedParam(args.clipId, "clipId") ?? null;
  const path = namedParam(args.path, "path");
  const slot = namedHiddenPath(args.slot ?? undefined);

  // Honoring one and dropping the other is the silent wrong-clip bug path
  // replaces, so refuse instead of picking — the same trade every other tool
  // takes.
  if (path != null && slot != null) {
    throw new Error(
      "readClip failed: path and slot both name a clip; use path alone (slot is deprecated)",
    );
  }

  if (path != null) {
    // The aliases are a fallback for a caller that did not use path.
    if (args.trackIndex != null || args.sceneIndex != null) {
      console.warn(
        'readClip: trackIndex/sceneIndex ignored — "path" already names the clip',
      );
    }

    const position = requireSessionSlot(parseObjectPath(path, "path"));

    assertClipIdAtSlot(clipId, position);

    return { clipId, ...position };
  }

  if (slot != null) {
    return { clipId, ...parseSlot(slot) };
  }

  return {
    clipId,
    trackIndex: args.trackIndex ?? null,
    sceneIndex: args.sceneIndex ?? null,
  };
}

/**
 * Refuse a clipId naming a clip other than the one the path names. clipId used
 * to win in silence, so a stale id pasted beside a fresh path read the stale
 * clip and reported its own slot as if that's what was asked for.
 * @param clipId - The clipId param, if the caller sent one
 * @param position - The slot the path names
 * @param position.trackIndex - Track index
 * @param position.sceneIndex - Scene index
 */
function assertClipIdAtSlot(
  clipId: string | null,
  { trackIndex, sceneIndex }: { trackIndex: number; sceneIndex: number },
): void {
  if (clipId == null) return;

  const named = LiveAPI.from(clipId);

  // An id naming nothing is validateIdType's error to report, not this one's.
  if (!named.exists()) return;

  const atPath = livePath.track(trackIndex).clipSlot(sceneIndex).clip();

  if (named.path !== atPath) {
    throw new Error(
      "readClip failed: path and clipId name different clips; use one",
    );
  }
}
