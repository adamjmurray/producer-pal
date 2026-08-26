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
import { verifyColorQuantization } from "#src/tools/shared/color-verification-helpers.ts";
import { setParamIfEnabled } from "#src/tools/shared/device/helpers/param-write-helpers.ts";
import {
  findReturnIndex,
  namedIdParam,
  parseCommaSeparatedIds,
  unwrapSingleResult,
} from "#src/tools/shared/utils.ts";
import {
  getColorForIndex,
  parseCommaSeparatedColors,
} from "#src/tools/shared/validation/color-utils.ts";
import { validateIdTypes } from "#src/tools/shared/validation/id-validation.ts";
import {
  getNameForIndex,
  parseNames,
} from "#src/tools/shared/validation/name-utils.ts";

interface RoutingParams {
  inputRoutingTypeId?: string;
  inputRoutingChannelId?: string;
  outputRoutingTypeId?: string;
  outputRoutingChannelId?: string;
}

interface MixerParams {
  gainDb?: number;
  pan?: number;
  panningMode?: string;
  leftPan?: number;
  rightPan?: number;
}

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
  inputRoutingTypeId?: string;
  inputRoutingChannelId?: string;
  outputRoutingTypeId?: string;
  outputRoutingChannelId?: string;
  monitoringState?: string;
  sendGainDb?: number;
  sendReturn?: string;
}

interface UpdateTrackResult {
  id: string;
}

/**
 * Apply routing properties to a track. Input routing exists only on regular,
 * non-group tracks, so it is warn-and-skipped on group/return/master tracks —
 * mirroring the read-side guard in track-routing-helpers.ts processCurrentRouting
 * (`!isGroup && category === "regular"`). Output routing applies to the tracks
 * that expose it (regular and return).
 * @param track - Track object
 * @param params - Routing properties
 */
function applyRoutingProperties(track: LiveAPI, params: RoutingParams): void {
  const {
    inputRoutingTypeId,
    inputRoutingChannelId,
    outputRoutingTypeId,
    outputRoutingChannelId,
  } = params;

  if (inputRoutingTypeId != null || inputRoutingChannelId != null) {
    const category = (track.category as string | undefined) ?? "regular";
    const isGroup = (track.getProperty("is_foldable") as number) > 0;

    if (isGroup || category !== "regular") {
      console.warn(
        `updateTrack: input routing is only available on regular non-group tracks; skipping for track ${track.id}`,
      );
    } else {
      if (inputRoutingTypeId != null) {
        track.setProperty("input_routing_type", {
          identifier: Number(inputRoutingTypeId),
        });
      }

      if (inputRoutingChannelId != null) {
        track.setProperty("input_routing_channel", {
          identifier: Number(inputRoutingChannelId),
        });
      }
    }
  }

  if (outputRoutingTypeId != null) {
    track.setProperty("output_routing_type", {
      identifier: Number(outputRoutingTypeId),
    });
  }

  if (outputRoutingChannelId != null) {
    track.setProperty("output_routing_channel", {
      identifier: Number(outputRoutingChannelId),
    });
  }
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
 * Apply stereo panning and warn about invalid params
 * @param mixer - Mixer device object
 * @param pan - Pan value
 * @param leftPan - Left pan value
 * @param rightPan - Right pan value
 */
function applyStereoPan(
  mixer: LiveAPI,
  pan: number | undefined,
  leftPan: number | undefined,
  rightPan: number | undefined,
): void {
  if (pan != null) {
    const panning = mixer.child("panning");

    if (panning.exists()) {
      setParamIfEnabled(panning, "value", pan, "updateTrack: pan");
    }
  }

  if (leftPan != null || rightPan != null) {
    console.warn(
      "updateTrack: leftPan and rightPan have no effect in stereo panning mode. " +
        "Set panningMode to 'split' or use 'pan' instead.",
    );
  }
}

/**
 * Apply split panning and warn about invalid params
 * @param mixer - Mixer device object
 * @param pan - Pan value
 * @param leftPan - Left pan value
 * @param rightPan - Right pan value
 */
function applySplitPan(
  mixer: LiveAPI,
  pan: number | undefined,
  leftPan: number | undefined,
  rightPan: number | undefined,
): void {
  if (leftPan != null) {
    const leftSplit = mixer.child("left_split_stereo");

    if (leftSplit.exists()) {
      setParamIfEnabled(leftSplit, "value", leftPan, "updateTrack: leftPan");
    }
  }

  if (rightPan != null) {
    const rightSplit = mixer.child("right_split_stereo");

    if (rightSplit.exists()) {
      setParamIfEnabled(rightSplit, "value", rightPan, "updateTrack: rightPan");
    }
  }

  if (pan != null) {
    console.warn(
      "updateTrack: pan has no effect in split panning mode. " +
        "Set panningMode to 'stereo' or use leftPan/rightPan instead.",
    );
  }
}

/**
 * Apply mixer properties (gain and panning) to a track
 * @param track - Track object
 * @param params - Mixer properties
 */
function applyMixerProperties(track: LiveAPI, params: MixerParams): void {
  const { gainDb, pan, panningMode, leftPan, rightPan } = params;

  const mixer = track.child("mixer_device");

  if (!mixer.exists()) {
    return;
  }

  // Handle gain (independent of panning mode)
  if (gainDb != null) {
    const volume = mixer.child("volume");

    if (volume.exists()) {
      setParamIfEnabled(volume, "display_value", gainDb, "updateTrack: gainDb");
    }
  }

  // Get current panning mode
  const currentMode = mixer.getProperty("panning_mode");
  const currentIsSplit = currentMode === 1;

  // Set new panning mode if provided
  if (panningMode != null) {
    const newMode = panningMode === "split" ? 1 : 0;

    mixer.set("panning_mode", newMode);
  }

  // Determine effective mode for validation
  const effectiveMode = panningMode ?? (currentIsSplit ? "split" : "stereo");

  // Handle panning based on effective mode
  if (effectiveMode === "stereo") {
    applyStereoPan(mixer, pan, leftPan, rightPan);
  } else {
    applySplitPan(mixer, pan, leftPan, rightPan);
  }
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
 * @param args.inputRoutingTypeId - Optional input routing type identifier
 * @param args.inputRoutingChannelId - Optional input routing channel identifier
 * @param args.outputRoutingTypeId - Optional output routing type identifier
 * @param args.outputRoutingChannelId - Optional output routing channel identifier
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

  // Parse comma-separated string into array
  const trackIds = parseCommaSeparatedIds(targets);

  // Parse names/colors against the original id count so the positional mapping
  // (name[k]/color[k] → ids[k]) survives even when an invalid id is skipped
  // mid-list — otherwise every later name/color shifts onto the wrong track.
  const parsedNames = parseNames(name, trackIds.length, "updateTrack");
  const parsedColors = parseCommaSeparatedColors(color, trackIds.length);

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

    track.setAll({
      name: getNameForIndex(name, i, parsedNames),
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
      inputRoutingTypeId,
      inputRoutingChannelId,
      outputRoutingTypeId,
      outputRoutingChannelId,
    });

    // Handle monitoring state
    applyMonitoringState(track, monitoringState);

    // Handle send properties
    applySendProperties(track, sendGainDb, sendReturn);

    // Build optimistic result object
    updatedTracks.push({
      id: track.id,
    });
  }

  return unwrapSingleResult(updatedTracks);
}
