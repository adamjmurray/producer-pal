// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/max/v8-max-console.ts";
import { isDrumRackForTrack } from "#src/tools/clip/read/helpers/clip-resolution.ts";
import { DEVICE_TYPE, STATE } from "#src/tools/constants.ts";
import { getDeviceType } from "#src/tools/shared/device/device-reader.ts";
import { computeState } from "#src/tools/shared/device/helpers/chain-info.ts";
import {
  readReturnTrackInfo,
  type ReturnTrackInfo,
} from "#src/tools/shared/sends/return-track-info.ts";
import {
  parseIncludeArray,
  READ_CLIP_DEFAULTS,
} from "#src/tools/shared/tool-framework/include-params.ts";
import {
  roundDisplayValue,
  roundGainDb,
  roundPan,
} from "#src/tools/shared/helpers/rounding.ts";
import {
  processAvailableRouting,
  processCurrentRouting,
} from "#src/tools/track/helpers/track-routing.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";

interface SendInfo {
  gainDb: unknown;
  return: string;
  /** Omitted when no return track lines up with this send */
  returnId?: string;
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
 * @param returnTracks - The Live Set's return tracks, when the caller already read them
 * @returns Object with gain, pan, and sends properties, or empty if mixer doesn't exist
 */
export function readMixerProperties(
  track: LiveAPI,
  returnTracks?: ReturnTrackInfo[],
): MixerResult {
  const mixer = track.child("mixer_device");

  if (!mixer.exists()) {
    return {};
  }

  const result: MixerResult = {};

  // Read gain
  const volume = mixer.child("volume");

  if (volume.exists()) {
    result.gainDb = readGainDb(volume);
  }

  // Read panning mode
  const panningMode = mixer.getProperty("panning_mode");
  const isSplitMode = panningMode === 1;

  // Only include panningMode when non-default (split)
  if (isSplitMode) {
    result.panningMode = "split";
  }

  // Read panning based on mode
  if (isSplitMode) {
    const leftSplit = mixer.child("left_split_stereo");
    const rightSplit = mixer.child("right_split_stereo");

    if (leftSplit.exists()) {
      result.leftPan = readPan(leftSplit);
    }

    if (rightSplit.exists()) {
      result.rightPan = readPan(rightSplit);
    }
  } else {
    const panning = mixer.child("panning");

    if (panning.exists()) {
      result.pan = readPan(panning);
    }
  }

  // Read sends
  const sends = mixer.getChildren("sends");

  if (sends.length > 0) {
    const returns = returnTracks ?? readReturnTrackInfo();

    // Warn if send count doesn't match return track count
    if (sends.length !== returns.length) {
      console.warn(
        `Send count (${sends.length}) on track ${targetLabel(track)} doesn't match return track count (${returns.length})`,
      );
    }

    result.sends = sends.map((send, i) => {
      const info = returns[i];

      return {
        gainDb: readGainDb(send),
        return: info?.name ?? `Return ${i + 1}`,
        // Names collide and get renamed, so the id is what a write quotes back.
        ...(info == null ? {} : { returnId: info.id }),
      };
    });
  }

  return result;
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

  throw new Error(`${indexType} ${trackIndex} does not exist`);
}

/**
 * Drum-rack detection for one track read, computed at most once and only if
 * something asks. `isDrumRackForTrack` walks the track's whole device tree, and
 * a track read can need the answer three times (session clips, arrangement
 * clips, take lanes) — so the three shared one call instead of walking three
 * times. Still lazy: a group or return track reads no clips at all, and must
 * not pay for a walk nothing consumes.
 *
 * @param track - The track being read
 * @param include - The include array threaded to the nested clip reads
 * @returns A getter for whether nested clip reads should use drum mode
 */
export function drumModeForTrack(
  track: LiveAPI,
  include?: string[],
): () => boolean {
  let answer: boolean | null = null;

  return () =>
    (answer ??= clipReadsWantNotes(include) && isDrumRackForTrack(track));
}

/**
 * Read a pan parameter, rounded to Live's 1% steps
 * @param param - Panning DeviceParameter
 * @returns Pan from -1 to 1
 */
function readPan(param: LiveAPI): unknown {
  return roundDisplayValue(param.getProperty("value"), roundPan);
}

/**
 * Read a gain parameter, rounded to Live's 0.01 dB display steps
 * @param param - Volume or send DeviceParameter
 * @returns Gain in dB
 */
function readGainDb(param: LiveAPI): unknown {
  return roundDisplayValue(param.getProperty("display_value"), roundGainDb);
}

/**
 * Whether nested clip reads for this track will serialize notes — the only case
 * drum-rack detection feeds. Mirrors readOneClip's own include gating
 * (READ_CLIP_DEFAULTS), so the drum-rack device walk is skipped when notes
 * aren't requested (e.g. a clips-without-notes track read).
 * @param include - The include array threaded to the nested clip reads
 * @returns True when the nested reads will format notes
 */
function clipReadsWantNotes(include?: string[]): boolean {
  return parseIncludeArray(include, READ_CLIP_DEFAULTS).includeClipNotes;
}
