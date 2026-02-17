// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/v8-max-console.ts";
import {
  readClip,
  type ReadClipResult,
} from "#src/tools/clip/read/read-clip.ts";
import { DEVICE_TYPE, STATE } from "#src/tools/constants.ts";
import { getDeviceType } from "#src/tools/shared/device/device-reader.ts";
import { computeState } from "#src/tools/shared/device/helpers/device-state-helpers.ts";
import {
  processAvailableRouting,
  processCurrentRouting,
} from "#src/tools/track/helpers/track-routing-helpers.ts";

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
): ReadClipResult[] {
  return track
    .getChildIds("clip_slots")
    .map((_clipSlotId, sceneIndex) =>
      readClip({
        trackIndex,
        sceneIndex,
        suppressEmptyWarning: true,
        ...(include && { include }),
      }),
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
        livePath
          .track(trackIndex as number)
          .clipSlot(sceneIndex)
          .clip(),
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
): ReadClipResult[] {
  return track
    .getChildIds("arrangement_clips")
    .map((clipId) =>
      readClip({
        clipId,
        ...(include && { include }),
      }),
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
 * Find the first instrument device on a track and return its class_display_name
 * @param devices - Array of LiveAPI device objects from track
 * @returns The instrument's class_display_name, or null if no instrument found
 */
export function getInstrumentName(devices: LiveAPI[]): string | null {
  for (const device of devices) {
    const deviceType = getDeviceType(device);

    if (
      deviceType === DEVICE_TYPE.INSTRUMENT ||
      deviceType === DEVICE_TYPE.INSTRUMENT_RACK ||
      deviceType === DEVICE_TYPE.DRUM_RACK
    ) {
      return device.getProperty("class_display_name") as string;
    }
  }

  return null;
}

/**
 * Handle track that doesn't exist by throwing an error
 * @param category - Track category (regular, return, or master)
 * @param trackIndex - Track index
 * @throws Error indicating the track does not exist
 */
export function handleNonExistentTrack(
  category: string,
  trackIndex: number | null,
): never {
  const indexType = category === "return" ? "returnTrackIndex" : "trackIndex";

  throw new Error(`readTrack: ${indexType} ${trackIndex} does not exist`);
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
  result.category = category;

  if (category === "regular") {
    result.trackIndex = trackIndex;
  } else if (category === "return") {
    result.returnTrackIndex = trackIndex;
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
      const liveSet = LiveAPI.from(livePath.liveSet);
      const returnTrackIds = liveSet.getChildIds("return_tracks");

      names = returnTrackIds.map((_, idx) => {
        const rt = LiveAPI.from(livePath.returnTrack(idx));

        return rt.getProperty("name") as string;
      });
    }

    // Warn if send count doesn't match return track count
    if (sends.length !== names.length) {
      console.warn(
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
