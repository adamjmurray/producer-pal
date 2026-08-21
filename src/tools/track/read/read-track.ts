// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { atomToString } from "#src/shared/max/max-atoms.ts";
import { type Notation } from "#src/shared/notation.ts";
import { type ReadClipResult } from "#src/tools/clip/read/read-clip.ts";
import { getHostTrackIndex } from "#src/tools/shared/arrangement/get-host-track-index.ts";
import { getDrumMap } from "#src/tools/shared/device/device-reader.ts";
import {
  parseIncludeArray,
  READ_TRACK_DEFAULTS,
} from "#src/tools/shared/tool-framework/include-params.ts";
import { namedIdParam, stripFields } from "#src/tools/shared/utils.ts";
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
  drumModeForTrack,
  readArrangementClips,
  readMixerProperties,
  readSessionClips,
  readTakeLanes,
  type ReadTakeLaneResult,
} from "./helpers/read-track-helpers.ts";

interface ReadTrackArgs {
  trackIndex?: number;
  id?: string;
  /** Hidden alias for id */
  trackId?: string;
  trackType?: string;
  returnTrackNames?: string[];
  include?: string[];
  /**
   * Session clips on this track, when the caller already knows. A Live Set read
   * counts every clip slot for its scenes anyway, and counting again here
   * would build the whole grid a second time.
   */
  sessionClipCount?: number;
}

interface ReadTrackGenericArgs {
  track: LiveAPI;
  trackIndex: number | null;
  category?: string;
  include?: string[];
  returnTrackNames?: string[];
  notation?: Notation;
  /** See ReadTrackArgs.sessionClipCount */
  sessionClipCount?: number;
}

interface SessionClipsResult {
  sessionClips?: ReadClipResult[];
  sessionClipCount?: number;
}

interface ArrangementClipsResult {
  arrangementClips?: ReadClipResult[];
  arrangementClipCount?: number;
}

interface TakeLanesResult {
  takeLanes?: ReadTakeLaneResult[];
  takeLaneCount?: number;
}

/**
 * Read comprehensive information about a track
 * @param args - The parameters
 * @param context - Internal context object (supplies the active notation)
 * @returns Track information
 */
