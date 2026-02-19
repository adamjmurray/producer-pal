// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { type ReadClipResult } from "#src/tools/clip/read/read-clip.ts";
import { getHostTrackIndex } from "#src/tools/shared/arrangement/get-host-track-index.ts";
import { getDrumMap } from "#src/tools/shared/device/device-reader.ts";
import {
  parseIncludeArray,
  READ_TRACK_DEFAULTS,
} from "#src/tools/shared/tool-framework/include-params.ts";
import { stripFields } from "#src/tools/shared/utils.ts";
import { validateIdType } from "#src/tools/shared/validation/id-validation.ts";
import {
  categorizeDevices,
  readDevicesFlat,
  type CategorizedDevices,
} from "./helpers/read-track-device-helpers.ts";
import {
  addCategoryIndex,
  addOptionalBooleanProperties,
  addProducerPalHostInfo,
  addRoutingInfo,
  addSlotIndices,
  addStateIfNotDefault,
  countArrangementClips,
  countSessionClips,
  getInstrumentName,
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
  } else if (category === "regular") {
    track = LiveAPI.from(livePath.track(trackIndex as number)); // validated above
  } else if (category === "return") {
    track = LiveAPI.from(livePath.returnTrack(trackIndex as number)); // validated above
  } else if (category === "master") {
    track = LiveAPI.from(livePath.masterTrack());
  } else {
    throw new Error(
      `Invalid category: ${category}. Must be "regular", "return", or "master".`,
    );
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
 * Compute merged track type from MIDI flag and category
 * @param isMidiTrack - Whether the track has MIDI input
 * @param category - Internal category: "regular", "return", or "master"
 * @returns Merged type: "midi", "audio", "return", or "master"
 */
function computeTrackType(isMidiTrack: boolean, category: string): string {
  if (category === "return") return "return";
  if (category === "master") return "master";

  return isMidiTrack ? "midi" : "audio";
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

  return includeSessionClips
    ? { sessionClips: readSessionClips(track, trackIndex, include) }
    : { sessionClipCount: countSessionClips(track, trackIndex) };
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

  return includeArrangementClips
    ? { arrangementClips: readArrangementClips(track, include) }
    : { arrangementClipCount: countArrangementClips(track) };
}

/**
 * Add drum map to result from categorized device structure
 * @param result - Result object to add drum map to
 * @param categorizedDevices - Categorized device structure with chains for drum detection
 */
function addDrumMapFromDevices(
  result: Record<string, unknown>,
  categorizedDevices: CategorizedDevices,
): void {
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
    includeDrumMap,
    includeDevices,
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
    type: computeTrackType(isMidiTrack, category),
    name: track.getProperty("name"),
    ...(includeColor && { color: track.getColor() }),
    // arrangementFollower: track.getProperty("back_to_arranger") === 0,
  };

  addOptionalBooleanProperties(result, track, canBeArmed);

  // Instrument name (always included if present)
  const instrumentName = getInstrumentName(trackDevices);

  if (instrumentName != null) {
    result.instrument = instrumentName;
  }

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

  // Device processing
  if (includeDevices) {
    // Flat device list preserving original track device order
    const flatDevices = readDevicesFlat(trackDevices, isProducerPalHost);

    if (flatDevices != null) {
      result.devices = flatDevices;
    }
  } else {
    result.deviceCount = trackDevices.length;
  }

  if (includeDrumMap) {
    const categorized = categorizeDevices(trackDevices, false, true, false);

    addDrumMapFromDevices(result, categorized);
  }

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

  // Strip fields from nested clips that are redundant with parent track context
  stripFields(
    result.sessionClips as Record<string, unknown>[],
    "trackIndex",
    "view",
    "type",
  );
  stripFields(
    result.arrangementClips as Record<string, unknown>[],
    "trackIndex",
    "view",
    "type",
  );

  return result;
}
