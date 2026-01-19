import * as console from "#src/shared/v8-max-console.js";
import { VERSION } from "#src/shared/version.js";
import { readClip } from "#src/tools/clip/read/read-clip.js";
import { STATE } from "#src/tools/constants.js";
import { cleanupInternalDrumPads } from "#src/tools/shared/device/device-reader.js";
import { computeState } from "#src/tools/shared/device/helpers/device-state-helpers.js";
import {
  processAvailableRouting,
  processCurrentRouting,
} from "#src/tools/track/helpers/track-routing-helpers.js";

interface ClipResult {
  id: string | null;
  name?: string;
  type?: string;
}

interface MinimalTrackIncludeFlags {
  includeSessionClips: boolean;
  includeArrangementClips: boolean;
  includeAllClips?: boolean;
}

interface MinimalTrackResult {
  id: string | null;
  type: string | null;
  trackIndex: number;
  sessionClips?: ClipResult[];
  sessionClipCount?: number;
  arrangementClips?: ClipResult[];
  arrangementClipCount?: number;
}

interface DeviceResult {
  midiEffects?: object[];
  instrument?: object | null;
  audioEffects?: object[];
}

interface SendInfo {
  gainDb: unknown;
  return: string;
}

interface MixerResult {
  gainDb?: unknown;
  panningMode?: string;
  pan?: unknown;
  leftPan?: unknown;
  rightPan?: unknown;
  sends?: SendInfo[];
}

/**
 * Read all session clips from a track
 * @param track - Track object
 * @param trackIndex - Track index
 * @param include - Include array for nested reads
 * @returns Array of clip objects (only clips that exist)
 */
export function readSessionClips(
  track: LiveAPI,
  trackIndex: number | null,
  include?: string[],
): ClipResult[] {
  return track
    .getChildIds("clip_slots")
    .map(
      (_clipSlotId, sceneIndex) =>
        readClip({
          trackIndex,
          sceneIndex,
          ...(include && { include }),
        }) as unknown as ClipResult,
    )
    .filter((clip) => clip.id != null);
}

/**
 * Count session clips in a track (faster than reading full clip details)
 * @param track - Track object
 * @param trackIndex - Track index
 * @returns Number of clips
 */
export function countSessionClips(
  track: LiveAPI,
  trackIndex: number | null,
): number {
  return track
    .getChildIds("clip_slots")
    .map((_clipSlotId, sceneIndex) => {
      const clip = LiveAPI.from(
        `live_set tracks ${trackIndex} clip_slots ${sceneIndex} clip`,
      );

      return clip.exists() ? clip : null;
    })
    .filter(Boolean).length;
}

/**
 * Read all arrangement clips from a track
 * @param track - Track object
 * @param include - Include array for nested reads
 * @returns Array of clip objects (only clips that exist)
 */
export function readArrangementClips(
  track: LiveAPI,
  include?: string[],
): ClipResult[] {
  return track
    .getChildIds("arrangement_clips")
    .map(
      (clipId) =>
        readClip({
          clipId,
          ...(include && { include }),
        }) as unknown as ClipResult,
    )
    .filter((clip) => clip.id != null);
}

/**
 * Count arrangement clips in a track
 * @param track - Track object
 * @returns Number of clips
 */
export function countArrangementClips(track: LiveAPI): number {
  return track.getChildIds("arrangement_clips").length;
}

/**
 * Read minimal track information for auto-inclusion when clips are requested.
 * Returns only id, type, trackIndex, and clip arrays/counts based on include flags.
 * @param args - The parameters
 * @param args.trackIndex - Track index
 * @param args.includeFlags - Parsed include flags
 * @returns Minimal track information
 */
