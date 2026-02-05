// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { ReadClipResult } from "#src/tools/clip/read/read-clip.ts";
import { getHostTrackIndex } from "#src/tools/shared/arrangement/get-host-track-index.ts";
import { getDrumMap } from "#src/tools/shared/device/device-reader.ts";
import {
  parseIncludeArray,
  READ_TRACK_DEFAULTS,
} from "#src/tools/shared/tool-framework/include-params.ts";
import { validateIdType } from "#src/tools/shared/validation/id-validation.ts";
import {
  categorizeDevices,
  stripChains,
  type CategorizedDevices,
} from "./helpers/read-track-device-helpers.ts";
import {
  addCategoryIndex,
  addOptionalBooleanProperties,
  addProducerPalHostInfo,
  addRoutingInfo,
  addSlotIndices,
  addStateIfNotDefault,
  cleanupDeviceChains,
  countArrangementClips,
  countSessionClips,
  handleNonExistentTrack,
  readArrangementClips,
  readMixerProperties,
  readSessionClips,
} from "./helpers/read-track-helpers.ts";

interface ReadTrackArgs {
  trackIndex?: number;
  trackId?: string;
  category?: string;
  returnTrackNames?: string[];
  include?: string[];
}

interface DeviceProcessingConfig {
  includeMidiEffects: boolean;
  includeInstruments: boolean;
  includeAudioEffects: boolean;
  includeDrumMaps: boolean;
  includeRackChains: boolean;
  isProducerPalHost: boolean;
}

interface ReadTrackGenericArgs {
  track: LiveAPI;
  trackIndex: number | null;
  category?: string;
  include?: string[];
  returnTrackNames?: string[];
}

interface SessionClipsResult {
  sessionClips?: ReadClipResult[];
  sessionClipCount?: number;
}

interface ArrangementClipsResult {
  arrangementClips?: ReadClipResult[];
  arrangementClipCount?: number;
}

/**
 * Read comprehensive information about a track
 * @param args - The parameters
 * @param _context - Internal context object (unused)
 * @returns Track information
 */
export function readTrack(
  args: ReadTrackArgs = {},
  _context: Partial<ToolContext> = {},
): Record<string, unknown> {
  const { trackIndex, trackId, category = "regular", returnTrackNames } = args;

  // Validate parameters
  if (trackId == null && trackIndex == null && category !== "master") {
    throw new Error("Either trackId or trackIndex must be provided");
  }

  let track: LiveAPI;
  let resolvedTrackIndex: number | null | undefined = trackIndex;
  let resolvedCategory = category;

  if (trackId != null) {
    // Use trackId to access track directly and validate it's a track
    track = validateIdType(trackId, "track", "readTrack");
    // Determine track category and index from the track's path
    resolvedCategory = (track.category as string | undefined) ?? "regular";
    resolvedTrackIndex = track.trackIndex ?? track.returnTrackIndex ?? null;
  } else {
    // Construct the appropriate Live API path based on track category
    let trackPath: string;

    if (category === "regular") {
      trackPath = `live_set tracks ${trackIndex}`;
    } else if (category === "return") {
      trackPath = `live_set return_tracks ${trackIndex}`;
    } else if (category === "master") {
      trackPath = "live_set master_track";
    } else {
      throw new Error(
        `Invalid category: ${category}. Must be "regular", "return", or "master".`,
      );
    }

    track = LiveAPI.from(trackPath);
  }

  return readTrackGeneric({
    track,
    trackIndex:
      resolvedCategory === "master" ? null : (resolvedTrackIndex ?? null),
    category: resolvedCategory,
    include: args.include,
    returnTrackNames,
  });
}

/**
 * Process session clips for a track
 * @param track - Track object
 * @param category - Track category (regular, return, or master)
 * @param trackIndex - Track index
 * @param includeSessionClips - Whether to include full session clip details
 * @param include - Include array for nested reads
 * @returns Object with session clips data
 */
function processSessionClips(
  track: LiveAPI,
  category: string,
  trackIndex: number | null,
  includeSessionClips: boolean,
  include: string[] | undefined,
): SessionClipsResult {
  if (category !== "regular") {
    return includeSessionClips ? { sessionClips: [] } : { sessionClipCount: 0 };
  }

  if (includeSessionClips) {
    return { sessionClips: readSessionClips(track, trackIndex, include) };
  }

  return { sessionClipCount: countSessionClips(track, trackIndex) };
}

/**
 * Process arrangement clips for a track
 * @param track - Track object
 * @param isGroup - Whether the track is a group
 * @param category - Track category (regular, return, or master)
 * @param includeArrangementClips - Whether to include full arrangement clip details
 * @param include - Include array for nested reads
 * @returns Object with arrangementClips array or arrangementClipCount
 */
function processArrangementClips(
  track: LiveAPI,
  isGroup: boolean,
  category: string,
  includeArrangementClips: boolean,
  include: string[] | undefined,
): ArrangementClipsResult {
  if (isGroup || category === "return" || category === "master") {
    return includeArrangementClips
      ? { arrangementClips: [] }
      : { arrangementClipCount: 0 };
  }

  if (includeArrangementClips) {
    return { arrangementClips: readArrangementClips(track, include) };
  }

  return { arrangementClipCount: countArrangementClips(track) };
}

