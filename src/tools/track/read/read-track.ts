// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { atomToString } from "#src/shared/max/max-atoms.ts";
import { type Notation } from "#src/shared/notation.ts";
import { type ReadClipResult } from "#src/tools/clip/read/read-clip.ts";
import { getHostTrackIndex } from "#src/tools/shared/arrangement/get-host-track-index.ts";
import {
  findDrumRack,
  getDrumMap,
} from "#src/tools/shared/device/device-reader.ts";
import {
  expandWildcardIncludes,
  parseIncludeArray,
  READ_TRACK_DEFAULTS,
} from "#src/tools/shared/tool-framework/include-params.ts";
import { stripFields } from "#src/tools/shared/utils.ts";
import { pathField } from "#src/tools/shared/validation/object-path-for-api.ts";
import { trackTypeField } from "#src/tools/track/helpers/track-type-helpers.ts";
import {
  resolveReadTrackTarget,
  type ReadTrackArgs,
} from "./helpers/read-track-target-helpers.ts";
import {
  categorizeDevices,
  readDevicesFlat,
  type CategorizedDevices,
} from "./helpers/read-track-device-helpers.ts";
import {
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

/** What every nested clip read under a track read needs. */
interface NestedClipReads {
  /** Whether the reads use drum mode (see drumModeForTrack) */
  isDrumMode: () => boolean;
  /** Include options, already expanded (see expandWildcardIncludes) */
  include: string[] | undefined;
  /** Active notation for note formatting */
  notation: Notation | undefined;
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
  const { track, category, trackIndex } = resolveReadTrackTarget(args);

  return readTrackGeneric({
    track,
    trackIndex: category === "master" ? null : trackIndex,
    category,
    include: args.include,
    returnTrackNames: args.returnTrackNames,
    notation: context.notation,
    sessionClipCount: args.sessionClipCount,
  });
}

/**
 * Process session clips for a track
 * @param track - Track object
 * @param category - Track category (regular, return, or master)
 * @param trackIndex - Track index
 * @param includeSessionClips - Whether to include full session clip details
 * @param nested - What the nested clip reads need
 * @param knownCount - Session clips on this track, when the caller already counted them
 * @returns Object with session clips data
 */
function processSessionClips(
  track: LiveAPI,
  category: string,
  trackIndex: number | null,
  includeSessionClips: boolean,
  nested: NestedClipReads,
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
          nested.isDrumMode,
          nested.include,
          nested.notation,
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
 * @param nested - What the nested clip reads need
 * @returns Object with arrangementClips array or arrangementClipCount
 */
function processArrangementClips(
  track: LiveAPI,
  isGroup: boolean,
  category: string,
  includeArrangementClips: boolean,
  nested: NestedClipReads,
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
          nested.isDrumMode,
          nested.include,
          nested.notation,
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
 * @param nested - What the nested clip reads need
 * @returns Object with takeLanes array, takeLaneCount, or empty
 */
function processTakeLanes(
  track: LiveAPI,
  trackIndex: number | null,
  isGroup: boolean,
  category: string,
  includeArrangementClips: boolean,
  nested: NestedClipReads,
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
          nested.isDrumMode,
          nested.include,
          nested.notation,
        ),
      }
    : { takeLaneCount: count };
}

/**
 * Gather what the session, arrangement and take-lane clip reads share: the
 * expanded include options (see expandWildcardIncludes) and one drum-rack walk
 * for all three reads (see drumModeForTrack).
 * @param track - Track object
 * @param include - Include array as read-track received it
 * @param notation - Active notation for nested clip note formatting
 * @returns What the nested clip reads need
 */
function nestedClipReads(
  track: LiveAPI,
  include: string[] | undefined,
  notation: Notation | undefined,
): NestedClipReads {
  const expanded = expandWildcardIncludes(include, READ_TRACK_DEFAULTS);

  return {
    isDrumMode: drumModeForTrack(track, expanded),
    include: expanded,
    notation,
  };
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
  const drumRack = findDrumRack(allDevices);

  if (drumRack != null) {
    result.drumMap = getDrumMap(allDevices, notation);
    result.drumRackPath = drumRack.path;
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
    ...pathField(track),
    ...trackTypeField(isMidiTrack, category),
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

  const nested = nestedClipReads(track, include, notation);

  // Session clips
  Object.assign(
    result,
    processSessionClips(
      track,
      category,
      trackIndex,
      includeSessionClips,
      nested,
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
      nested,
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
      nested,
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
  // context. Every clip keeps its path: "t0/s3" and "t0[5|1]" each address one
  // clip, which the track's own path doesn't.
  stripFields(result.sessionClips as unknown[], "view", "type");
  stripFields(result.arrangementClips as unknown[], "view", "type");

  return result;
}