export function readTrackMinimal({
  trackIndex,
  includeFlags,
}: {
  trackIndex: number;
  includeFlags: MinimalTrackIncludeFlags;
}): MinimalTrackResult {
  const track = LiveAPI.from(`live_set tracks ${trackIndex}`);

  if (!track.exists()) {
    return {
      id: null,
      type: null,
      trackIndex,
    };
  }

  const isMidiTrack = (track.getProperty("has_midi_input") as number) > 0;

  const result: MinimalTrackResult = {
    id: track.id,
    type: isMidiTrack ? "midi" : "audio",
    trackIndex,
  };

  // Session clips - only for regular tracks
  if (includeFlags.includeSessionClips || includeFlags.includeAllClips) {
    result.sessionClips = readSessionClips(track, trackIndex);
  } else {
    result.sessionClipCount = countSessionClips(track, trackIndex);
  }

  // Arrangement clips - exclude group tracks which have no arrangement clips
  const isGroup = (track.getProperty("is_foldable") as number) > 0;

  if (isGroup) {
    if (includeFlags.includeArrangementClips || includeFlags.includeAllClips) {
      result.arrangementClips = [];
    } else {
      result.arrangementClipCount = 0;
    }
  } else if (
    includeFlags.includeArrangementClips ||
    includeFlags.includeAllClips
  ) {
    result.arrangementClips = readArrangementClips(track);
  } else {
    result.arrangementClipCount = countArrangementClips(track);
  }

  return result;
}

/**
 * Handle track that doesn't exist
 * @param category - Track category (regular, return, or master)
 * @param trackIndex - Track index
 * @returns Result object for non-existent track
 */
export function handleNonExistentTrack(
  category: string,
  trackIndex: number | null,
): Record<string, unknown> {
  const result: Record<string, unknown> = {
    id: null,
    type: null,
    name: null,
  };

  if (category === "regular") {
    result.trackIndex = trackIndex;
  } else if (category === "return") {
    result.returnTrackIndex = trackIndex;
  } else if (category === "master") {
    result.trackIndex = null;
  }

  return result;
}

/**
 * Add optional boolean properties to track result
 * @param result - Result object to modify
 * @param track - Track object
 * @param canBeArmed - Whether the track can be armed
 */
export function addOptionalBooleanProperties(
  result: Record<string, unknown>,
  track: LiveAPI,
  canBeArmed: boolean,
): void {
  const isArmed = canBeArmed ? (track.getProperty("arm") as number) > 0 : false;

  if (isArmed) {
    result.isArmed = isArmed;
  }

  const isGroup = (track.getProperty("is_foldable") as number) > 0;

  if (isGroup) {
    result.isGroup = isGroup;
  }

  const isGroupMember = (track.getProperty("is_grouped") as number) > 0;

  if (isGroupMember) {
    result.isGroupMember = isGroupMember;
  }
}

/**
 * Add track index property based on category
 * @param result - Result object to modify
 * @param category - Track category (regular, return, or master)
 * @param trackIndex - Track index
 */
export function addCategoryIndex(
  result: Record<string, unknown>,
  category: string,
  trackIndex: number | null,
): void {
  if (category === "regular") {
    result.trackIndex = trackIndex;
  } else if (category === "return") {
    result.returnTrackIndex = trackIndex;
  }
}

/**
 * Clean up device chains from result
 * @param result - Result object containing device chains
 */
export function cleanupDeviceChains(
  result: Record<string, unknown> & DeviceResult,
): void {
  if (result.midiEffects) {
    result.midiEffects = cleanupInternalDrumPads(
      result.midiEffects,
    ) as object[];
  }

  if (result.instrument) {
    result.instrument = cleanupInternalDrumPads(result.instrument) as
      | object
      | null;
  }

  if (result.audioEffects) {
    result.audioEffects = cleanupInternalDrumPads(
      result.audioEffects,
    ) as object[];
  }
}

/**
 * Add slot index properties for regular tracks
 * @param result - Result object to modify
 * @param track - Track object
 * @param category - Track category (regular, return, or master)
 */
export function addSlotIndices(
  result: Record<string, unknown>,
  track: LiveAPI,
  category: string,
): void {
  if (category !== "regular") {
    return;
  }

  const playingSlotIndex = track.getProperty("playing_slot_index") as number;

  if (playingSlotIndex >= 0) {
    result.playingSlotIndex = playingSlotIndex;
  }

  const firedSlotIndex = track.getProperty("fired_slot_index") as number;

  if (firedSlotIndex >= 0) {
    result.firedSlotIndex = firedSlotIndex;
  }
}

