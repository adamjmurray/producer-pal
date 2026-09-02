// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { type Notation } from "#src/shared/notation.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { isDrumRackForTrack } from "#src/tools/clip/read/helpers/read-clip-helpers.ts";
import {
  readClip,
  type ReadClipResult,
} from "#src/tools/clip/read/read-clip.ts";
import { DEVICE_TYPE, STATE } from "#src/tools/constants.ts";
import { getDeviceType } from "#src/tools/shared/device/device-reader.ts";
import { computeState } from "#src/tools/shared/device/helpers/device-state-helpers.ts";
import {
  parseIncludeArray,
  READ_CLIP_DEFAULTS,
} from "#src/tools/shared/tool-framework/include-params.ts";
import { roundPan, stripFields } from "#src/tools/shared/utils.ts";
import { arrangementPath } from "#src/tools/shared/validation/object-path-helpers.ts";
import {
  processAvailableRouting,
  processCurrentRouting,
} from "#src/tools/track/helpers/track-routing-helpers.ts";

/** A non-main take lane with its name and arrangement clips */
export interface ReadTakeLaneResult {
  /** The lane's path ("t0/l0"), which pastes back into any path/toPath param.
   * Saves a consumer inferring the index from array position. */
  path: string;
  name: string;
  clips: ReadClipResult[];
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
 * @param isDrumMode - Whether nested clip reads use drum mode (see drumModeForTrack)
 * @param include - Include array for nested reads
 * @param notation - Active notation for nested clip note formatting
 * @returns Array of clip objects (only clips that exist)
 */
export function readSessionClips(
  track: LiveAPI,
  trackIndex: number | null,
  isDrumMode: () => boolean,
  include?: string[],
  notation?: Notation,
): ReadClipResult[] {
  const drumMode = isDrumMode();

  return track
    .getChildIds("clip_slots")
    .map((_clipSlotId, sceneIndex) =>
      readClip(
        {
          trackIndex,
          sceneIndex,
          suppressEmptyWarning: true,
          slotValidated: true,
          drumMode,
          ...(include && { include }),
        },
        { notation },
      ),
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
 * @param isDrumMode - Whether nested clip reads use drum mode (see drumModeForTrack)
 * @param include - Include array for nested reads
 * @param notation - Active notation for nested clip note formatting
 * @returns Array of clip objects (only clips that exist)
 */
export function readArrangementClips(
  track: LiveAPI,
  isDrumMode: () => boolean,
  include?: string[],
  notation?: Notation,
): ReadClipResult[] {
  const drumMode = isDrumMode();

  return track
    .getChildIds("arrangement_clips")
    .map((clipId) =>
      readClip(
        {
          id: clipId,
          drumMode,
          ...(include && { include }),
        },
        { notation },
      ),
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
 * Read all non-main take lanes from a track. Take lanes are arrangement-only
 * and the main lane is not included in the track's take_lanes collection.
 * @param track - Track object
 * @param trackIndex - Track index, for the lane paths
 * @param isDrumMode - Whether nested clip reads use drum mode (see drumModeForTrack)
 * @param include - Include array for nested clip reads
 * @param notation - Active notation for nested clip note formatting
 * @returns Array of take lanes, each with its name and arrangement clips
 */
export function readTakeLanes(
  track: LiveAPI,
  trackIndex: number | null,
  isDrumMode: () => boolean,
  include?: string[],
  notation?: Notation,
): ReadTakeLaneResult[] {
  const drumMode = isDrumMode();

  return track.getChildren("take_lanes").map((lane, i) => {
    const clips = lane
      .getChildIds("arrangement_clips")
      .map((clipId) =>
        readClip(
          { id: clipId, drumMode, ...(include && { include }) },
          { notation },
        ),
      )
      .filter((clip) => clip.id != null);

    // Strip fields redundant with the parent context (take lane clips are
    // always arrangement clips on this track, matching its MIDI/audio type, and
    // the lane's own path is on the parent ReadTakeLaneResult).
    stripFields(clips, "path", "view", "type");

    return {
      path: arrangementPath(trackIndex as number, i),
      name: lane.getProperty("name") as string,
      clips,
    };
  });
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
  const mixer = track.child("mixer_device");

  if (!mixer.exists()) {
    return {};
  }

  const result: MixerResult = {};

  // Read gain
  const volume = mixer.child("volume");

  if (volume.exists()) {
    result.gainDb = volume.getProperty("display_value");
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

/**
 * Read a pan parameter, rounded to Live's 1% steps
 * @param param - Panning DeviceParameter
 * @returns Pan from -1 to 1
 */
function readPan(param: LiveAPI): unknown {
  const pan = param.getProperty("value");

  return typeof pan === "number" ? roundPan(pan) : pan;
}

/**
 * Whether nested clip reads for this track will serialize notes — the only case
 * drum-rack detection feeds. Mirrors readClip's own include gating
 * (READ_CLIP_DEFAULTS), so the drum-rack device walk is skipped when notes
 * aren't requested (e.g. a clips-without-notes track read).
 * @param include - The include array threaded to the nested clip reads
 * @returns True when the nested reads will format notes
 */
function clipReadsWantNotes(include?: string[]): boolean {
  return parseIncludeArray(include, READ_CLIP_DEFAULTS).includeClipNotes;
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
