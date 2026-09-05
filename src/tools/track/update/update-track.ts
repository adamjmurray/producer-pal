// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/max/v8-max-console.ts";
import {
  LIVE_API_MONITORING_STATE_AUTO,
  LIVE_API_MONITORING_STATE_IN,
  LIVE_API_MONITORING_STATE_OFF,
  MONITORING_STATE,
} from "#src/tools/constants.ts";
import { stripReturnTrackLetter } from "../helpers/track-name-helpers.ts";
import {
  type TrackMixerApplied,
  applyMixerProperties,
} from "./helpers/update-track-mixer-helpers.ts";
import { applyRoutingProperties } from "./helpers/update-track-routing-helpers.ts";
import {
  applyTrackSends,
  resolveTrackSends,
} from "./helpers/update-track-send-helpers.ts";
import { verifyColorQuantization } from "#src/tools/shared/color-verification-helpers.ts";
import {
  type SendResult,
  warnSendCollisions,
} from "#src/tools/shared/sends/send-list-helpers.ts";
import { type SendEntry } from "#src/tools/shared/sends/sends-schema.ts";
import {
  unwrapSingleResult,
  validateSendPair,
} from "#src/tools/shared/utils.ts";
import {
  getColorForIndex,
  parseColors,
} from "#src/tools/shared/validation/color-utils.ts";
import { validateIdTypes } from "#src/tools/shared/validation/id-validation.ts";
import {
  pathField,
  targetLabel,
} from "#src/tools/shared/validation/object-path-for-api.ts";
import {
  getNameForIndex,
  parseNames,
} from "#src/tools/shared/validation/name-utils.ts";
import { validateListLengths } from "#src/tools/shared/validation/lists/list-lengths.ts";
import {
  targetCount,
  targetIds,
} from "#src/tools/shared/validation/lists/target-lists.ts";
import { trackIdPerPath } from "#src/tools/shared/validation/path-target-lookup.ts";

interface UpdateTrackArgs {
  id?: string;
  /** Hidden alias for id */
  ids?: string;
  path?: string;
  /** Hidden alias for path */
  paths?: string;
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
  sends?: SendEntry[];
}

interface UpdateTrackResult extends TrackMixerApplied {
  id: string;
  path?: string;
  /** Every send the call wrote, read back off the track */
  sends?: SendResult[];
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
      `monitoringState is only available on armable tracks; skipping track ${targetLabel(track)}`,
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
 * Updates properties of existing tracks
 * @param args - The track parameters
 * @param args.id - Track ID or comma-separated list of track IDs to update
 * @param args.ids - Hidden alias for id
 * @param args.path - Track path(s) to update instead of ids, comma-separated
 * @param args.paths - Hidden alias for path
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
 * @param args.sends - Optional [{return, gainDb}] list, to set several at once
 * @param _context - Internal context object (unused)
 * @returns Single track object or array of track objects
 */
export function updateTrack(
  {
    id,
    ids,
    path,
    paths,
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
    sends,
  }: UpdateTrackArgs,
  _context: Partial<ToolContext> = {},
): UpdateTrackResult | UpdateTrackResult[] {
  const named = { id, ids, path, paths };

  if (targetCount(named) === 0) {
    throw new Error("id or path is required");
  }

  validateSendPair(sendGainDb, sendReturn);

  // Resolved once: the return tracks belong to the Live Set, so a per-track
  // lookup would repeat one warning down the list.
  const resolvedSends = resolveTrackSends(sendGainDb, sendReturn, sends);

  // Every list in the call is checked together, before any of them is split:
  // once one is split nothing knows whether the others are lists at all.
  validateListLengths([
    { param: "id and path", count: targetCount(named) },
    { param: "name", value: name },
    { param: "color", value: color },
  ]);

  const trackIds = targetIds(named, trackIdPerPath);

  // Parse names/colors against the original id count so the positional mapping
  // (name[k]/color[k] → ids[k]) survives even when an invalid id is skipped
  // mid-list — otherwise every later name/color shifts onto the wrong track.
  const parsedNames = parseNames(name, trackIds.length, "track");
  const parsedColors = parseColors(color, trackIds.length, "track");

  const updatedTracks: UpdateTrackResult[] = [];
  // The collisions belong to the call, not to a track, so they are announced
  // once — off the first track that actually wrote something to name.
  let announcedCollisions = false;

  for (let i = 0; i < trackIds.length; i++) {
    const trackId = trackIds[i];

    // A path that named no track already warned; it keeps its slot so later
    // names/colors don't shift onto the wrong track.
    if (trackId == null) continue;

    // Validate one id at a time (skip invalid) so the loop index stays aligned
    // to the original ids: a skipped id must not pull later names/colors forward
    // onto the wrong track.
    const [track] = validateIdTypes([trackId], "track", {
      skipInvalid: true,
    });

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
    let mixer: TrackMixerApplied = {};

    if (
      gainDb != null ||
      pan != null ||
      panningMode != null ||
      leftPan != null ||
      rightPan != null
    ) {
      mixer = applyMixerProperties(track, {
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

    const landed = applyTrackSends(track, resolvedSends.winners);

    if (!announcedCollisions && landed.size > 0) {
      warnSendCollisions(resolvedSends.collisions, landed);
      announcedCollisions = true;
    }

    // Optimistic except for the mixer and sends, read back off the track.
    updatedTracks.push({
      id: track.id,
      ...pathField(track),
      ...mixer,
      ...(landed.size > 0 ? { sends: [...landed.values()] } : {}),
    });
  }

  return unwrapSingleResult(updatedTracks);
}