export function readTrack(
  args: ReadTrackArgs = {},
  context: Partial<ToolContext> = {},
): Record<string, unknown> {
  const { trackIndex, trackType, returnTrackNames } = args;
  const trackId = namedIdParam(args.id, args.trackId, "trackId");
  const category = trackType ?? "regular";

  // Validate parameters
  if (trackId == null && trackIndex == null && category !== "master") {
    throw new Error("Either id or trackIndex must be provided");
  }

  let track: LiveAPI;
  let resolvedTrackIndex: number | null | undefined = trackIndex;
  let resolvedCategory = category;

  if (trackId != null) {
    // Use the id to access the track directly and validate it's a track
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
      `Invalid trackType: ${trackType}. Must be "return" or "master", or omit for regular tracks.`,
    );
  }

  return readTrackGeneric({
    track,
    trackIndex:
      resolvedCategory === "master" ? null : (resolvedTrackIndex ?? null),
    category: resolvedCategory,
    include: args.include,
    returnTrackNames,
    notation: context.notation,
    sessionClipCount: args.sessionClipCount,
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
 * @param isDrumMode - Whether nested clip reads use drum mode (see drumModeForTrack)
 * @param include - Include array for nested reads
 * @param notation - Active notation for nested clip note formatting
 * @param knownCount - Session clips on this track, when the caller already counted them
 * @returns Object with session clips data
 */
function processSessionClips(
  track: LiveAPI,
  category: string,
  trackIndex: number | null,
  includeSessionClips: boolean,
  isDrumMode: () => boolean,
  include: string[] | undefined,
  notation: Notation | undefined,
  knownCount: number | undefined,
): SessionClipsResult {
  if (category !== "regular") {
    return includeSessionClips ? { sessionClips: [] } : { sessionClipCount: 0 };
  }

  return includeSessionClips
    ? {
        sessionClips: readSessionClips(
          track,
          trackIndex,
          isDrumMode,
          include,
          notation,
        ),
      }
    : { sessionClipCount: knownCount ?? countSessionClips(track, trackIndex) };
}

/**
 * Process arrangement clips for a track
 * @param track - Track object
 * @param trackIndex - Track index, for the lane paths
 * @param isGroup - Whether the track is a group
 * @param category - Track category (regular, return, or master)
 * @param includeArrangementClips - Whether to include full arrangement clip details
 * @param isDrumMode - Whether nested clip reads use drum mode (see drumModeForTrack)
 * @param include - Include array for nested reads
 * @param notation - Active notation for nested clip note formatting
 * @returns Object with arrangementClips array or arrangementClipCount
 */
function processArrangementClips(
  track: LiveAPI,
  isGroup: boolean,
  category: string,
  includeArrangementClips: boolean,
  isDrumMode: () => boolean,
  include: string[] | undefined,
  notation: Notation | undefined,
): ArrangementClipsResult {
  if (isGroup || category === "return" || category === "master") {
    return includeArrangementClips
      ? { arrangementClips: [] }
      : { arrangementClipCount: 0 };
  }

  return includeArrangementClips
    ? {
        arrangementClips: readArrangementClips(
          track,
          isDrumMode,
          include,
          notation,
        ),
      }
    : { arrangementClipCount: countArrangementClips(track) };
}

/**
 * Process non-main take lanes for a track. Returns the full take lane list
 * (with clips) when arrangement clips are included, otherwise just a count.
 * The field is omitted entirely when the track has no take lanes.
 * @param track - Track object
 * @param trackIndex - Track index, for the lane paths
 * @param isGroup - Whether the track is a group
 * @param category - Track category (regular, return, or master)
 * @param includeArrangementClips - Whether to include full take lane clip details
 * @param isDrumMode - Whether nested clip reads use drum mode (see drumModeForTrack)
 * @param include - Include array for nested reads
 * @param notation - Active notation for nested clip note formatting
 * @returns Object with takeLanes array, takeLaneCount, or empty
 */
function processTakeLanes(
  track: LiveAPI,
  trackIndex: number | null,
  isGroup: boolean,
  category: string,
  includeArrangementClips: boolean,
  isDrumMode: () => boolean,
  include: string[] | undefined,
  notation: Notation | undefined,
): TakeLanesResult {
  // Take lanes are arrangement-only and only exist on non-group regular tracks
  if (isGroup || category !== "regular") {
    return {};
  }

  const count = track.getChildIds("take_lanes").length;

  if (count === 0) {
    return {};
  }

  return includeArrangementClips
    ? {
        takeLanes: readTakeLanes(
          track,
          trackIndex,
          isDrumMode,
          include,
          notation,
        ),
      }
    : { takeLaneCount: count };
}

/**
 * Add drum map to result from categorized device structure
 * @param result - Result object to add drum map to
 * @param categorizedDevices - Categorized device structure with chains for drum detection
 * @param notation - Active notation; controls whether drum-map keys are drum names
 */
function addDrumMapFromDevices(
  result: Record<string, unknown>,
  categorizedDevices: CategorizedDevices,
  notation?: Notation,
): void {
  const allDevices = [
    ...categorizedDevices.midiEffects,
    ...(categorizedDevices.instrument ? [categorizedDevices.instrument] : []),
    ...categorizedDevices.audioEffects,
  ];
  const drumMap = getDrumMap(allDevices, notation);

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
 * @param args.notation - Active notation; controls whether drum-map keys are drum names
 * @param args.sessionClipCount - Session clips on this track, when the caller already counted them
 * @returns Track information including clips, devices, routing, and state
 */
export function readTrackGeneric({
  track,
  trackIndex,
  category = "regular",
  include,
  returnTrackNames,
  notation,
  sessionClipCount,
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

  const groupId = track.getPropertyList("group_track")[1];
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
    result.groupId = atomToString(groupId);
  }

  addCategoryIndex(result, category, trackIndex);

  // One drum-rack walk for all three clip reads below (see drumModeForTrack).
  const isDrumMode = drumModeForTrack(track, include);

  // Session clips
  Object.assign(
    result,
    processSessionClips(
      track,
      category,
      trackIndex,
      includeSessionClips,
      isDrumMode,
      include,
      notation,
      sessionClipCount,
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
      isDrumMode,
      include,
      notation,
    ),
  );

  // Take lanes (non-main arrangement lanes used for comping/variations)
  Object.assign(
    result,
    processTakeLanes(
      track,
      trackIndex,
      isGroup,
      category,
      includeArrangementClips,
      isDrumMode,
      include,
      notation,
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
    // The chains this walks are read only to find a kit in them, and dropped
    // straight after — chainsHidden keeps it from pricing them as output.
    const categorized = categorizeDevices(trackDevices, { chainsHidden: true });

    addDrumMapFromDevices(result, categorized, notation);
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

  // Strip fields from nested clips that are redundant with parent track
  // context. A session clip keeps its path — "t0/s3" addresses that one clip.
  // An arrangement clip's is just the track's own path, repeated per clip.
  stripFields(result.sessionClips as unknown[], "view", "type");
  stripFields(result.arrangementClips as unknown[], "path", "view", "type");

  return result;
}
