// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { assertDefined } from "#src/shared/error-utils.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  LIVE_API_MONITORING_STATE_AUTO,
  LIVE_API_MONITORING_STATE_IN,
  LIVE_API_MONITORING_STATE_OFF,
  MONITORING_STATE,
} from "#src/tools/constants.ts";
import { stripReturnTrackLetter } from "../helpers/track-name-helpers.ts";
import { applyMixerProperties } from "./helpers/update-track-mixer-helpers.ts";
import { applyRoutingProperties } from "./helpers/update-track-routing-helpers.ts";
import { verifyColorQuantization } from "#src/tools/shared/color-verification-helpers.ts";
import { setParamIfEnabled } from "#src/tools/shared/device/helpers/param-write-helpers.ts";
import {
  findReturnIndex,
  targetEntries,
  namedIdParam,
  unwrapSingleResult,
} from "#src/tools/shared/utils.ts";
import {
  getColorForIndex,
  parseColors,
} from "#src/tools/shared/validation/color-utils.ts";
import { validateIdTypes } from "#src/tools/shared/validation/id-validation.ts";
import { pathField } from "#src/tools/shared/validation/object-path-for-api.ts";
import {
  getNameForIndex,
  parseNames,
} from "#src/tools/shared/validation/name-utils.ts";
import { validateListLengths } from "#src/tools/shared/validation/list-lengths.ts";

interface UpdateTrackArgs {
  id?: string;
  /** Hidden alias for id */
  ids?: string;
  name?: string;
  color?: string;
  gainDb?: number;
  pan?: number;
  panningMode?: string;
  leftPan?: number;
  rightPan?: number;
  mute?: boolean;
  solo?: boolean;
  arm?: boolean;
  inputRoutingType?: string;
  inputRoutingChannel?: string;
  outputRoutingType?: string;
  outputRoutingChannel?: string;
  /** Deprecated: use inputRoutingType */
  inputRoutingTypeId?: string;
  /** Deprecated: use inputRoutingChannel */
  inputRoutingChannelId?: string;
  /** Deprecated: use outputRoutingType */
  outputRoutingTypeId?: string;
  /** Deprecated: use outputRoutingChannel */
  outputRoutingChannelId?: string;
  monitoringState?: string;
  sendGainDb?: number;
  sendReturn?: string;
}

interface UpdateTrackResult {
  id: string;
  path?: string;
}

/**
 * Apply monitoring state to a track. Monitoring exists only on armable tracks,
 * so it is warn-and-skipped on non-armable tracks (return/master) — mirroring
 * the read-side `canBeArmed` guard in track-routing-helpers.ts.
 * @param track - Track object
 * @param monitoringState - Monitoring state value (in, auto, off)
 */
function applyMonitoringState(
  track: LiveAPI,
  monitoringState: string | undefined,
): void {
  if (monitoringState == null) {
    return;
  }

  const canBeArmed = (track.getProperty("can_be_armed") as number) > 0;

  if (!canBeArmed) {
    console.warn(
      `updateTrack: monitoringState is only available on armable tracks; skipping for track ${track.id}`,
    );

    return;
  }

  const monitoringValue: number | undefined = {
    [MONITORING_STATE.IN]: LIVE_API_MONITORING_STATE_IN,
    [MONITORING_STATE.AUTO]: LIVE_API_MONITORING_STATE_AUTO,
    [MONITORING_STATE.OFF]: LIVE_API_MONITORING_STATE_OFF,
  }[monitoringState];

  if (monitoringValue == null) {
    console.warn(
      `invalid monitoring state "${monitoringState}". Must be one of: ${Object.values(MONITORING_STATE).join(", ")}`,
    );

    return;
  }

  track.set("current_monitoring_state", monitoringValue);
}

/**
 * Apply send properties to a track
 * @param track - Track object
 * @param sendGainDb - Send gain in dB (-70 to 0)
 * @param sendReturn - Return track id, name, or letter prefix
 */
function applySendProperties(
  track: LiveAPI,
  sendGainDb: number | undefined,
  sendReturn: string | undefined,
): void {
  // Validate both params provided together
  if ((sendGainDb != null) !== (sendReturn != null)) {
    console.warn("sendGainDb and sendReturn must both be specified");

    return;
  }

  if (sendGainDb == null || sendReturn == null) {
    return;
  }

  // Get mixer and sends
  const mixer = track.child("mixer_device");

  if (!mixer.exists()) {
    console.warn(`track ${track.id} has no mixer device`);

    return;
  }

  const sends = mixer.getChildren("sends");

  if (sends.length === 0) {
    console.warn(`track ${track.id} has no sends`);

    return;
  }

  const returnTracks = LiveAPI.from(livePath.liveSet).getChildren(
    "return_tracks",
  );
  const names = returnTracks.map((rt) => rt.getProperty("name") as string);
  const sendIndex = findReturnIndex(
    names,
    sendReturn,
    returnTracks.map((rt) => rt.id),
  );

  if (sendIndex === -1) {
    console.warn(`no return track found matching "${sendReturn}"`);

    return;
  }

  if (sendIndex >= sends.length) {
    console.warn(`send ${sendIndex} doesn't exist on track ${track.id}`);

    return;
  }

  setParamIfEnabled(
    assertDefined(sends[sendIndex], `send at index ${sendIndex}`),
    "display_value",
    sendGainDb,
    `updateTrack: send "${names[sendIndex]}"`,
  );
}