/**
 * Add state property if not default active state
 * @param result - Result object to modify
 * @param track - Track object
 * @param category - Track category (regular, return, or master)
 */
export function addStateIfNotDefault(
  result: Record<string, unknown>,
  track: LiveAPI,
  category: string,
): void {
  const trackState = computeState(track, category);

  if (trackState !== STATE.ACTIVE) {
    result.state = trackState;
  }
}

/**
 * Add routing information if requested
 * @param result - Result object to modify
 * @param track - Track object
 * @param category - Track category (regular, return, or master)
 * @param isGroup - Whether the track is a group
 * @param canBeArmed - Whether the track can be armed
 * @param includeRoutings - Whether to include current routing info
 * @param includeAvailableRoutings - Whether to include available routing options
 */
export function addRoutingInfo(
  result: Record<string, unknown>,
  track: LiveAPI,
  category: string,
  isGroup: boolean,
  canBeArmed: boolean,
  includeRoutings: boolean,
  includeAvailableRoutings: boolean,
): void {
  if (includeRoutings) {
    Object.assign(
      result,
      processCurrentRouting(track, category, isGroup, canBeArmed),
    );
  }

  if (includeAvailableRoutings) {
    Object.assign(result, processAvailableRouting(track, category, isGroup));
  }
}

/**
 * Add producer pal host information if applicable
 * @param result - Result object to modify
 * @param isProducerPalHost - Whether this is the Producer Pal host track
 */
export function addProducerPalHostInfo(
  result: Record<string, unknown>,
  isProducerPalHost: boolean,
): void {
  if (isProducerPalHost) {
    result.hasProducerPalDevice = true;
    result.producerPalVersion = VERSION;
  }
}

/**
 * Read mixer device properties (gain, panning, and sends)
 * @param track - Track object
 * @param returnTrackNames - Array of return track names for sends
 * @returns Object with gain, pan, and sends properties, or empty if mixer doesn't exist
 */
export function readMixerProperties(
  track: LiveAPI,
  returnTrackNames?: string[],
): MixerResult {
  const mixer = LiveAPI.from(track.path + " mixer_device");

  if (!mixer.exists()) {
    return {};
  }

  const result: MixerResult = {};

  // Read gain
  const volume = LiveAPI.from(mixer.path + " volume");

  if (volume.exists()) {
    result.gainDb = volume.getProperty("display_value");
  }

  // Read panning mode
  const panningMode = mixer.getProperty("panning_mode");
  const isSplitMode = panningMode === 1;

  result.panningMode = isSplitMode ? "split" : "stereo";

  // Read panning based on mode
  if (isSplitMode) {
    const leftSplit = LiveAPI.from(mixer.path + " left_split_stereo");
    const rightSplit = LiveAPI.from(mixer.path + " right_split_stereo");

    if (leftSplit.exists()) {
      result.leftPan = leftSplit.getProperty("value");
    }

    if (rightSplit.exists()) {
      result.rightPan = rightSplit.getProperty("value");
    }
  } else {
    const panning = LiveAPI.from(mixer.path + " panning");

    if (panning.exists()) {
      result.pan = panning.getProperty("value");
    }
  }

  // Read sends
  const sends = mixer.getChildren("sends");

  if (sends.length > 0) {
    // Fetch return track names if not provided
    let names = returnTrackNames;

    if (!names) {
      const liveSet = LiveAPI.from("live_set");
      const returnTrackIds = liveSet.getChildIds("return_tracks");

      names = returnTrackIds.map((_, idx) => {
        const rt = LiveAPI.from(`live_set return_tracks ${idx}`);

        return rt.getProperty("name") as string;
      });
    }

    // Warn if send count doesn't match return track count
    if (sends.length !== names.length) {
      console.error(
        `Send count (${sends.length}) doesn't match return track count (${names.length})`,
      );
    }

    result.sends = sends.map((send, i) => ({
      gainDb: send.getProperty("display_value"),
      return: names[i] ?? `Return ${i + 1}`,
    }));
  }

  return result;
}