/**
 * Process and categorize track devices
 * @param categorizedDevices - Object containing categorized device arrays
 * @param config - Configuration object with device processing flags
 * @returns Object with processed device arrays and optional drum map
 */
function processDevices(
  categorizedDevices: CategorizedDevices,
  config: DeviceProcessingConfig,
): Record<string, unknown> {
  const {
    includeMidiEffects,
    includeInstruments,
    includeAudioEffects,
    includeDrumMaps,
    includeRackChains,
    isProducerPalHost,
  } = config;

  const result: Record<string, unknown> = {};
  const shouldFetchChainsForDrumMaps = includeDrumMaps && !includeRackChains;

  if (includeMidiEffects) {
    result.midiEffects = shouldFetchChainsForDrumMaps
      ? categorizedDevices.midiEffects.map(stripChains)
      : categorizedDevices.midiEffects;
  }

  if (
    includeInstruments &&
    !(isProducerPalHost && categorizedDevices.instrument === null)
  ) {
    result.instrument =
      shouldFetchChainsForDrumMaps && categorizedDevices.instrument
        ? stripChains(categorizedDevices.instrument)
        : categorizedDevices.instrument;
  }

  if (includeAudioEffects) {
    result.audioEffects = shouldFetchChainsForDrumMaps
      ? categorizedDevices.audioEffects.map(stripChains)
      : categorizedDevices.audioEffects;
  }

  if (includeDrumMaps) {
    const allDevices = [
      ...categorizedDevices.midiEffects,
      ...(categorizedDevices.instrument ? [categorizedDevices.instrument] : []),
      ...categorizedDevices.audioEffects,
    ];
    const drumMap = getDrumMap(allDevices);

    if (drumMap != null) {
      result.drumMap = drumMap;
    }
  }

  return result;
}

/**
 * Generic track reader that works with any track type. This is an internal helper function
 * used by readTrack to read comprehensive information about tracks.
 * @param args - The parameters
 * @param args.track - LiveAPI track object
 * @param args.trackIndex - Track index (null for master track)
 * @param args.category - Track category: "regular", "return", or "master"
 * @param args.include - Array of data to include in the response
 * @param args.returnTrackNames - Array of return track names for sends
 * @returns Track information including clips, devices, routing, and state
 */
export function readTrackGeneric({
  track,
  trackIndex,
  category = "regular",
  include,
  returnTrackNames,
}: ReadTrackGenericArgs): Record<string, unknown> {
  const {
    includeDrumPads,
    includeDrumMaps,
    includeRackChains,
    includeReturnChains,
    includeMidiEffects,
    includeInstruments,
    includeAudioEffects,
    includeRoutings,
    includeAvailableRoutings,
    includeSessionClips,
    includeArrangementClips,
    includeColor,
    includeMixer,
  } = parseIncludeArray(include, READ_TRACK_DEFAULTS);

  if (!track.exists()) {
    return handleNonExistentTrack(category, trackIndex);
  }

  const groupId = track.get("group_track")[1];
  const isMidiTrack = (track.getProperty("has_midi_input") as number) > 0;
  const isProducerPalHost =
    category === "regular" && trackIndex === getHostTrackIndex();
  const trackDevices = track.getChildren("devices");

  // Check track capabilities to avoid warnings
  const canBeArmed = (track.getProperty("can_be_armed") as number) > 0;
  const isGroup = (track.getProperty("is_foldable") as number) > 0;

  const result: Record<string, unknown> = {
    id: track.id,
    type: isMidiTrack ? "midi" : "audio",
    name: track.getProperty("name"),
    ...(includeColor && { color: track.getColor() }),
    arrangementFollower: track.getProperty("back_to_arranger") === 0,
  };

  addOptionalBooleanProperties(result, track, canBeArmed);

  // Add mixer properties if requested
  if (includeMixer) {
    Object.assign(result, readMixerProperties(track, returnTrackNames));
  }

  if (groupId) {
    result.groupId = String(groupId);
  }

  addCategoryIndex(result, category, trackIndex);

  // Session clips
  Object.assign(
    result,
    processSessionClips(
      track,
      category,
      trackIndex,
      includeSessionClips,
      include,
    ),
  );

  // Arrangement clips
  Object.assign(
    result,
    processArrangementClips(
      track,
      isGroup,
      category,
      includeArrangementClips,
      include,
    ),
  );

  // Process devices
  const shouldFetchChainsForDrumMaps = includeDrumMaps && !includeRackChains;
  const categorizedDevices = categorizeDevices(
    trackDevices,
    includeDrumPads,
    shouldFetchChainsForDrumMaps ? true : includeRackChains,
    includeReturnChains,
  );

  const deviceResults = processDevices(categorizedDevices, {
    includeMidiEffects,
    includeInstruments,
    includeAudioEffects,
    includeDrumMaps,
    includeRackChains,
    isProducerPalHost,
  });

  Object.assign(result, deviceResults);

  cleanupDeviceChains(result);
  addSlotIndices(result, track, category);
  addStateIfNotDefault(result, track, category);

  addRoutingInfo(
    result,
    track,
    category,
    isGroup,
    canBeArmed,
    includeRoutings,
    includeAvailableRoutings,
  );

  addProducerPalHostInfo(result, isProducerPalHost);

  return result;
}