/**
 * Updates properties of existing tracks
 * @param args - The track parameters
 * @param args.id - Track ID or comma-separated list of track IDs to update
 * @param args.ids - Hidden alias for id
 * @param args.name - Optional track name
 * @param args.color - Optional track color (CSS format: hex)
 * @param args.gainDb - Optional track gain in dB (-70 to 6)
 * @param args.pan - Optional pan position in stereo mode (-1 to 1)
 * @param args.panningMode - Optional panning mode ('stereo' or 'split')
 * @param args.leftPan - Optional left channel pan in split mode (-1 to 1)
 * @param args.rightPan - Optional right channel pan in split mode (-1 to 1)
 * @param args.mute - Optional mute state
 * @param args.solo - Optional solo state
 * @param args.arm - Optional arm state
 * @param args.inputRoutingType - Optional input routing type name or identifier
 * @param args.inputRoutingChannel - Optional input routing channel name or identifier
 * @param args.outputRoutingType - Optional output routing type name or identifier
 * @param args.outputRoutingChannel - Optional output routing channel name or identifier
 * @param args.inputRoutingTypeId - Deprecated alias for inputRoutingType
 * @param args.inputRoutingChannelId - Deprecated alias for inputRoutingChannel
 * @param args.outputRoutingTypeId - Deprecated alias for outputRoutingType
 * @param args.outputRoutingChannelId - Deprecated alias for outputRoutingChannel
 * @param args.monitoringState - Optional monitoring state ('in', 'auto', 'off')
 * @param args.sendGainDb - Optional send gain in dB (-70 to 0), requires sendReturn
 * @param args.sendReturn - Optional return track id, name, or letter prefix, requires sendGainDb
 * @param _context - Internal context object (unused)
 * @returns Single track object or array of track objects
 */
export function updateTrack(
  {
    id,
    ids,
    name,
    color,
    gainDb,
    pan,
    panningMode,
    leftPan,
    rightPan,
    mute,
    solo,
    arm,
    inputRoutingType,
    inputRoutingChannel,
    outputRoutingType,
    outputRoutingChannel,
    inputRoutingTypeId,
    inputRoutingChannelId,
    outputRoutingTypeId,
    outputRoutingChannelId,
    monitoringState,
    sendGainDb,
    sendReturn,
  }: UpdateTrackArgs,
  _context: Partial<ToolContext> = {},
): UpdateTrackResult | UpdateTrackResult[] {
  const targets = namedIdParam(id, ids, "ids");

  if (!targets) {
    console.warn("updateTrack: id is required");

    return [];
  }

  // Every list in the call is checked together, before any of them is split:
  // once one is split nothing knows whether the others are lists at all.
  validateListLengths([
    { param: "id", value: targets },
    { param: "name", value: name },
    { param: "color", value: color },
  ]);

  // Parse comma-separated string into array. An id that parses to nothing
  // (e.g. ",  ,") was still sent, so it gets a word of its own rather than
  // reading the same as an omitted id.
  const trackIds = targetEntries(targets, "id");

  // Parse names/colors against the original id count so the positional mapping
  // (name[k]/color[k] → ids[k]) survives even when an invalid id is skipped
  // mid-list — otherwise every later name/color shifts onto the wrong track.
  const parsedNames = parseNames(name, trackIds.length, "track");
  const parsedColors = parseColors(color, trackIds.length, "track");

  const updatedTracks: UpdateTrackResult[] = [];

  for (let i = 0; i < trackIds.length; i++) {
    // Validate one id at a time (skip invalid) so the loop index stays aligned
    // to the original ids: a skipped id must not pull later names/colors forward
    // onto the wrong track.
    const [track] = validateIdTypes(
      [trackIds[i] as string],
      "track",
      "updateTrack",
      { skipInvalid: true },
    );

    if (track == null) continue;

    const trackColor = getColorForIndex(color, i, parsedColors);

    const trackName = getNameForIndex(name, i, parsedNames);

    track.setAll({
      name:
        trackName == null
          ? undefined
          : stripReturnTrackLetter(track.path, trackName),
      color: trackColor,
      mute,
      solo,
      arm,
    });

    // Verify color quantization if color was set
    if (trackColor != null) {
      verifyColorQuantization(track, trackColor);
    }

    // Handle mixer properties
    if (
      gainDb != null ||
      pan != null ||
      panningMode != null ||
      leftPan != null ||
      rightPan != null
    ) {
      applyMixerProperties(track, {
        gainDb,
        pan,
        panningMode,
        leftPan,
        rightPan,
      });
    }

    // Handle routing properties
    applyRoutingProperties(track, {
      inputRoutingType: inputRoutingType ?? inputRoutingTypeId,
      inputRoutingChannel: inputRoutingChannel ?? inputRoutingChannelId,
      outputRoutingType: outputRoutingType ?? outputRoutingTypeId,
      outputRoutingChannel: outputRoutingChannel ?? outputRoutingChannelId,
    });

    // Handle monitoring state
    applyMonitoringState(track, monitoringState);

    // Handle send properties
    applySendProperties(track, sendGainDb, sendReturn);

    // Build optimistic result object
    updatedTracks.push({
      id: track.id,
      ...pathField(track),
    });
  }

  return unwrapSingleResult(updatedTracks);
}
